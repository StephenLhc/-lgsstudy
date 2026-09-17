'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  LogOut,
  Loader2,
  ArrowLeft,
  Pencil,
  Trash2,
  RotateCcw,
  Eye,
  Heart,
  ThumbsDown,
  MessageSquare,
  Plus,
  Pin,
  PinOff,
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
  is_pinned: boolean;
}

export default function AdminManagePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loadingError, setLoadingError] = useState('');

  // 正在處理刪除／還原的文章 id；confirmId 為等待二次確認的文章
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  // 待審核讀者回應數量（頂欄捷徑徽章）
  const [pendingComments, setPendingComments] = useState(0);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/posts');
      if (res.status === 401) {
        router.replace('/admin');
        return false;
      }
      if (!res.ok) {
        setLoadingError('文章列表載入失敗，請重新整理再試');
        return true;
      }
      setPosts(await res.json());
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
        const ok = await loadPosts();
        if (ok) setReady(true);
        else setReady(true); // 401 已觸發跳轉，仍解除載入畫面避免卡死
        // 順手帶入待審核回應數量（失敗不影響頁面）
        try {
          const summaryRes = await fetch('/api/admin/comments?summary=1');
          if (summaryRes.ok) {
            const summary = await summaryRes.json();
            setPendingComments(Number(summary.pending) || 0);
          }
        } catch {
          // 忽略徽章載入失敗
        }
      } catch {
        router.replace('/admin');
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

  const toggleDeleted = async (post: AdminPost) => {
    const action = post.is_deleted ? 'restore' : 'delete';
    setBusyId(post.id);
    setActionError('');
    setConfirmId(null);
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, action }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || '狀態更新失敗，請稍後再試');
        return;
      }
      // 樂觀更新本地列表；刪除時後端會連帶取消置頂，這裡同步反映
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, is_deleted: !p.is_deleted, is_pinned: p.is_deleted ? p.is_pinned : false }
            : p,
        ),
      );
    } catch {
      setActionError('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // 置頂／取消置頂（非破壞性操作，無需二次確認）；成功後依後台排序規則就地重排
  const togglePinned = async (post: AdminPost) => {
    const action = post.is_pinned ? 'unpin' : 'pin';
    setBusyId(post.id);
    setActionError('');
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, action }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || '置頂更新失敗，請稍後再試');
        return;
      }
      setPosts((prev) =>
        prev
          .map((p) =>
            p.id === post.id
              ? { ...p, is_pinned: Boolean(data.is_pinned ?? !p.is_pinned) }
              : p,
          )
          // 與後台 GET 相同排序：未刪除 → 置頂優先 → 日期新到舊
          .sort(
            (a, b) =>
              Number(a.is_deleted) - Number(b.is_deleted) ||
              Number(b.is_pinned) - Number(a.is_pinned) ||
              new Date(b.post_date).getTime() - new Date(a.post_date).getTime() ||
              b.id - a.id,
          ),
      );
    } catch {
      setActionError('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
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

  const visibleCount = posts.filter((p) => !p.is_deleted).length;
  const deletedCount = posts.length - visibleCount;

  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* 頂部列 */}
        <header className="mb-6 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 sm:gap-3">
            <BookOpen className="w-6 h-6 sm:w-9 sm:h-9 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>作者後台 · 管理文章</span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => router.push('/admin/write')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs sm:text-base hover:bg-emerald-800 transition shadow-sm"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              寫新文章
            </button>
            <button
              onClick={() => router.push('/admin/comments')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-violet-200 dark:border-violet-800"
            >
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              回應審核{pendingComments > 0 ? `（${pendingComments}）` : ''}
            </button>
            <button
              onClick={() => router.push('/admin/trash')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-gray-300 dark:border-slate-700"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              回收站{deletedCount > 0 ? `（${deletedCount}）` : ''}
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-amber-100 dark:bg-slate-800 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-amber-300 dark:border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              返回選單
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
          共 {posts.length} 篇：發布中 {visibleCount} 篇
          {deletedCount > 0 && `，已刪除（讀者看不到）${deletedCount} 篇，可隨時還原`}
          。
        </p>

        {actionError && (
          <p className="text-red-600 font-bold text-sm sm:text-base mb-4">{actionError}</p>
        )}
        {loadingError && (
          <p className="text-red-600 font-bold text-sm sm:text-base mb-4">{loadingError}</p>
        )}

        {posts.length === 0 && !loadingError ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center text-gray-500 dark:text-slate-400 shadow-md border border-gray-200 dark:border-slate-800">
            目前還沒有任何文章，按右上角「寫新文章」開始吧。
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((post) => (
              <li
                key={post.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-sm border-2 transition ${
                  post.is_deleted
                    ? 'border-gray-300 dark:border-slate-700 opacity-70'
                    : post.is_pinned
                      ? 'border-amber-400 dark:border-amber-500'
                      : 'border-gray-200 dark:border-slate-800'
                }`}
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
                      {post.is_pinned && !post.is_deleted && (
                        <span className="bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 border border-amber-300 dark:border-amber-700">
                          <Pin className="w-3 h-3" />
                          已置頂
                        </span>
                      )}
                      {!post.is_deleted && post.post_date > (() => {
                        // 用香港時區的今天作比較基準
                        const now = new Date();
                        const hkDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }));
                        const yyyy = hkDate.getFullYear();
                        const mm = String(hkDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(hkDate.getDate()).padStart(2, '0');
                        return `${yyyy}-${mm}-${dd}`;
                      })() && (
                        <span className="bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1 border border-sky-300 dark:border-sky-700">
                          🕐 排程中（{post.post_date?.slice(5, 10)} 發布）
                        </span>
                      )}
                      {post.is_deleted && (
                        <span className="bg-gray-600 text-white font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1">
                          <Trash2 className="w-3 h-3" />
                          已刪除（讀者看不到）
                        </span>
                      )}
                    </div>

                    <h2
                      className={`text-lg sm:text-xl font-bold leading-snug ${
                        post.is_deleted
                          ? 'text-gray-500 dark:text-slate-400 line-through'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {post.title}
                    </h2>
                    <p className="text-sm sm:text-base text-amber-800 dark:text-amber-400/90 mt-1">
                      📖 {post.scripture}
                    </p>

                    <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-bold flex-wrap">
                      <span className="flex items-center gap-1" title="瀏覽量">
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

                  {/* 操作按鈕 */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {!post.is_deleted && (
                      <button
                        onClick={() => togglePinned(post)}
                        disabled={busyId === post.id}
                        title={post.is_pinned ? '取消置頂，恢復按日期排序' : '置頂於文章列表最前面'}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm border transition disabled:opacity-50 ${
                          post.is_pinned
                            ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:opacity-80'
                        }`}
                      >
                        {busyId === post.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : post.is_pinned ? (
                          <PinOff className="w-4 h-4" />
                        ) : (
                          <Pin className="w-4 h-4" />
                        )}
                        {post.is_pinned ? '取消置頂' : '置頂'}
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/admin/write?id=${post.id}`)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-sm border border-blue-200 dark:border-blue-800 hover:opacity-80 transition"
                    >
                      <Pencil className="w-4 h-4" />
                      修改
                    </button>

                    {post.is_deleted ? (
                      <button
                        onClick={() => toggleDeleted(post)}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-sm border border-emerald-300 dark:border-emerald-800 hover:opacity-80 transition disabled:opacity-50"
                      >
                        {busyId === post.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        還原
                      </button>
                    ) : confirmId === post.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => toggleDeleted(post)}
                          disabled={busyId === post.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition disabled:opacity-50"
                        >
                          {busyId === post.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          確認刪除？
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
                          setConfirmId(post.id);
                        }}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold text-sm border border-red-200 dark:border-red-900 hover:opacity-80 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        刪除
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
