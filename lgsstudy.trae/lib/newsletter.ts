// 電郵訂閱（newsletter）核心函式
// 新文章發布時，自動寄給所有啟用中的訂閱者，附帶 token 型取消訂閱連結
import { randomBytes } from 'node:crypto';
import { withDbRetry } from './db';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 產生一次性的取消訂閱 token（32 個 hex 字元）
function genToken(): string {
  return randomBytes(16).toString('hex');
}

// 加入訂閱：email 重複時若原本已退訂（is_active=false）則重新啟用；已啟用則回已訂閱
export async function addSubscriber(email: string): Promise<{ ok: boolean; code: 'subscribed' | 'already' | 'invalid' | 'error'; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(clean)) {
    return { ok: false, code: 'invalid', message: '電郵格式不正確' };
  }
  try {
    const rows = await withDbRetry(
      (sql) => sql`SELECT id, is_active FROM subscribers WHERE email = ${clean}`,
      { retryAfterSent: false },
    );
    if (rows.length > 0) {
      if (rows[0].is_active) {
        return { ok: true, code: 'already', message: '此電郵已在訂閱名單中' };
      }
      // 重新啟用
      const token = genToken();
      await withDbRetry(
        (sql) => sql`UPDATE subscribers SET is_active = true, token = ${token} WHERE email = ${clean}`,
        { retryAfterSent: false },
      );
      return { ok: true, code: 'subscribed', message: '已重新訂閱新文章通知' };
    }
    const token = genToken();
    await withDbRetry(
      (sql) => sql`INSERT INTO subscribers (email, token, is_active) VALUES (${clean}, ${token}, true)`,
      { retryAfterSent: false },
    );
    return { ok: true, code: 'subscribed', message: '訂閱成功，新文章發布時會通知你' };
  } catch (error) {
    console.error('加入訂閱失敗:', error);
    return { ok: false, code: 'error', message: '訂閱失敗，請稍後再試' };
  }
}

// 以 token 取消訂閱（token 綁定 email，避免被惡意替他人退訂）
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string; message: string }> {
  const t = token.trim();
  if (!t) return { ok: false, message: '缺少取消訂閱代碼' };
  try {
    const rows = await withDbRetry(
      (sql) => sql`SELECT email FROM subscribers WHERE token = ${t} AND is_active = true`,
      { retryAfterSent: false },
    );
    if (rows.length === 0) {
      return { ok: false, message: '此訂閱代碼無效或已取消過' };
    }
    const email = rows[0].email as string;
    await withDbRetry(
      (sql) => sql`UPDATE subscribers SET is_active = false WHERE token = ${t}`,
      { retryAfterSent: false },
    );
    return { ok: true, email, message: '已取消訂閱' };
  } catch (error) {
    console.error('取消訂閱失敗:', error);
    return { ok: false, message: '取消訂閱失敗，請稍後再試' };
  }
}

// 取得所有啟用中的訂閱者（用於發送新文章通知）
export async function getActiveSubscribers(): Promise<Array<{ id: number; email: string; token: string }>> {
  return withDbRetry(
    (sql) => sql`SELECT id, email, token FROM subscribers WHERE is_active = true ORDER BY id`,
    { retryAfterSent: true },
  ) as Promise<Array<{ id: number; email: string; token: string }>>;
}

// 取得全部訂閱者（後台管理用）
export async function listAllSubscribers(): Promise<Array<{ id: number; email: string; is_active: boolean; created_at: string }>> {
  return withDbRetry(
    (sql) => sql`
      SELECT id, email, is_active,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM subscribers ORDER BY created_at DESC
    `,
    { retryAfterSent: true },
  ) as Promise<Array<{ id: number; email: string; is_active: boolean; created_at: string }>>;
}

interface NewPostMail {
  postId: number;
  title: string;
  scripture: string;
  category: string;
  content: string;
  imageUrl: string | null;
  postUrl: string;
  siteUrl: string;
}

// 寄送新文章通知給所有訂閱者
// 每封郵件都帶有該訂閱者專屬的取消訂閱連結（以 token 辨識）
export async function sendNewPostNotification(mail: NewPostMail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFY_FROM_EMAIL?.trim() || 'onboarding@resend.dev';
  if (!apiKey) {
    console.warn('⚠️ 尚未設定 RESEND_API_KEY，略過新文章訂閱郵件');
    return;
  }

  let subs: Array<{ id: number; email: string; token: string }>;
  try {
    subs = await getActiveSubscribers();
  } catch (error) {
    console.error('❌ 讀取訂閱者名單失敗:', error);
    return;
  }
  if (subs.length === 0) return;

  // 內文摘要（純文字，取前 300 字）
  const excerpt = mail.content
    .replace(/[#*_>`~\-\[\]()!|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) + (mail.content.length > 300 ? '…' : '');

  const subject = `【靈修文章網站】新文章：《${mail.title}》`;

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const unsubUrl = `${mail.siteUrl}/unsubscribe?token=${sub.token}`;
    const html = buildHtml(mail, unsubUrl, excerpt);
    const text = buildText(mail, unsubUrl, excerpt);

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to: [sub.email], subject, html, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        const detail = await res.text().catch(() => '');
        console.error(`❌ 訂閱郵件寄送至 ${sub.email} 失敗（HTTP ${res.status}）: ${detail.slice(0, 200)}`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ 訂閱郵件寄送至 ${sub.email} 失敗:`, error);
    }
  }

  console.log(`📬 新文章通知已寄出：成功 ${sent} 封，失敗 ${failed} 封（共 ${subs.length} 位訂閱者）`);
}

function buildHtml(mail: NewPostMail, unsubUrl: string, excerpt: string): string {
  const img = mail.imageUrl
    ? `<img src="${mail.imageUrl}" alt="" style="display:block;width:100%;max-width:560px;height:auto;border-radius:8px;margin:0 auto 16px" />`
    : '';
  return `<div style="font-family:'Microsoft JhengHei',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
  <div style="background:#059669;padding:16px 24px">
    <h2 style="color:#ffffff;margin:0;font-size:18px">📖 新靈修文章已發布</h2>
  </div>
  <div style="padding:24px">
    ${img}
    <h1 style="font-size:20px;color:#1e293b;margin:0 0 8px">${escapeHtml(mail.title)}</h1>
    <p style="color:#059669;font-weight:bold;margin:0 0 12px">${escapeHtml(mail.scripture)}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#475569">${escapeHtml(excerpt)}</p>
    <p style="margin:16px 0">
      <a href="${escapeHtml(mail.postUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px">閱讀完整文章</a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
      此郵件由靈修文章網站自動發送，因為你訂閱了新文章通知。<br/>
      <a href="${escapeHtml(unsubUrl)}" style="color:#64748b">取消訂閱</a>
    </p>
  </div>
</div>`;
}

function buildText(mail: NewPostMail, unsubUrl: string, excerpt: string): string {
  return [
    `新靈修文章已發布：${mail.title}`,
    `經文：${mail.scripture}`,
    ``,
    excerpt,
    ``,
    `閱讀完整文章：${mail.postUrl}`,
    ``,
    `取消訂閱：${unsubUrl}`,
  ].join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
