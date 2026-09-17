import type { MetadataRoute } from 'next';
import { withDbRetry } from '@/lib/db';
import { getSiteUrl } from '@/lib/site';

// 每小時重新產生一次：新發布的文章最遲 1 小時內出現在 sitemap，不需重新部署
export const revalidate = 3600;

interface SitemapPostRow {
  id: number;
  title: string;
  post_date: string;
  image_url: string | null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  // 固定頁面
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/reader`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  // 動態文章頁：只有已發布（未刪除、日期 ≤ 今天）的文章才進地圖
  try {
    const rows = await withDbRetry<SitemapPostRow[]>(
      (sql) => sql`
        SELECT id, title, post_date::text AS post_date, image_url
        FROM posts
        WHERE is_deleted = false
          AND post_date <= (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date
        ORDER BY post_date DESC, id DESC
      `,
      { retryAfterSent: true },
    );

    const postEntries: MetadataRoute.Sitemap = rows.map((p) => {
      // post_date 是 YYYY-MM-DD，補上香港時區成為合法 ISO 時間
      const lastModified = new Date(`${p.post_date}T00:00:00+08:00`);
      const entry: MetadataRoute.Sitemap[number] = {
        url: `${siteUrl}/?postId=${p.id}`,
        lastModified,
        changeFrequency: 'monthly',
        priority: 0.7,
      };
      // 有配圖的文章一併放進 image sitemap，幫助圖片搜尋收錄
      if (p.image_url) {
        entry.images = [
          p.image_url.startsWith('http') ? p.image_url : `${siteUrl}${p.image_url.startsWith('/') ? '' : '/'}${p.image_url}`,
        ];
      }
      return entry;
    });

    return [...staticEntries, ...postEntries];
  } catch (err) {
    // 資料庫冷啟動失敗時仍輸出固定頁面，不讓整個 sitemap 500
    console.error('sitemap 讀取文章失敗，僅輸出固定頁面:', err);
    return staticEntries;
  }
}
