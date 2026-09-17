import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 後台、API、回應表單、取消訂閱頁不開放收錄（無公開內容或含操作功能）
      disallow: ['/admin', '/api/', '/respond', '/unsubscribe'],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
