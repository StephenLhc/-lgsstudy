'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Lock,
  LogOut,
  Loader2,
  Pencil,
  Eye,
  ChevronRight,
  FolderKanban,
  Trash2,
  MessageSquare,
  Images,
  BarChart3,
} from 'lucide-react';

// 作者後台入口：先輸入密碼，登入後顯示「寫新文章 / 讀者板面」兩選一選單
export default function AdminHomePage() {
  const router = useRouter();

  // checking：開啟時檢查 cookie；login：密碼閘；menu：兩選一選單
  const [phase, setPhase] = useState<'checking' | 'login' | 'menu'>('checking');

  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // 回收站內已刪文章數量，用於選單卡片上的徽章
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  // 待審核讀者回應數量，用於選單卡片上的紅色徽章
  const [pendingComments, setPendingComments] = useState<number | null>(null);

  // 開啟時檢查是否已登入；已登入直接顯示選單
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/admin/login');
        setPhase(res.ok ? 'menu' : 'login');
      } catch {
        setPhase('login');
      }
    }
    checkSession();
  }, []);

  // 進入選單後讀取回收站文章數量與待審核回應數量
  useEffect(() => {
    if (phase !== 'menu') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/posts');
        if (!res.ok) return;
        const all: Array<{ is_deleted?: boolean }> = await res.json();
        if (!cancelled) setDeletedCount(all.filter((p) => p.is_deleted).length);
      } catch {
        // 數量徽章載入失敗不影響選單使用
      }
      try {
        const res = await fetch('/api/admin/comments?summary=1');
        if (res.ok) {
          const summary = await res.json();
          if (!cancelled) setPendingComments(Number(summary.pending) || 0);
        }
      } catch {
        // 待審數量徽章載入失敗不影響選單使用
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error || '登入失敗，請再試一次');
        return;
      }
      setPhase('menu');
    } catch {
      setLoginError('網路連線失敗，請再試一次');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      setPasswordInput('');
      setPhase('login');
    }
  };

  // 開啟載入中
  if (phase === 'checking') {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-2xl font-bold">
          <Loader2 className="w-8 h-8 animate-spin" />
          正在確認登入狀態...
        </div>
      </div>
    );
  }

  // 登入密碼閘
  if (phase === 'login') {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <BookOpen className="w-8 h-8 text-emerald-700 dark:text-emerald-400" />
            <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">作者後台</h1>
          </div>
          <p className="text-center text-gray-500 dark:text-slate-400 mb-6">
            讀經分享和心得 · 寫文與發布專區
          </p>

          <label className="block text-gray-700 dark:text-slate-300 font-bold mb-2">
            請輸入後台密碼
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="密碼"
              autoFocus
              className="w-full p-3 pl-10 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          {loginError && <p className="text-red-600 font-bold mt-3 text-sm">{loginError}</p>}

          <button
            type="submit"
            disabled={loggingIn || !passwordInput}
            className="w-full mt-6 bg-emerald-700 text-white py-3 rounded-xl text-xl font-bold hover:bg-emerald-800 transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            登入
          </button>
        </form>
      </div>
    );
  }

  // 兩選一選單
  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 transition-colors">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 sm:gap-3">
            <BookOpen className="w-6 h-6 sm:w-9 sm:h-9 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>作者後台</span>
          </h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-gray-300 dark:border-slate-700 shrink-0"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            登出
          </button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {/* 選項 1：寫新文章 */}
          <button
            onClick={() => router.push('/admin/write')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 flex items-center justify-center text-emerald-700 dark:text-emerald-300 group-hover:scale-105 transition">
              <Pencil className="w-7 h-7" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                寫新文章
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                撰寫靈修分享、加入配圖並發布給讀者
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
              開始撰寫
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 2：管理文章 */}
          <button
            onClick={() => router.push('/admin/manage')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-amber-200 dark:border-amber-900/60 hover:border-amber-500 dark:hover:border-amber-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-700 dark:text-amber-300 group-hover:scale-105 transition">
              <FolderKanban className="w-7 h-7" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                管理文章
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                修改內容、刪除（只隱藏）或還原舊文章
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold">
              進入管理
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 3：回應審核 */}
          <button
            onClick={() => router.push('/admin/comments')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-violet-200 dark:border-violet-900/60 hover:border-violet-500 dark:hover:border-violet-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center text-violet-700 dark:text-violet-300 group-hover:scale-105 transition relative">
              <MessageSquare className="w-7 h-7" />
              {pendingComments !== null && pendingComments > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {pendingComments}
                </span>
              )}
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                回應審核
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                {pendingComments !== null && pendingComments > 0
                  ? `有 ${pendingComments} 則新回應待審核，可通過、駁回或回覆留言`
                  : '審核讀者回應，並以作者身分回覆留言'}
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-violet-700 dark:text-violet-400 font-bold">
              進入審核
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 4：回收站 */}
          <button
            onClick={() => router.push('/admin/trash')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-gray-300 dark:border-slate-700 hover:border-gray-500 dark:hover:border-gray-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-slate-300 group-hover:scale-105 transition relative">
              <Trash2 className="w-7 h-7" />
              {deletedCount !== null && deletedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {deletedCount}
                </span>
              )}
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                回收站
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                {deletedCount !== null && deletedCount > 0
                  ? `有 ${deletedCount} 篇已刪文章，可一鍵還原或徹底刪除`
                  : '查看已刪除的文章，可隨時一鍵還原'}
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-gray-600 dark:text-slate-300 font-bold">
              進入回收站
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 5：媒體庫 */}
          <button
            onClick={() => router.push('/admin/media')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-pink-200 dark:border-pink-900/60 hover:border-pink-500 dark:hover:border-pink-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-pink-100 dark:bg-pink-950/60 flex items-center justify-center text-pink-700 dark:text-pink-300 group-hover:scale-105 transition">
              <Images className="w-7 h-7" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                媒體庫
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                統一管理文章配圖，之後擴展視頻
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-pink-700 dark:text-pink-400 font-bold">
              進入媒體庫
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 6：數據儀表板 */}
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-cyan-200 dark:border-cyan-900/60 hover:border-cyan-500 dark:hover:border-cyan-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-cyan-100 dark:bg-cyan-950/60 flex items-center justify-center text-cyan-700 dark:text-cyan-300 group-hover:scale-105 transition">
              <BarChart3 className="w-7 h-7" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                數據儀表板
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                瀏覽、讚好、回應與有待進步統計
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-cyan-700 dark:text-cyan-400 font-bold">
              查看數據
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          {/* 選項 7：讀者板面 */}
          <button
            onClick={() => router.push('/')}
            className="group bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border-2 border-blue-200 dark:border-blue-900 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition text-left flex flex-col gap-4"
          >
            <span className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950/70 flex items-center justify-center text-blue-700 dark:text-blue-300 group-hover:scale-105 transition">
              <Eye className="w-7 h-7" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                讀者板面
              </span>
              <span className="text-base text-gray-500 dark:text-slate-400">
                以讀者身分瀏覽已發布的靈修文章與互動狀況
              </span>
            </span>
            <span className="mt-auto flex items-center gap-1 text-blue-700 dark:text-blue-400 font-bold">
              前往閱讀
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
