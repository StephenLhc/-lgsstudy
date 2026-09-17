import { withDbRetry } from '@/lib/db';
import { getSiteUrl, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { stripMarkdown } from '@/lib/seo-client';

// 與 sitemap 一致：每小時重新產生，新文章最遲 1 小時內進入 feed
export const revalidate = 3600;

interface FeedPostRow {
  id: number;
  title: string;
  scripture: string | null;
  category: string | null;
  content: string;
  post_date: string;
  image_url: string | null;
}

// XML 文字節點跳脫（標題、分類等純文字）
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// CDATA 區段保險處理（避免內容出現 ]]> 破壞格式）
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, ']]&gt;')}]]>`;
}

// RFC 822 格式日期，例如 Wed, 02 Oct 2026 00:00:00 +0800（RSS 2.0 標準要求）
function toRfc822(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+08:00`).toUTCString().replace('GMT', '+0000');
}

function absoluteUrl(siteUrl: string, src: string): string {
  if (src.startsWith('http')) return src;
  return `${siteUrl}${src.startsWith('/') ? '' : '/'}${src}`;
}

export async function GET() {
  const siteUrl = getSiteUrl();

  let rows: FeedPostRow[] = [];
  try {
    rows = await withDbRetry<FeedPostRow[]>(
      (sql) => sql`
        SELECT id, title, scripture, category, content,
               post_date::text AS post_date, image_url
        FROM posts
        WHERE is_deleted = false
          AND post_date <= (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date
        ORDER BY post_date DESC, id DESC
        LIMIT 50
      `,
      { retryAfterSent: true },
    );
  } catch (err) {
    // 資料庫冷啟動失敗仍回傳合法的空 feed（只有 channel），讓閱讀器稍後重試
    console.error('feed.xml 讀取文章失敗:', err);
  }

  const items = rows
    .map((p) => {
      const url = `${siteUrl}/?postId=${p.id}`;
      const excerpt = stripMarkdown(p.content, 200);
      const image = p.image_url ? absoluteUrl(siteUrl, p.image_url) : null;
      // 摘要前面放配圖，讓 Feedly 等閱讀器顯示預覽圖
      const descriptionHtml = `${image ? `<p><img src="${esc(image)}" alt="${esc(p.title)}"/></p>` : ''}<p>${esc(excerpt)}</p><p><a href="${esc(url)}">閱讀全文…</a></p>`;

      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${toRfc822(p.post_date)}</pubDate>
      ${p.category ? `<category>${esc(p.category)}</category>\n      ` : ''}${p.scripture ? `<category>${esc(p.scripture)}</category>\n      ` : ''}<description>${cdata(descriptionHtml)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${esc(siteUrl)}</link>
    <atom:link href="${esc(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>${esc(SITE_DESCRIPTION)}</description>
    <language>zh-HK</language>
    <lastBuildDate>${new Date().toUTCString().replace('GMT', '+0000')}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // CDN 快取 1 小時，過期後背景更新（stale-while-revalidate）
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
