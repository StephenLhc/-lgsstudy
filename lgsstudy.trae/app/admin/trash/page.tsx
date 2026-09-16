'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  LogOut,
  Loader2,
  ArrowLeft,
  Trash2,
  RotateCcw,
  Heart,
  ThumbsDown,
  MessageSquare,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface AdminPost {
  id: number;
  title: string;
  scripture: string;
  category: string | null;
  post_date: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  views: number;
  image_url: string | null;
  is_deleted: boolean;
}

// 回收站：只列出已軟刪除（讀者看不到）的文章，
// 提供「一鍵還原」與需二次確認的「徹底刪除」。
export default function AdminTrashPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loadingError, setLoadingError] = useState('');

  // busyId：正在處理的文章；confirmId：等待二次確認徹底刪除的文章
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/posts');
      if (res.status === 401) {
        router.replace('/admin');
        return false;
      }
      if (!res.ok) {
        setLoadingError('回收站載入失敗，請重新整理再試');
        return true;
      }
      const all: AdminPost[] = await res.json();
      setPosts(all.filter((p) => p.is_deleted));
      return true;
    } catch {
      setLoadingError('網路連線失敗，請重新整理再試');
      return true;
    }
  }, [router]);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/admin/login');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        await loadPosts();
      } catch {
        router.replace('/admin');
      } finally {
        setReady(true);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.push('/admin');
    }
  };

  // 一鍵還原：PATCH restore，成功後直接從回收站清單移除
  const handleRestore = async (post: AdminPost) => {
    setBusyId(post.id);
    setActionError('');
    setConfirmId(null);
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, action: 'restore' }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || '還原失敗，請稍後再試');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setNotice(`已還原「${post.title}」，讀者現在可以看到該篇文章`);
    } catch {
      setActionError('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // 徹底刪除：DELETE，文章與其回應、本機配圖會永久移除，無法復原
  const handlePermanentDelete = async (post: AdminPost) => {
    setBusyId(post.id);
    setActionError('');
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || '徹底刪除失敗，請稍後再試');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setNotice(`已永久刪除「${post.title}」`);
    } catch {
      setActionError('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-2xl font-bold">
          <Loader2 className="w-8 h-8 animate-spin" />
          正在確認登入狀態...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* 頂部列 */}
        <header className="mb-6 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 sm:gap-3">
            <BookOpen className="w-6 h-6 sm:w-9 sm:h-9 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span className="flex items-center gap-2">
              <Trash2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-500 dark:text-slate-400" />
              回收站
            </span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => router.push('/admin/manage')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs sm:text-base hover:bg-emerald-800 transition shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              返回管理
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-amber-100 dark:bg-slate-800 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-amber-300 dark:border-slate-700"
            >
              後台選單
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-gray-300 dark:border-slate-700"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              登出
            </button>
          </div>
        </header>

        <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-4">
          回收站内有 <strong className="text-gray-800 dark:text-slate-200">{posts.length}</strong> 篇已刪除的文章（讀者看不到）。
          「還原」會立即讓文章重新公開；「徹底刪除」會永久移除文章與其回應，無法復原。
        </p>

        {notice && (
          <p className="text-emerald-700 dark:text-emerald-400 font-bold text-sm sm:text-base mb-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
            {notice}
          </p>
        )}
        {actionError && (
          <p className="text-red-600 font-bold text-sm sm:text-base mb-4">{actionError}</p>
        )}
        {loadingError && (
          <p className="text-red-600 font-bold text-sm sm:text-base mb-4">{loadingError}</p>
        )}

        {posts.length === 0 && !loadingError ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center text-gray-500 dark:text-slate-400 shadow-md border border-gray-200 dark:border-slate-800">
            <Trash2 className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            回收站是空的，沒有已刪除的文章。
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((post) => (
              <li
                key={post.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-sm border-2 border-gray-300 dark:border-slate-700 opacity-80"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-bold">
                        📅 {post.post_date?.slice(0, 10)}
                      </span>
                      <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold px-2.5 py-0.5 rounded-full text-xs">
                        {post.category || '靈修默想'}
                      </span>
                      <span className="bg-gray-600 text-white font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1">
                        <Trash2 className="w-3 h-3" />
                        已刪除
                      </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-bold leading-snug text-gray-500 dark:text-slate-400 line-through">
                      {post.title}
                    </h2>
                    <p className="text-sm sm:text-base text-amber-800 dark:text-amber-400/90 mt-1">
                      📖 {post.scripture}
                    </p>

                    <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-bold flex-wrap">
                      <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" /> {post.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-4 h-4" /> {post.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="w-4 h-4" /> {post.dislike_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" /> {post.comment_count}
                      </span>
                    </div>
                  </div>

                  {/* 操作按鈕：一鍵還原 / 徹底刪除（二次確認） */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={() => handleRestore(post)}
                      disabled={busyId === post.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-sm border border-emerald-300 dark:border-emerald-800 hover:opacity-80 transition disabled:opacity-50"
                    >
                      {busyId === post.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      一鍵還原
                    </button>

                    {confirmId === post.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => handlePermanentDelete(post)}
                          disabled={busyId === post.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition disabled:opacity-50"
                        >
                          {busyId === post.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                          確認永久刪除？
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold text-sm hover:opacity-80 transition"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setActionError('');
                          setNotice('');
                          setConfirmId(post.id);
                        }}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold text-sm border border-red-200 dark:border-red-900 hover:opacity-80 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        徹底刪除
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
