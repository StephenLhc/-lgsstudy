// Client 端單篇文章 SEO：
// 文章頁是 'use client' 且用 ?postId=ID 切換，Next 的 server metadata 無法隨文章變換，
// 因此在 selectedPost 改變時直接更新文件標題、meta 標籤、canonical 與 BlogPosting 結構化資料。
// Googlebot 會執行 JavaScript，可讀到更新後的標籤。
import type { Post } from '@/lib/types';
import { SITE_NAME, SITE_SHORT_NAME, SITE_DESCRIPTION } from '@/lib/site';

const JSONLD_ID = 'lgsstudy-blogposting-jsonld';

// 移除 Markdown 語法，產生純文字摘要（給 meta description 與 JSON-LD 用）
export function stripMarkdown(md: string, max = 110): string {
  const text = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_>`~#|]/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, '')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setBlogPostingJsonLd(post: Post, url: string, image: string | null, excerpt: string): void {
  let el = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = JSONLD_ID;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: excerpt,
    datePublished: `${post.post_date}T00:00:00+08:00`,
    dateModified: `${post.post_date}T00:00:00+08:00`,
    inLanguage: 'zh-HK',
    articleSection: post.category || '靈修默想',
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: SITE_SHORT_NAME },
    publisher: { '@type': 'Organization', name: SITE_SHORT_NAME },
    ...(image ? { image } : {}),
  });
}

function removeBlogPostingJsonLd(): void {
  document.getElementById(JSONLD_ID)?.remove();
}

// 切換到某篇文章時呼叫；post 為 null 時還原為全站預設值
export function applyPostSeo(post: Post | null): void {
  if (typeof window === 'undefined') return;

  if (!post) {
    document.title = SITE_NAME;
    setMeta('name', 'description', SITE_DESCRIPTION);
    setMeta('property', 'og:title', SITE_NAME);
    setMeta('property', 'og:description', SITE_DESCRIPTION);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', window.location.origin);
    setCanonical(window.location.origin);
    removeBlogPostingJsonLd();
    return;
  }

  const url = `${window.location.origin}/?postId=${post.id}`;
  const excerpt = stripMarkdown(post.content);
  const fullTitle = `${post.title} | ${SITE_NAME}`;
  const image = post.image_url
    ? post.image_url.startsWith('http')
      ? post.image_url
      : `${window.location.origin}${post.image_url.startsWith('/') ? '' : '/'}${post.image_url}`
    : null;

  document.title = fullTitle;
  setMeta('name', 'description', excerpt);
  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', excerpt);
  setMeta('property', 'og:type', 'article');
  setMeta('property', 'og:url', url);
  if (image) setMeta('property', 'og:image', image);
  setCanonical(url);
  setBlogPostingJsonLd(post, url, image, excerpt);
}
