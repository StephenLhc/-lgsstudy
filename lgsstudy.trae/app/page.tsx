'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Heart, ThumbsDown, MessageSquare, Search, Filter, Calendar, Tag, Loader2, Sun, Moon, Eye, LayoutDashboard, LogIn, Share2, Link2, Check, ChevronLeft, ChevronRight, Clock, CornerDownRight, Pin, Sparkles, Flame, Bookmark } from 'lucide-react';
import { formatCommentDate, estimateReadingTime, renderScripture, splitCategories } from '@/lib/reader-utils';
import { useReaderPage } from '@/hooks/useReaderPage';

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const {
    posts, selectedPost, loading, mounted, isAdmin,
    searchKeyword, setSearchKeyword, selectedCategory, setSelectedCategory,
    sortBy, setSortBy, selectedDate, setSelectedDate,
    publicComments, commentsLoading, relatedPosts, relatedLoading,
    votes, bookmarks, showBookmarksOnly, setShowBookmarksOnly,
    linkCopied, categories, filteredAndSortedPosts, topPosts,
    currentIndex, prevPost, nextPost,
    toggleBookmark, toggleReaction, openPost, copyShareLink, shareToWhatsApp,
  } = useReaderPage();

  // 訂閱新文章通知（讀者填寫電郵）
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeMsg, setSubscribeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribing(true);
    setSubscribeMsg(null);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subscribeEmail }),
      });
      const data = await res.json();
      setSubscribeMsg({ type: data.ok ? 'success' : 'error', text: data.message });
      if (data.ok) setSubscribeEmail('');
    } catch {
      setSubscribeMsg({ type: 'error', text: '網路不穩，訂閱失敗，請稍後再試' });
    } finally {
      setSubscribing(false);
      setTimeout(() => setSubscribeMsg(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center transition-colors">
        <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-2xl font-bold">
          <Loader2 className="w-8 h-8 animate-spin" />
          載入靈修文章中...
        </div>
      </div>
    );
  }

  if (!selectedPost) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xl font-bold">
        目前資料庫中沒有靈修文章 😅
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 max-w-7xl mx-auto transition-colors">

      {/* 頂部 Header：Logo — 標題 — 登入按鈕，標題在兩者之間置中 */}
      <header className="mb-6 md:mb-8 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row items-center gap-2 sm:gap-3">
        {/* 左上角：網站 Logo */}
        <div className="flex items-center shrink-0">
          {mounted && (
            <img
              src={theme === 'dark' ? '/images/lgsDark.png' : '/images/lgsLight.png'}
              alt="樂研集 lgscns"
              className="h-9 sm:h-12 w-auto rounded-lg border border-emerald-800/15 dark:border-slate-700 shrink-0"
            />
          )}
        </div>

        {/* 網站名稱：在 Logo 與按鈕之間，佔滿剩餘空間並置中 */}
        <h1 className="flex-1 text-base min-[400px]:text-lg sm:text-2xl lg:text-3xl md:text-4xl font-bold text-emerald-900 dark:text-emerald-400 truncate text-center">
          讀經分享點與滴
        </h1>

        {/* 右上角：後台入口（未登入＝作者登入，已登入＝作者後台）＋主題切換按鈕 */}
        {mounted && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdmin ? (
              <button
                onClick={() => router.push('/admin')}
                title="返回作者後台"
                aria-label="返回作者後台"
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs sm:text-base hover:bg-emerald-800 transition shadow-sm border border-emerald-800 dark:border-emerald-500"
              >
                <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>登入</span>
              </button>
            ) : (
              <button
                onClick={() => router.push('/admin')}
                title="登入作者後台"
                aria-label="登入作者後台"
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs sm:text-base hover:bg-emerald-800 transition shadow-sm border border-emerald-800 dark:border-emerald-500"
              >
                <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>登入</span>
              </button>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-amber-100 dark:bg-slate-800 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-amber-300 dark:border-slate-700"
              title="切換深色/淺色模式"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  <span>明亮模式</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
                  <span>暗黑模式</span>
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {/* 左右雙欄佈局（手機上上下堆疊，大螢幕時左右兩欄） */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

        {/* 👈 左欄：主題文章閱讀欄 (加入 sm:, md: 微調間距與大小) */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 rounded-2xl shadow-md border border-gray-200 dark:border-slate-800 min-h-[600px] flex flex-col justify-between transition-colors">
          <div>
            <div className="border-b dark:border-slate-800 pb-4 mb-6">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-amber-800 dark:text-amber-400 font-bold text-sm sm:text-base md:text-lg">📅 日期：{selectedPost.post_date}</span>
                <span className="flex items-center gap-2 flex-wrap">
                  {selectedPost.is_pinned && (
                    <span className="bg-amber-400 text-amber-950 font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm md:text-base flex items-center gap-1 border border-amber-500">
                      <Pin className="w-3.5 h-3.5 sm:w-4 h-4" />
                      置頂
                    </span>
                  )}
                  <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm md:text-base flex items-center gap-1 border border-emerald-300 dark:border-emerald-800">
                    <Tag className="w-3.5 h-3.5 sm:w-4 h-4" />
                    {selectedPost.category || '靈修默想'}
                  </span>
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight text-slate-900 dark:text-slate-100 mt-1">
                {selectedPost.title}
              </h2>
              <p className="text-xl sm:text-2xl text-amber-800 dark:text-amber-300 font-medium mt-3 bg-amber-50 dark:bg-amber-950/40 p-2 sm:p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 inline-block">
                📖 經文：{renderScripture(selectedPost.scripture, 'underline decoration-amber-500 hover:decoration-amber-700 hover:text-amber-600 transition')}
              </p>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
                <Clock className="w-4 h-4" /> 預計閱讀時間：{estimateReadingTime(selectedPost.content)}
              </p>
            </div>

            {/* 文章頂部配圖（作者發文時加入，沒有配圖的文章不佔位） */}
            {selectedPost.image_url && (
              <div className="mb-6 sm:mb-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedPost.image_url}
                  alt={selectedPost.title}
                  className="w-full max-h-[420px] object-cover rounded-2xl shadow-md border border-gray-200 dark:border-slate-700"
                />
              </div>
            )}

            {/* Markdown 文章內容 (加入 sm: 微調 prose 語法大小) */}
            <article className="prose prose-slate prose-lg max-w-none text-xl md:text-2xl leading-relaxed text-gray-800 dark:text-slate-200 mb-8 transition-colors">
              <ReactMarkdown
                components={{
                  h3: ({ node, ...props }) => <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-900 dark:text-emerald-400 mt-6 mb-3" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                  blockquote: ({ node, ...props }) => (
                    <blockquote className="border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 p-3 sm:p-4 rounded-r-xl italic my-4 text-amber-900 dark:text-amber-300 font-medium" {...props} />
                  ),
                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 sm:pl-6 mb-4 space-y-2" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-bold text-emerald-800 dark:text-emerald-400" {...props} />,
                }}
              >
                {selectedPost.content}
              </ReactMarkdown>
            </article>
          </div>

          {/* 互動按鈕（手機版自動微調尺寸，避免擠壓超出畫面） */}
          <div className="pt-4 sm:pt-6 border-t border-gray-200 dark:border-slate-800 flex justify-around items-center bg-gray-50/80 dark:bg-slate-800/60 p-2 sm:p-4 rounded-2xl gap-1 sm:gap-2">
            {/* 瀏覽量（開啟文章即自動加 1，同一瀏覽工作階段不重複計） */}
            <div
              className="flex flex-col items-center gap-1 text-sky-600 dark:text-sky-400 p-2 sm:p-3 rounded-xl"
              title="瀏覽量"
            >
              <Eye className="w-6 h-6 sm:w-8 sm:h-8" />
              <span className="text-xs sm:text-lg font-bold">{selectedPost.views || 0} 次瀏覽</span>
            </div>

            {/* 收藏／書籤：只存於本機瀏覽器，不計入網站統計 */}
            <button
              onClick={() => toggleBookmark(selectedPost.id)}
              aria-pressed={bookmarks.includes(selectedPost.id)}
              title={bookmarks.includes(selectedPost.id) ? '已收藏，再按一次取消' : '收藏這篇，方便日後重看'}
              className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl transition ${bookmarks.includes(selectedPost.id)
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400 dark:ring-amber-500'
                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }`}
            >
              <Bookmark
                className={`w-6 h-6 sm:w-8 sm:h-8 ${bookmarks.includes(selectedPost.id)
                  ? 'fill-amber-500 text-amber-600 dark:text-amber-400'
                  : 'fill-amber-100 dark:fill-amber-950'
                  }`}
              />
              <span className="text-xs sm:text-lg font-bold">
                {bookmarks.includes(selectedPost.id) ? '已收藏' : '收藏'}
              </span>
            </button>

            <button
              onClick={() => toggleReaction('like')}
              aria-pressed={votes[selectedPost.id]?.liked ?? false}
              title={votes[selectedPost.id]?.liked ? '再按一次取消讚' : '我覺得這篇很得益處'}
              className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl transition ${votes[selectedPost.id]?.liked
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400 dark:ring-rose-500'
                : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                }`}
            >
              <Heart
                className={`w-6 h-6 sm:w-8 sm:h-8 stroke-rose-600 dark:stroke-rose-400 ${votes[selectedPost.id]?.liked
                  ? 'fill-rose-500 dark:fill-rose-500'
                  : 'fill-rose-100 dark:fill-rose-950'
                  }`}
              />
              <span className="text-xs sm:text-lg font-bold">{selectedPost.like_count || 0} 讚</span>
            </button>

            <button
              onClick={() => toggleReaction('dislike')}
              aria-pressed={votes[selectedPost.id]?.disliked ?? false}
              title={votes[selectedPost.id]?.disliked ? '再按一次取消「有待改善」' : '我覺得這篇有待改善'}
              className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl transition ${votes[selectedPost.id]?.disliked
                ? 'bg-gray-300 dark:bg-slate-700 text-gray-800 dark:text-slate-200 ring-2 ring-gray-500 dark:ring-slate-400'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
            >
              <ThumbsDown className="w-6 h-6 sm:w-8 sm:h-8" />
              <span className="text-xs sm:text-lg font-bold">{selectedPost.dislike_count || 0} 有待改善</span>
            </button>

            <button
              onClick={() => router.push(`/respond?postId=${selectedPost.id}`)}
              className="flex flex-col items-center gap-1 text-blue-700 dark:text-blue-400 hover:scale-105 transition p-2 sm:p-3 px-3 sm:px-6 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800"
            >
              <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8" />
              <span className="text-xs sm:text-lg font-bold">回應 ({selectedPost.comment_count || 0})</span>
            </button>
          </div>

          {/* 分享列：WhatsApp 教會群組分享 ／ 複製連結 */}
          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3 px-1">
            <span className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-gray-600 dark:text-slate-300">
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              分享給親友：
            </span>
            <button
              onClick={shareToWhatsApp}
              title="透過 WhatsApp 分享這篇文章"
              className="flex items-center gap-1.5 sm:gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white font-bold text-sm sm:text-base px-3 sm:px-5 py-2 rounded-full shadow-sm transition hover:scale-105"
            >
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              WhatsApp 分享
            </button>
            <button
              onClick={copyShareLink}
              title="複製文章連結，可貼到任何地方"
              className={`flex items-center gap-1.5 sm:gap-2 font-bold text-sm sm:text-base px-3 sm:px-5 py-2 rounded-full border shadow-sm transition hover:scale-105 ${linkCopied
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
            >
              {linkCopied ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Link2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              {linkCopied ? '已複製連結！' : '複製連結'}
            </button>
          </div>

          {/* 讀者回應區：只顯示審核通過且讀者同意公開的回應，以及作者回覆 */}
          <div className="mt-5 sm:mt-7 pt-4 border-t border-gray-200 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 mb-3 sm:mb-4">
              <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700 dark:text-emerald-400" />
              讀者回應
              <span className="text-sm sm:text-base font-semibold text-gray-400 dark:text-slate-500">
                （{publicComments.length}）
              </span>
            </h3>

            {commentsLoading ? (
              <div className="flex items-center gap-2 px-1 py-2 text-sm sm:text-base text-gray-400 dark:text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                讀取回應中…
              </div>
            ) : publicComments.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 p-4 sm:p-6 text-center">
                <p className="mb-3 text-sm sm:text-base text-gray-500 dark:text-slate-400">
                  暫時未有公開回應，歡迎第一位分享您的領受與鼓勵！
                </p>
                <button
                  onClick={() => router.push(`/respond?postId=${selectedPost.id}`)}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-sm transition hover:scale-105"
                >
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  我要回應
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {publicComments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 sm:p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                        {c.user_name}
                        <span className="ml-1 font-semibold text-gray-500 dark:text-slate-400">
                          {c.salutation}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs sm:text-sm text-gray-400 dark:text-slate-500">
                        {formatCommentDate(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">
                      {c.comment_text}
                    </p>
                    {c.admin_reply && (
                      <div className="mt-3 ml-1 sm:ml-3 p-2.5 sm:p-3 bg-violet-50 dark:bg-violet-950/30 border-l-4 border-violet-400 rounded-r-xl">
                        <p className="flex items-center gap-1.5 mb-1 text-xs sm:text-sm font-bold text-violet-700 dark:text-violet-300">
                          <CornerDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          作者回覆
                        </p>
                        <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words text-violet-900 dark:text-violet-100">
                          {c.admin_reply}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => router.push(`/respond?postId=${selectedPost.id}`)}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-sm transition hover:scale-105"
                >
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  我也要回應
                </button>
              </div>
            )}
          </div>

          {/* 上一篇／下一篇導航：依右欄清單順序（預設上＝較新、下＝較舊） */}
          {currentIndex >= 0 && (
            <div className="mt-5 sm:mt-7 pt-4 border-t border-gray-200 dark:border-slate-700 grid grid-cols-2 gap-2 sm:gap-4">
              {prevPost ? (
                <button
                  onClick={() => openPost(prevPost)}
                  title={`上一篇：${prevPost.title}`}
                  className="group flex items-center gap-1.5 sm:gap-2 text-left px-2.5 sm:px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition min-w-0"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[11px] sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">上一篇</span>
                    <span className="block text-xs sm:text-base font-semibold text-slate-800 dark:text-slate-200 truncate">{prevPost.title}</span>
                  </span>
                </button>
              ) : (
                <span className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 text-xs sm:text-base font-bold">
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  已經是第一篇
                </span>
              )}
              {nextPost ? (
                <button
                  onClick={() => openPost(nextPost)}
                  title={`下一篇：${nextPost.title}`}
                  className="group flex items-center justify-end gap-1.5 sm:gap-2 text-right px-2.5 sm:px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition min-w-0"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">下一篇</span>
                    <span className="block text-xs sm:text-base font-semibold text-slate-800 dark:text-slate-200 truncate">{nextPost.title}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                </button>
              ) : (
                <span className="flex items-center justify-end gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 text-xs sm:text-base font-bold">
                  已經是最後一篇
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </span>
              )}
            </div>
          )}

          {/* 相關文章推薦：與目前文章共享至少一個主題分類的其他文章 */}
          {relatedPosts.length > 0 && (
            <div className="mt-5 sm:mt-7 pt-4 border-t border-gray-200 dark:border-slate-700">
              <h3 className="flex items-center gap-2 mb-3 sm:mb-4 text-lg sm:text-xl font-bold text-emerald-800 dark:text-emerald-300">
                <Sparkles className="w-5 h-5" />
                相關靈修文章
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {relatedPosts.map((rp) => {
                  const cats = splitCategories(rp.category);
                  return (
                    <button
                      key={rp.id}
                      onClick={() => openPost(rp)}
                      className="group text-left p-3 sm:p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition flex flex-col gap-1.5 min-w-0"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cats.map((c) => (
                          <span key={c} className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
                            <Tag className="w-2.5 h-2.5" />
                            {c}
                          </span>
                        ))}
                      </div>
                      <span className="block font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition line-clamp-2 break-words">
                        {rp.title}
                      </span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400 line-clamp-1 break-words">
                        {renderScripture(rp.scripture, 'underline hover:text-amber-600 hover:decoration-amber-700')}
                      </span>
                      <span className="mt-auto flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 dark:text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" />
                          {rp.post_date}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3 h-3" />
                          {rp.views ?? 0}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {relatedLoading && relatedPosts.length === 0 && (
            <div className="mt-5 sm:mt-7 pt-4 border-t border-gray-200 dark:border-slate-700 flex items-center gap-2 text-gray-400 dark:text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              載入相關文章中...
            </div>
          )}
        </section>

        {/* 👉 右欄：歷史內容與多功能搜尋庫 */}
        <aside className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl shadow-md border border-gray-200 dark:border-slate-800 transition-colors">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 pb-2 border-b dark:border-slate-800 flex items-center gap-2">
            <Search className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            歷史靈修搜尋
          </h2>

          {/* 🔍 搜尋與篩選控制區 */}
          <div className="space-y-4 mb-6 bg-amber-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-amber-200/80 dark:border-slate-700">

            {/* 0. 只看我的收藏（收藏清單存於本機瀏覽器） */}
            <button
              onClick={() => setShowBookmarksOnly((v) => !v)}
              disabled={bookmarks.length === 0 && !showBookmarksOnly}
              aria-pressed={showBookmarksOnly}
              className={`w-full flex items-center justify-center gap-2 p-2.5 sm:p-3 rounded-xl font-bold text-base sm:text-lg border-2 transition ${showBookmarksOnly
                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                : bookmarks.length === 0
                  ? 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }`}
              title={bookmarks.length === 0 ? '按下文章上的「收藏」後，就能在這裡快速找回' : '只顯示你在本機收藏的文章'}
            >
              <Bookmark className={`w-5 h-5 ${showBookmarksOnly ? 'fill-white' : bookmarks.length > 0 ? 'fill-amber-300' : ''}`} />
              {showBookmarksOnly ? '顯示全部文章' : `只看我的收藏（${bookmarks.length}）`}
            </button>

            {/* 1. 關鍵字搜尋框 */}
            <div>
              <label className="block text-gray-700 dark:text-slate-300 font-bold mb-1.5 text-base sm:text-lg">搜尋經文或關鍵字：</label>
              <input
                type="text"
                placeholder="例如：詩篇、箴言、馬太福音..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full p-2 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* 2. 分類篩選器 */}
            <div>
              <label className="block text-gray-700 dark:text-slate-300 font-bold mb-1.5 text-base sm:text-lg flex items-center gap-1">
                <Tag className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                主題分類：
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-600 dark:focus:border-emerald-500 font-medium"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === '全部' ? '全部分類' : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. 排序選項 */}
            <div>
              <label className="block text-gray-700 dark:text-slate-300 font-bold mb-1.5 text-base sm:text-lg flex items-center gap-1">
                <Filter className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                排序選項：
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full p-2 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-600 dark:focus:border-emerald-500 font-medium"
              >
                <option value="date">按發布日期 (最新在前)</option>
                <option value="likes">最多讚 👍</option>
                <option value="dislikes">最多有待改善 💬</option>
                <option value="comments">最多回應 🔥</option>
              </select>
            </div>

            {/* 4. 日期過濾器 */}
            <div>
              <label className="block text-gray-700 dark:text-slate-300 font-bold mb-1.5 text-base sm:text-lg flex items-center gap-1">
                <Calendar className="w-5 h-5 text-amber-800 dark:text-amber-400" />
                按指定日期搜尋：
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full p-2 sm:p-2.5 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-600 dark:focus:border-emerald-500"
                />
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate('')}
                    className="px-3 py-1 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 font-bold rounded-xl text-xs sm:text-sm"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* 🔥 熱門文章排行：依瀏覽量 Top 5，不受搜尋/篩選影響 */}
          {topPosts.length > 0 && (
            <div className="mb-6 p-4 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20">
              <h3 className="flex items-center gap-1.5 mb-3 text-lg sm:text-xl font-bold text-orange-700 dark:text-orange-300">
                <Flame className="w-5 h-5" />
                熱門文章 Top 5
              </h3>
              <ol className="space-y-2">
                {topPosts.map((p, idx) => {
                  const rank = idx + 1;
                  const rankColor =
                    rank === 1 ? 'bg-amber-500 text-white' :
                      rank === 2 ? 'bg-slate-400 text-white' :
                        rank === 3 ? 'bg-orange-700 text-white' :
                          'bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-slate-200';
                  const isSelected = p.id === selectedPost?.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => openPost(p)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition text-left min-w-0 ${isSelected ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-emerald-400' : 'hover:bg-white/70 dark:hover:bg-slate-800/60'}`}
                      >
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rankColor}`}>
                          {rank}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-semibold truncate ${isSelected ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {p.title}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-slate-400">
                            <Eye className="w-3 h-3" />
                            {p.views ?? 0} 次瀏覽
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* 📧 訂閱新文章通知 */}
          <div className="mb-6 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20">
            <h3 className="flex items-center gap-1.5 mb-2 text-base sm:text-lg font-bold text-emerald-800 dark:text-emerald-300">
              📧 訂閱新文章通知
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 mb-3">
              有新靈修文章發布時，第一時間收到電郵通知，可隨時取消訂閱。
            </p>
            <form onSubmit={handleSubscribe} className="space-y-2">
              <input
                type="email"
                required
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full p-2.5 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-600 dark:focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={subscribing}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {subscribing && <Loader2 className="w-4 h-4 animate-spin" />}
                {subscribing ? '處理中…' : '立即訂閱'}
              </button>
            </form>
            {subscribeMsg && (
              <p className={`text-xs mt-2 font-bold ${subscribeMsg.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>
                {subscribeMsg.type === 'success' ? '✅ ' : '⚠️ '}{subscribeMsg.text}
              </p>
            )}
            <p className="mt-3 pt-3 border-t border-emerald-200/70 dark:border-emerald-900/40 text-xs text-gray-500 dark:text-slate-400">
              習慣用 RSS 閱讀器？{' '}
              <a href="/feed.xml" className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M4 11a9 9 0 0 1 9 9h-2.5A6.5 6.5 0 0 0 4 13.5V11zm0-5a14 14 0 0 1 14 14h-2.5A11.5 11.5 0 0 0 4 8.5V6zm1.5 11.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                </svg>
                訂閱 RSS Feed
              </a>
            </p>
          </div>

          {/* 📜 文章搜尋結果清單 (手機微調間距與大小) */}
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {filteredAndSortedPosts.length > 0 ? (
              filteredAndSortedPosts.map((p) => {
                const isSelected = p.id === selectedPost.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => openPost(p)}
                    className={`w-full text-left p-3 sm:p-4 rounded-xl transition border ${isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 dark:border-emerald-500 shadow-sm'
                      : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700/60 hover:bg-amber-50/60 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                      <span className="flex items-center gap-1.5">
                        {p.is_pinned && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 flex items-center gap-1 border border-amber-500">
                            <Pin className="w-3 h-3" />
                            置頂
                          </span>
                        )}
                        {bookmarks.includes(p.id) && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center gap-1 border border-amber-300 dark:border-amber-700"
                            title="你已收藏這篇"
                          >
                            <Bookmark className="w-3 h-3 fill-amber-500 text-amber-600 dark:text-amber-400" />
                            已收藏
                          </span>
                        )}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'}`}>
                          {p.post_date}
                        </span>
                      </span>
                      <span className="flex gap-1 flex-wrap">
                        {splitCategories(p.category).map((c) => (
                          <span key={c} className="text-xs bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
                            {c}
                          </span>
                        ))}
                      </span>
                    </div>

                    <h3 className={`text-lg sm:text-xl font-bold mt-1.5 ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-800 dark:text-slate-200'}`}>
                      {p.title}
                    </h3>

                    <div className="flex justify-between items-center mt-2.5 text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium flex-wrap gap-2">
                      <span className="text-amber-800 dark:text-amber-400 font-bold">{renderScripture(p.scripture, 'underline hover:text-amber-600 hover:decoration-amber-700')}</span>
                      <div className="flex gap-2 sm:gap-3">
                        <span>❤️ {p.like_count || 0}</span>
                        <span>💬 {p.comment_count || 0}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : showBookmarksOnly ? (
              <div className="text-center text-gray-500 dark:text-slate-400 py-8 px-4">
                <Bookmark className="w-10 h-10 mx-auto mb-2 text-amber-300 dark:text-amber-700" />
                <p className="text-base sm:text-lg font-bold mb-1">收藏清單沒有符合的文章</p>
                <p className="text-sm">你收藏的文章可能被其他篩選條件排除了，試著清除關鍵字或分類篩選</p>
                <button
                  onClick={() => { setShowBookmarksOnly(false); setSearchKeyword(''); setSelectedCategory('全部'); setSelectedDate(''); }}
                  className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition"
                >
                  重設篩選條件
                </button>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-slate-400 py-8 text-base sm:text-lg font-medium">
                沒有找到符合條件的文章 😅
              </p>
            )}
          </div>
        </aside>

      </div>

      {/* （已移到頂欄右側）舊右下角後台入口按鈕 */}
    </main>
  );
}
