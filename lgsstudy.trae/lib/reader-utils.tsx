import type { ReactNode } from 'react';
import { bibleUrl } from '@/lib/bible';

// 回應時間只顯示到日：2026-09-16
export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 預計閱讀時間：去除空白與標點後算字數，中文每分鐘約 230 字
export function estimateReadingTime(content: string): string {
  const stripped = content
    .replace(/[#*_>`~\-\[\]()!|]/g, '')
    .replace(/\s+/g, '')
    .replace(/[\p{P}]/gu, '');
  const minutes = Math.max(1, Math.round(stripped.length / 230));
  return `約 ${minutes} 分鐘`;
}

// 瀏覽量工作階段防重複：記錄本次瀏覽工作階段已計過的文章 id
// （sessionStorage 在關閉分頁後清空；同一分頁內重整、於首頁與閱讀頁間往返均不重複計）
const VIEWED_STORAGE_KEY = 'lgsstudy_viewed_posts';

function readViewedIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(VIEWED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x): x is number => Number.isInteger(x)) : []);
  } catch {
    return new Set();
  }
}

// 把文章標記為「本工作階段已計」；若先前已計過則回傳 false（本次不應再計）
export function markViewed(postId: number): boolean {
  try {
    const ids = readViewedIds();
    if (ids.has(postId)) return false;
    ids.add(postId);
    sessionStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return true;
  }
}

// 計數請求失敗時移除標記，讓下次重整或再進入時可補計
export function unmarkViewed(postId: number): void {
  try {
    const ids = readViewedIds();
    if (ids.delete(postId)) {
      sessionStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify([...ids]));
    }
  } catch {
    // 忽略
  }
}

// 分類以「、」合併儲存（最多三個）——拆開以便顯示與篩選
export function splitCategories(c?: string | null): string[] {
  const parts = (c || '靈修默想').split('、').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : ['靈修默想'];
}

// 經文以「；」合併（最多兩段）——拆開以便顯示
export function splitScriptures(s?: string): string[] {
  return (s || '').split('；').map((t) => t.trim()).filter(Boolean);
}

// 本篇文章的對外分享網址
export function buildShareUrl(id: number): string {
  return `${window.location.origin}/?postId=${id}`;
}

// 經文一鍵連到聖經網站（Bible Gateway 和合本修訂版 繁體）
// 多段經文（用「；」分隔）逐段獨立連結，分號保留下一連結前
export function renderScripture(
  scripture: string,
  linkClassName?: string,
): ReactNode {
  if (!scripture) return null;
  const parts = scripture.split('；').map((s) => s.trim()).filter(Boolean);
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && '；'}
      <a
        href={bibleUrl(part)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        title={`到香港聖經公會 RCUV 查看：${part}`}
      >
        {part}
      </a>
    </span>
  ));
}
