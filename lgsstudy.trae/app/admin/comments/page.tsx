'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  LogOut,
  Loader2,
  ArrowLeft,
  MessageSquare,
  Check,
  X,
  Lock,
  Globe,
  Send,
  CornerDownRight,
  RefreshCw,
  Clock,
  Trash2,
} from 'lucide-react';

interface AdminComment {
  id: number;
  post_id: number;
  post_title: string | null;
  post_is_deleted: boolean | null;
  user_name: string;
  salutation: string;
  age_group: string | null;
  faith_years: string | null;
  church_name: string | null;
  comment_text: string;
  is_public: boolean;
  status: 'pending' | 'approved' | 'rejected';
  admin_reply: string | null;
  created_at: string;
  replied_at: string | null;
}

type TabKey = 'pending' | 'approved' | 'rejected' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待審核' },
  { key: 'approved', label: '已通過' },
  { key: 'rejected', label: '已駁回' },
  { key: 'all', label: '全部' },
];

// 時間戳（PostgreSQL ISO 字串）→ 港式繁體格式 2026-09-16 14:30
function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminCommentsPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>('pending');
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingError, setLoadingError] = useState('');
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number; total: number }>({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });

  // 每則留言各自的：回覆草稿、忙碌中狀態、操作訊息
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  // 初次進入：驗證登入、拉各狀態計數
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/login');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        setReady(true);
      } catch {
        router.replace('/admin');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/comments?summary=1');
      if (res.ok) {
        const data = await res.json();
        setCounts({
          pending: data.pending ?? 0,
          approved: data.approved ?? 0,
          rejected: data.rejected ?? 0,
          total: data.total ?? 0,
        });
      }
    } catch {
      // 徽章更新失敗不影響主要操作
    }
  }, []);

  const loadList = useCallback(
    async (status: TabKey) => {
      setListLoading(true);
      setLoadingError('');
      try {
        const res = await fetch(`/api/admin/comments?status=${status}`);
        if (res.status === 401) {
          router.replace('/admin');
          return;
        }
        if (!res.ok) {
          setLoadingError('回應列表載入失敗，請按「重新整理」再試');
          return;
        }
        const rows: AdminComment[] = await res.json();
        setComments(rows);
        // 切換列表時把每則的回覆草稿預載為現有回覆
        setReplyDrafts(
          Object.fromEntries(rows.filter((c) => c.admin_reply).map((c) => [c.id, c.admin_reply ?? ''])),
        );
      } catch {
        setLoadingError('網路連線失敗，請按「重新整理」再試');
      } finally {
        setListLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (ready) {
      loadList(tab);
      loadCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.push('/admin');
    }
  };

  // 審核狀態切換（approve / reject）
  const changeStatus = async (comment: AdminComment, next: 'approved' | 'rejected') => {
    if (next === 'rejected') {
      const confirmed = window.confirm(
        comment.status === 'rejected'
          ? '確定要駁回這則回應嗎？'
          : `確定要把 ${comment.user_name}${comment.salutation} 的回應改為「駁回」嗎？駁回後讀者將看不到該回應。`,
      );
      if (!confirmed) return;
    }
    setBusyId(comment.id);
    setNotice('');
    try {
      const res = await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: next === 'approved' ? 'approve' : 'reject' }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const updated: AdminComment = await res.json().catch(() => ({} as AdminComment));
      if (!res.ok || !updated.id) {
        setNotice('操作失敗，請稍後再試');
        return;
      }
      applyUpdated(updated);
      setNotice(
        next === 'approved'
          ? `已通過 ${comment.user_name}${comment.salutation}的回應${
              comment.is_public ? '，讀者現在可於文章下方看到' : '（該回應為「僅供作者閱讀」，不會公開顯示）'
            }`
          : '已駁回該回應，讀者不會看到',
      );
    } catch {
      setNotice('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // 送出／修改管理員回覆；空文字＝清除回覆（需確認）
  const submitReply = async (comment: AdminComment) => {
    const text = (replyDrafts[comment.id] ?? '').trim();
    if (!text) {
      if (!comment.admin_reply) return;
      if (!window.confirm('確定清除您先前對這則回應的回覆嗎？')) return;
    }
    setBusyId(comment.id);
    setNotice('');
    try {
      const res = await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comment.id, action: 'reply', replyText: text }),
      });
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      const updated: AdminComment = await res.json().catch(() => ({} as AdminComment));
      if (!res.ok || !updated.id) {
        setNotice('回覆儲存失敗，請稍後再試');
        return;
      }
      applyUpdated(updated);
      setNotice(text ? '已儲存您的回覆' : '已清除該回覆');
    } catch {
      setNotice('網路連線失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // 操作回來的最新資料：目前分頁中就地更新；若已不屬於本頁篩選則移除
  const applyUpdated = (updated: AdminComment) => {
    setComments((prev) => {
      const inList = prev.some((c) => c.id === updated.id);
      if (!inList) return prev;
      if (tab !== 'all' && updated.status !== tab) {
        return prev.filter((c) => c.id !== updated.id);
      }
      return prev.map((c) => (c.id === updated.id ? updated : c));
    });
    setReplyDrafts((prev) => ({ ...prev, [updated.id]: updated.admin_reply ?? '' }));
    loadCounts();
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

  const countOf = (key: TabKey): number | null => {
    if (key === 'all') return counts.total;
    return counts[key];
  };

  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* 頂部列 */}
        <header className="mb-6 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 sm:gap-3">
            <MessageSquare className="w-6 h-6 sm:w-9 sm:h-9 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>回應審核與回覆</span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => loadList(tab)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-blue-200 dark:border-blue-800"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${listLoading ? 'animate-spin' : ''}`} />
              重新整理
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

        {/* 狀態分頁 */}
        <div className="flex flex-wrap gap-2 mb-5">
          {TABS.map((t) => {
            const active = tab === t.key;
            const n = countOf(t.key);
            const isPendingTab = t.key === 'pending';
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-full font-bold text-sm border-2 transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-emerald-500'
                }`}
              >
                {t.label}
                {n !== null && (
                  <span
                    className={`min-w-[22px] h-[22px] px-1 rounded-full text-xs font-bold flex items-center justify-center ${
                      active
                        ? 'bg-white/25 text-white'
                        : isPendingTab && n > 0
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                    }`}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {notice && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
            {notice}
          </div>
        )}

        {listLoading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-500 dark:text-slate-400 font-bold text-lg">
            <Loader2 className="w-6 h-6 animate-spin" />
            載入回應中...
          </div>
        ) : loadingError ? (
          <div className="py-20 text-center">
            <p className="text-red-600 font-bold mb-4">{loadingError}</p>
            <button
              onClick={() => loadList(tab)}
              className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold hover:bg-emerald-800 transition"
            >
              重新整理
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-20 text-center text-gray-500 dark:text-slate-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-bold">
              {tab === 'pending'
                ? '目前沒有待審核的回應'
                : tab === 'approved'
                  ? '尚未有已通過的回應'
                  : tab === 'rejected'
                    ? '沒有已駁回的回應'
                    : '還沒有任何讀者回應'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((c) => {
              const replyDraft = replyDrafts[c.id] ?? '';
              const replyChanged = replyDraft.trim() !== (c.admin_reply ?? '');
              return (
                <article
                  key={c.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl shadow-md border-2 p-4 sm:p-6 ${
                    c.status === 'pending'
                      ? 'border-amber-300 dark:border-amber-700'
                      : c.status === 'rejected'
                        ? 'border-red-200 dark:border-red-900/60 opacity-90'
                        : 'border-gray-200 dark:border-slate-800'
                  }`}
                >
                  {/* 頭部：文章／狀態／時間 */}
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm mb-3">
                    <button
                      onClick={() => router.push(`/?postId=${c.post_id}`)}
                      className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline text-left"
                      title="前往該篇文章（讀者板面）"
                    >
                      📖 {c.post_title ?? `文章 #${c.post_id}（已不存在）`}
                    </button>
                    {c.post_is_deleted && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 font-bold">
                        文章已刪
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        c.status === 'pending'
                          ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          : c.status === 'approved'
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                            : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {c.status === 'pending' ? '待審核' : c.status === 'approved' ? '已通過' : '已駁回'}
                    </span>
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${
                        c.is_public
                          ? 'bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                      }`}
                      title={c.is_public ? '回應者同意公開' : '回應者選擇「僅供作者閱讀」'}
                    >
                      {c.is_public ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {c.is_public ? '同意公開' : '僅作者可見'}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400 ml-auto">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(c.created_at)}
                    </span>
                  </div>

                  {/* 回應者資料 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                    <span className="text-base sm:text-lg text-gray-900 dark:text-slate-100">
                      {c.user_name} {c.salutation}
                    </span>
                    {c.age_group && <span className="text-gray-500 font-normal">{c.age_group}</span>}
                    {c.faith_years && (
                      <span className="text-gray-500 font-normal">信主：{c.faith_years}</span>
                    )}
                    {c.church_name && <span className="text-gray-500 font-normal">教會：{c.church_name}</span>}
                  </div>

                  {/* 回應內容 */}
                  <p className="whitespace-pre-wrap text-base sm:text-lg leading-relaxed text-gray-800 dark:text-slate-200 bg-amber-50/40 dark:bg-slate-800/40 rounded-xl p-3 sm:p-4 border border-amber-100 dark:border-slate-700">
                    {c.comment_text}
                  </p>

                  {/* 管理員回覆區 */}
                  <div className="mt-4 ml-2 sm:ml-6 border-l-4 border-violet-400 dark:border-violet-600 pl-3 sm:pl-4">
                    <label className="flex items-center gap-1.5 text-sm font-bold text-violet-700 dark:text-violet-300 mb-1.5">
                      <CornerDownRight className="w-4 h-4" />
                      作者回覆{c.admin_reply ? `（${formatTime(c.replied_at)}）` : ''}
                    </label>
                    <textarea
                      value={replyDraft}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      rows={c.admin_reply ? 3 : 2}
                      maxLength={5000}
                      placeholder="以作者身分回覆這位讀者（通過審核後，回覆會顯示在文章下方；留空不送出）"
                      className="w-full p-2.5 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base outline-none focus:border-violet-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-y"
                    />
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <button
                        onClick={() => submitReply(c)}
                        disabled={busyId === c.id || !replyChanged || !replyDraft.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                        {c.admin_reply ? '儲存回覆修改' : '送出回覆'}
                      </button>
                      {c.admin_reply && (
                        <button
                          onClick={() => submitReply(c)}
                          disabled={busyId === c.id || replyDraft.trim() !== ''}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold text-sm border-2 border-gray-300 dark:border-slate-600 hover:opacity-80 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                          清除回覆
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 審核操作列 */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex gap-2 flex-wrap">
                    {busyId === c.id && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
                    {c.status !== 'approved' && (
                      <button
                        onClick={() => changeStatus(c, 'approved')}
                        disabled={busyId === c.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 transition disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        {c.status === 'rejected' ? '重新通過' : '審核通過'}
                      </button>
                    )}
                    {c.status !== 'rejected' && (
                      <button
                        onClick={() => changeStatus(c, 'rejected')}
                        disabled={busyId === c.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-bold text-sm border-2 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        駁回
                      </button>
                    )}
                    {c.status === 'approved' && (
                      <span className="text-sm text-gray-400 font-bold self-center">
                        {c.is_public ? '目前對讀者公開中' : '已通過，但讀者因私隱選擇不會看到'}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
