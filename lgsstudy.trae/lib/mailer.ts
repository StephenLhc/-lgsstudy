// 新回應電郵通知：讀者送出回應後，以 Resend HTTP API 通知牧者。
// 設定（.env.local）：
//   RESEND_API_KEY   — resend.com 免費註冊取得的 API Key
//   NOTIFY_EMAIL     — 收件人（牧者的電郵地址）
//   NOTIFY_FROM_EMAIL— （選填）寄件人，預設 onboarding@resend.dev；
//                      未驗證自有網域時，Resend 只允許寄給 Resend 帳號本人的電郵。
// 未設定金鑰或收件人時安全略過（僅記錄警告），絕不影響回應寫入。

interface NewCommentNotification {
  postId: number;
  postTitle: string;
  userName: string;
  salutation: string;
  ageGroup: string;
  faithYears: string;
  churchName: string;
  commentText: string;
  isPublic: boolean;
  createdAtHk: string; // 香港時間（YYYY-MM-DD HH24:MI）
  adminUrl: string; // 後台審核頁連結
}

// 簡單 HTML 逸出，防止留言內容破壞郵件排版
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br />');
}

export async function sendNewCommentNotification(input: NewCommentNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.NOTIFY_EMAIL?.trim();
  const from = process.env.NOTIFY_FROM_EMAIL?.trim() || 'onboarding@resend.dev';

  if (!apiKey || !to) {
    console.warn('⚠️ 尚未設定 RESEND_API_KEY 或 NOTIFY_EMAIL，略過新回應電郵通知');
    return;
  }

  const nameWithTitle = `${input.userName}${input.salutation ? ` ${input.salutation}` : ''}`;
  const subject = `【靈修文章網站】新回應待審核：《${input.postTitle}》— ${nameWithTitle}`;

  const infoRows: Array<[string, string]> = [
    ['文章', `《${input.postTitle}》`],
    ['回應者', nameWithTitle],
    ['年齡組別', input.ageGroup || '—'],
    ['信主年日', input.faithYears || '—'],
    ['教會', input.churchName || '—'],
    ['公開意願', input.isPublic ? '同意公開（仍需審核）' : '希望保密'],
    ['提交時間', `${input.createdAtHk}（香港時間）`],
  ];

  const infoTable = infoRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1e293b">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  const html = `
<div style="font-family:'Microsoft JhengHei',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
  <div style="background:#059669;padding:16px 24px">
    <h2 style="color:#ffffff;margin:0;font-size:18px">🔔 收到新回應（待審核）</h2>
  </div>
  <div style="padding:24px">
    <table style="font-size:14px;line-height:1.7">${infoTable}</table>
    <div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border-left:4px solid #059669;border-radius:4px;font-size:14px;line-height:1.8;color:#334155">
      ${escapeHtml(input.commentText)}
    </div>
    <p style="margin:24px 0 0">
      <a href="${escapeHtml(input.adminUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px">前往後台審核回應</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">此郵件由靈修文章網站自動發送，回應已存入資料庫，即使未開啟亦不會遺失。</p>
  </div>
</div>`;

  const text = [
    `收到新回應（待審核）`,
    `文章：《${input.postTitle}》`,
    `回應者：${nameWithTitle}`,
    `年齡組別：${input.ageGroup || '—'}`,
    `信主年日：${input.faithYears || '—'}`,
    `教會：${input.churchName || '—'}`,
    `公開意願：${input.isPublic ? '同意公開（仍需審核）' : '希望保密'}`,
    `提交時間：${input.createdAtHk}（香港時間）`,
    ``,
    `回應內容：`,
    input.commentText,
    ``,
    `前往後台審核：${input.adminUrl}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`❌ 新回應電郵通知發送失敗（HTTP ${res.status}）: ${detail.slice(0, 300)}`);
      return;
    }
    console.log(`✅ 新回應電郵通知已寄出（${input.postId}）`);
  } catch (error) {
    console.error('❌ 新回應電郵通知發送失敗:', error);
  }
}
