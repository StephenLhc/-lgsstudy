// 全站 SEO／分享連結共用的網站常數與網址解析
//
// 正式網址優先序：
// 1. NEXT_PUBLIC_SITE_URL（日後購買自訂網域時，在 Vercel 環境變數設一次即可，程式碼不用改）
// 2. VERCEL_PROJECT_PRODUCTION_URL（Vercel 部署時自動注入，形如 lgsstudy.vercel.app）
// 3. http://localhost:3000（本機開發備援）

export const SITE_NAME = '讀經分享和心得';
export const SITE_SHORT_NAME = '樂研集';
export const SITE_DESCRIPTION =
  '每日讀經靈修分享、聖經經文反思與信仰心得，涵蓋詩篇、箴言、福音書等主題，歡迎閱讀、回應與分享。';
export const SITE_KEYWORDS = [
  '讀經',
  '靈修',
  '每日靈修',
  '聖經',
  '經文分享',
  '研經',
  '信仰反思',
  '基督徒生活',
  '詩篇',
  '箴言',
  '福音書',
  '樂研集',
];
export const SITE_LOCALE = 'zh_HK';

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteUrl(): string {
  const custom = process.env.NEXT_PUBLIC_SITE_URL;
  if (custom && custom.trim()) return normalize(custom);
  // Vercel 自動注入：production 部署為 xxx.vercel.app（或綁定的正式網域）
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel && vercel.trim()) return normalize(vercel);
  return 'http://localhost:3000';
}
