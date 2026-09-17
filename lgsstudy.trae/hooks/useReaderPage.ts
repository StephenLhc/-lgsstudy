'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Post, PublicComment } from '@/lib/types';
import { markViewed, unmarkViewed, splitCategories, buildShareUrl } from '@/lib/reader-utils';
import { applyPostSeo } from '@/lib/seo-client';

type SortBy = 'date' | 'likes' | 'dislikes' | 'comments';
type VoteState = { liked: boolean; disliked: boolean };

const VOTE_STORAGE_KEY = 'lgsstudy_post_votes';
const BOOKMARK_STORAGE_KEY = 'lgsstudy_bookmarks';

// 首頁與閱讀頁共用的全部狀態、資料撈取、互動邏輯
export function useReaderPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [selectedDate, setSelectedDate] = useState('');

  const currentPostId = selectedPost?.id;

  const [publicComments, setPublicComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const [votes, setVotes] = useState<Record<number, VoteState>>({});
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);

  const saveVotes = useCallback((next: Record<number, VoteState>) => {
    setVotes(next);
    try {
      localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('無法寫入投票狀態:', err);
    }
  }, []);

  const saveBookmarks = useCallback((next: number[]) => {
    setBookmarks(next);
    try {
      localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('無法寫入收藏:', err);
    }
  }, []);

  const toggleBookmark = useCallback((postId: number) => {
    setBookmarks((prev) => {
      const next = prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [postId, ...prev];
      try {
        localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('無法寫入收藏:', err);
      }
      return next;
    });
  }, []);

  // 確保元件在 Client 端載入完畢（避免 hydration mismatch），並讀回先前的投票／收藏狀態
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(VOTE_STORAGE_KEY);
      if (raw) setVotes(JSON.parse(raw));
    } catch (err) {
      console.warn('無法讀取投票狀態:', err);
    }
    try {
      const rawBm = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (rawBm) {
        const arr = JSON.parse(rawBm);
        if (Array.isArray(arr)) {
          setBookmarks(arr.filter((x): x is number => Number.isInteger(x)));
        }
      }
    } catch (err) {
      console.warn('無法讀取收藏:', err);
    }
  }, []);

  // 檢查訪客是否已通過作者後台密碼閘
  useEffect(() => {
    fetch('/api/admin/login')
      .then((res) => setIsAdmin(res.ok))
      .catch(() => setIsAdmin(false));
  }, []);

  // 從 API 撈取文章列表
  useEffect(() => {
    async function fetchPosts() {
      try {
        const res = await fetch('/api/posts');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPosts(data);
          // 支援分享連結 /?postId=ID：開啟時直接顯示指定文章
          const paramId = Number(new URLSearchParams(window.location.search).get('postId'));
          const target = Number.isInteger(paramId) ? data.find((p) => p.id === paramId) : undefined;
          setSelectedPost(target ?? data[0]);
        }
      } catch (err) {
        console.error('讀取文章失敗:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  // 文章一開啟瀏覽量立即 +1；同一瀏覽工作階段內每篇只計一次
  useEffect(() => {
    if (currentPostId === undefined) return;
    if (!markViewed(currentPostId)) return;

    let cancelled = false;
    const bump = (p: Post): Post =>
      p.id === currentPostId ? { ...p, views: (p.views || 0) + 1 } : p;
    setPosts((prev) => prev.map(bump));
    setSelectedPost((prev) => (prev && prev.id === currentPostId ? bump(prev) : prev));

    fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentPostId }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        const nextViews = typeof data.views === 'number' ? data.views : undefined;
        if (nextViews === undefined) return;
        setPosts((prev) =>
          prev.map((p) => (p.id === currentPostId ? { ...p, views: nextViews } : p)),
        );
        setSelectedPost((prev) =>
          prev && prev.id === currentPostId ? { ...prev, views: nextViews } : prev,
        );
      })
      .catch((err) => {
        unmarkViewed(currentPostId);
        console.error('更新瀏覽量失敗:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPostId]);

  // SEO：切換文章時更新文件標題、description、canonical 與 BlogPosting 結構化資料
  useEffect(() => {
    applyPostSeo(selectedPost);
  }, [selectedPost]);

  // 離開閱讀頁（SPA 導往回應／後台等）時還原為全站預設標籤
  useEffect(() => () => applyPostSeo(null), []);

  // 切換文章時載入該篇已審核通過的公開回應
  useEffect(() => {
    if (currentPostId === undefined) {
      setPublicComments([]);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    fetch(`/api/comments?postId=${currentPostId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((rows: unknown) => {
        if (!cancelled) setPublicComments(Array.isArray(rows) ? (rows as PublicComment[]) : []);
      })
      .catch(() => {
        if (!cancelled) setPublicComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPostId]);

  // 相關文章推薦：切換文章時重新拉取與該篇共享至少一個主題分類的其他文章
  useEffect(() => {
    if (currentPostId === undefined) {
      setRelatedPosts([]);
      return;
    }
    let cancelled = false;
    setRelatedLoading(true);
    fetch(`/api/posts/related?postId=${currentPostId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((rows: unknown) => {
        if (!cancelled) setRelatedPosts(Array.isArray(rows) ? (rows as Post[]) : []);
      })
      .catch(() => {
        if (!cancelled) setRelatedPosts([]);
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPostId]);

  // 切換「讚 / 有待改善」：沒按過 → +1；已按過再按 → −1。兩者各自獨立切換。
  const toggleReaction = useCallback(
    async (kind: 'like' | 'dislike') => {
      if (!selectedPost) return;
      const postId = selectedPost.id;
      const current = votes[postId] ?? { liked: false, disliked: false };
      const nextActive = kind === 'like' ? !current.liked : !current.disliked;
      const delta = nextActive ? 1 : -1;

      const snapshot = { posts, selectedPost, votes };

      const applyCount = (p: Post): Post =>
        kind === 'like'
          ? { ...p, like_count: Math.max((p.like_count || 0) + delta, 0) }
          : { ...p, dislike_count: Math.max((p.dislike_count || 0) + delta, 0) };

      setPosts((prev) => prev.map((p) => (p.id === postId ? applyCount(p) : p)));
      setSelectedPost((prev) => (prev && prev.id === postId ? applyCount(prev) : prev));

      saveVotes({
        ...votes,
        [postId]: {
          liked: kind === 'like' ? nextActive : current.liked,
          disliked: kind === 'dislike' ? nextActive : current.disliked,
        },
      });

      try {
        const res = await fetch('/api/posts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: postId, type: kind, active: nextActive }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const syncCounts = (p: Post): Post =>
          p.id === postId
            ? {
                ...p,
                like_count: typeof data.like_count === 'number' ? data.like_count : p.like_count,
                dislike_count:
                  typeof data.dislike_count === 'number' ? data.dislike_count : p.dislike_count,
              }
            : p;
        setPosts((prev) => prev.map(syncCounts));
        setSelectedPost((prev) => (prev ? syncCounts(prev) : prev));
      } catch (err) {
        console.error('更新投票失敗，已還原:', err);
        setPosts(snapshot.posts);
        setSelectedPost(snapshot.selectedPost);
        saveVotes(snapshot.votes);
      }
    },
    [selectedPost, votes, posts, saveVotes],
  );

  // 點選文章時同步更新網址，方便隨時複製分享目前閱讀的文章
  const openPost = useCallback((p: Post) => {
    setSelectedPost(p);
    try {
      window.history.replaceState(null, '', `/?postId=${p.id}`);
    } catch {
      // 網址更新失敗不影響閱讀
    }
  }, []);

  const copyShareLink = useCallback(async () => {
    if (!selectedPost) return;
    const url = buildShareUrl(selectedPost.id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }, [selectedPost]);

  // 開啟 WhatsApp 分享
  const shareToWhatsApp = useCallback(() => {
    if (!selectedPost) return;
    const url = buildShareUrl(selectedPost.id);
    const text = `【${selectedPost.title}】${selectedPost.scripture ? `\n${selectedPost.scripture}` : ''}\n誠意分享這篇讀經分享給你：\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }, [selectedPost]);

  const categories = useMemo(() => {
    const list = posts.flatMap((p) => splitCategories(p.category));
    return ['全部', ...Array.from(new Set(list))];
  }, [posts]);

  const filteredAndSortedPosts = useMemo(() => {
    return posts
      .filter((p) => {
        const matchesKeyword =
          p.title?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          p.scripture?.toLowerCase().includes(searchKeyword.toLowerCase());
        const matchesCategory =
          selectedCategory === '全部' || splitCategories(p.category).includes(selectedCategory);
        const matchesDate = selectedDate ? p.post_date === selectedDate : true;
        const matchesBookmark = !showBookmarksOnly || bookmarks.includes(p.id);
        return matchesKeyword && matchesCategory && matchesDate && matchesBookmark;
      })
      .sort((a, b) => {
        if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) {
          return Number(b.is_pinned) - Number(a.is_pinned);
        }
        if (sortBy === 'likes') return (b.like_count || 0) - (a.like_count || 0);
        if (sortBy === 'dislikes') return (b.dislike_count || 0) - (a.dislike_count || 0);
        if (sortBy === 'comments') return (b.comment_count || 0) - (a.comment_count || 0);
        return new Date(b.post_date).getTime() - new Date(a.post_date).getTime() || b.id - a.id;
      });
  }, [posts, searchKeyword, selectedCategory, selectedDate, sortBy, showBookmarksOnly, bookmarks]);

  const topPosts = useMemo(
    () =>
      posts
        .slice()
        .sort((a, b) => (b.views || 0) - (a.views || 0) || b.id - a.id)
        .slice(0, 5),
    [posts],
  );

  const currentIndex = useMemo(
    () => (selectedPost ? filteredAndSortedPosts.findIndex((p) => p.id === selectedPost.id) : -1),
    [selectedPost, filteredAndSortedPosts],
  );
  const prevPost = currentIndex > 0 ? filteredAndSortedPosts[currentIndex - 1] : null;
  const nextPost =
    currentIndex >= 0 && currentIndex < filteredAndSortedPosts.length - 1
      ? filteredAndSortedPosts[currentIndex + 1]
      : null;

  return {
    posts,
    selectedPost,
    loading,
    mounted,
    isAdmin,
    searchKeyword,
    setSearchKeyword,
    selectedCategory,
    setSelectedCategory,
    sortBy,
    setSortBy,
    selectedDate,
    setSelectedDate,
    publicComments,
    commentsLoading,
    relatedPosts,
    relatedLoading,
    votes,
    bookmarks,
    showBookmarksOnly,
    setShowBookmarksOnly,
    linkCopied,
    currentPostId,
    categories,
    filteredAndSortedPosts,
    topPosts,
    currentIndex,
    prevPost,
    nextPost,
    toggleBookmark,
    toggleReaction,
    openPost,
    copyShareLink,
    shareToWhatsApp,
  };
}
