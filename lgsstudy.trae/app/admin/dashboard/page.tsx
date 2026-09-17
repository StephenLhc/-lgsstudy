'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Eye, Heart, ThumbsDown, MessageSquare,
  FileText, Clock, TrendingUp, BarChart3, Download, Mail,
} from 'lucide-react';

interface StatsData {
  overview: {
    publishedPosts: number;
    scheduledPosts: number;
    deletedPosts: number;
    totalViews: number;
    totalLikes: number;
    totalDislikes: number;
    avgViews: number;
    subscribers: number;
    totalSubscribers: number;
    improvementRate: number;
  };
  comments: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    private: number;
  };
  posts: Array<{
    id: number;
    title: string;
    views: number;
    like_count: number;
    dislike_count: number;
    comment_count: number;
    post_date: string;
  }>;
  trend: Array<{ date: string; comments: number; posts: number }>;
  categories: Array<{
    category: string;
    posts: number;
    views: number;
    likes: number;
    dislikes: number;
  }>;
}

type RankKey = 'views' | 'like_count' | 'dislike_count';

function formatNum(n: number): string {
  return n.toLocaleString('zh-HK');
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rankTab, setRankTab] = useState<RankKey>('views');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/stats');
        if (res.status === 401) { router.push('/admin'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('統計資料載入失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  // 匯出 Excel 備份（含全部文章＋全部回應；Neon 冷連線時需等候）
  const handleExport = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      const res = await fetch('/api/admin/export');
      if (res.status === 401) { router.push('/admin'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // 從回應標頭取檔名，取不到就用今天日期
      let filename = '';
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (m) { try { filename = decodeURIComponent(m[1]); } catch {} }
      if (!filename) {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        filename = `靈修網站備份-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg('備份已下載');
      setTimeout(() => setExportMsg(''), 3000);
    } catch {
      setExportMsg('匯出失敗，請稍後再試');
      setTimeout(() => setExportMsg(''), 3000);
    } finally {
      setExporting(false);
    }
  };

  // 排行榜依目前分頁排序取前 5
  const ranking = useMemo(() => {
    if (!data) return [];
    return data.posts.slice().sort((a, b) => {
      const diff = b[rankTab] - a[rankTab];
      return diff !== 0 ? diff : b.views - a.views;
    }).slice(0, 5);
  }, [data, rankTab]);

  // 趨勢圖最大值（用於長條高度比例）
  const trendMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.trend.map((d) => Math.max(d.comments, d.posts)));
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-xl font-bold">
          <Loader2 className="w-7 h-7 animate-spin" />
          統計資料載入中（首次連線可能需等待）...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 hover:text-emerald-700 font-bold mb-4"
          >
            <ArrowLeft className="w-5 h-5" /> 後台主選單
          </button>
          <p className="text-red-600 text-lg font-bold">{error || '無法載入資料'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800"
          >
            重新整理
          </button>
        </div>
      </main>
    );
  }

  const { overview: ov, comments: cs, trend, categories } = data;

  const rankConfig: Record<RankKey, { label: string; icon: typeof Eye; color: string; bar: string }> = {
    views: { label: '瀏覽量', icon: Eye, color: 'text-blue-700 dark:text-blue-400', bar: 'bg-blue-500' },
    like_count: { label: '讚好', icon: Heart, color: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500' },
    dislike_count: { label: '有待進步', icon: ThumbsDown, color: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' },
  };

  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 頂部 */}
        <header className="mb-6 flex flex-row items-center justify-between gap-3">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 font-bold transition"
          >
            <ArrowLeft className="w-5 h-5" />
            後台主選單
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            數據儀表板
          </h1>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm md:text-base font-bold hover:bg-emerald-800 transition shadow disabled:opacity-60 whitespace-nowrap"
              title="下載含全部文章與回應的 Excel 備份"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? '匯出中…' : '匯出 Excel 備份'}
            </button>
            {exportMsg && (
              <span className={`text-xs font-bold ${exportMsg.includes('失敗') ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {exportMsg}
              </span>
            )}
          </div>
        </header>

        {/* ───── 四大核心指標 ───── */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-4">
          <StatCard
            icon={<Eye className="w-6 h-6" />}
            label="總瀏覽量"
            value={formatNum(ov.totalViews)}
            sub={`平均每篇 ${formatNum(ov.avgViews)} 次`}
            color="blue"
          />
          <StatCard
            icon={<Heart className="w-6 h-6" />}
            label="總讚好"
            value={formatNum(ov.totalLikes)}
            sub={`每篇平均 ${ov.publishedPosts ? (ov.totalLikes / ov.publishedPosts).toFixed(1) : '0'} 個`}
            color="rose"
          />
          <StatCard
            icon={<ThumbsDown className="w-6 h-6" />}
            label="有待進步"
            value={formatNum(ov.totalDislikes)}
            sub={`佔互動 ${ov.improvementRate}%`}
            color="amber"
          />
          <StatCard
            icon={<MessageSquare className="w-6 h-6" />}
            label="回應總數"
            value={formatNum(cs.total)}
            sub={`已公開 ${cs.approved - cs.private > 0 ? cs.approved - cs.private : 0} 則`}
            color="violet"
          />
          <StatCard
            icon={<Mail className="w-6 h-6" />}
            label="電郵訂閱"
            value={formatNum(ov.subscribers)}
            sub={`累計 ${ov.totalSubscribers} 人訂閱過`}
            color="cyan"
          />
        </section>

        {/* ───── 文章與審核狀態 ───── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 mb-6">
          {/* 文章狀態 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 md:p-5">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              文章狀態
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="已發布" value={ov.publishedPosts} tone="emerald" />
              <MiniStat label="排程中" value={ov.scheduledPosts} tone="sky" />
              <MiniStat label="回收站" value={ov.deletedPosts} tone="gray" />
            </div>
          </div>

          {/* 回應審核狀態 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 md:p-5">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-violet-700 dark:text-violet-400" />
              回應審核
              {cs.pending > 0 && (
                <span className="ml-auto text-sm bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded-full">
                  {cs.pending} 則待審
                </span>
              )}
            </h2>
            <div className="grid grid-cols-4 gap-2 text-center">
              <MiniStat label="待審核" value={cs.pending} tone="red" />
              <MiniStat label="已通過" value={cs.approved} tone="emerald" />
              <MiniStat label="已駁回" value={cs.rejected} tone="gray" />
              <MiniStat label="私密" value={cs.private} tone="sky" />
            </div>
          </div>
        </section>

        {/* ───── 最近 14 天趨勢 ───── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 md:p-6 mb-6">
          <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            最近 14 天動態
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
            <span className="inline-block w-3 h-3 rounded-sm bg-violet-500 mr-1 align-middle" /> 新回應
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 mr-1 ml-4 align-middle" /> 新發文
          </p>
          <div className="flex items-end gap-1 md:gap-2 h-40 border-b border-gray-200 dark:border-slate-700 pb-1">
            {trend.map((d) => {
              const cH = Math.round((d.comments / trendMax) * 100);
              const pH = Math.round((d.posts / trendMax) * 100);
              return (
                <div key={d.date} className="flex-1 flex flex-col justify-end items-center gap-0.5 group relative">
                  {/* 懸浮提示 */}
                  <div className="absolute -top-2 -translate-y-full opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 bg-slate-900 text-white text-[11px] rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
                    {d.date.slice(5)}：{d.comments} 回應／{d.posts} 文
                  </div>
                  <div className="w-full flex items-end justify-center gap-0.5 h-32">
                    <div
                      className="w-1/2 bg-violet-400 group-hover:bg-violet-600 rounded-t transition-all"
                      style={{ height: `${Math.max(cH, d.comments > 0 ? 4 : 0)}%` }}
                    />
                    <div
                      className="w-1/2 bg-emerald-400 group-hover:bg-emerald-600 rounded-t transition-all"
                      style={{ height: `${Math.max(pH, d.posts > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 md:gap-2 mt-1">
            {trend.map((d, i) => (
              <span
                key={d.date}
                className={`flex-1 text-center text-[10px] text-gray-400 dark:text-slate-500 ${i % 2 === 0 ? '' : 'invisible md:visible'}`}
              >
                {d.date.slice(8, 10)}
              </span>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 mb-6">
          {/* ───── 文章排行榜 ───── */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 md:p-6">
            <h2 className="font-bold text-lg mb-3">文章排行榜 Top 5</h2>
            <div className="flex gap-2 mb-4">
              {(Object.keys(rankConfig) as RankKey[]).map((k) => {
                const cfg = rankConfig[k];
                const Icon = cfg.icon;
                const active = rankTab === k;
                return (
                  <button
                    key={k}
                    onClick={() => setRankTab(k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                      active
                        ? 'bg-emerald-700 text-white shadow'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <ol className="space-y-2.5">
              {ranking.map((p, i) => {
                const max = ranking[0]?.[rankTab] || 1;
                const Icon = rankConfig[rankTab].icon;
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                        i === 0 ? 'bg-amber-400 text-white'
                        : i === 1 ? 'bg-slate-300 text-white'
                        : i === 2 ? 'bg-orange-700 text-white'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" title={p.title}>{p.title}</p>
                      <div className="h-1.5 mt-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${rankConfig[rankTab].bar} rounded-full`}
                          style={{ width: `${Math.max(6, (p[rankTab] / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-sm font-bold shrink-0 flex items-center gap-1 ${rankConfig[rankTab].color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {formatNum(p[rankTab])}
                    </span>
                  </li>
                );
              })}
              {ranking.length === 0 && (
                <li className="text-center text-gray-400 py-6 text-sm">暫無資料</li>
              )}
            </ol>
          </section>

          {/* ───── 分類表現 ───── */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 md:p-6">
            <h2 className="font-bold text-lg mb-3">分類表現</h2>
            <div className="space-y-2">
              {/* 表頭 */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-xs font-bold text-gray-400 dark:text-slate-500 px-1">
                <span>分類</span>
                <span className="w-12 text-right">文章</span>
                <span className="w-14 text-right">瀏覽</span>
                <span className="w-10 text-right">讚</span>
              </div>
              {categories.map((c) => (
                <div
                  key={c.category}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-sm py-1.5 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50"
                >
                  <span className="font-bold truncate bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md text-xs w-fit max-w-full">
                    {c.category}
                  </span>
                  <span className="w-12 text-right tabular-nums">{c.posts}</span>
                  <span className="w-14 text-right tabular-nums text-blue-700 dark:text-blue-400 font-bold">
                    {formatNum(c.views)}
                  </span>
                  <span className="w-10 text-right tabular-nums text-rose-600 dark:text-rose-400">
                    {c.likes}
                  </span>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-center text-gray-400 py-6 text-sm">暫無分類資料</p>
              )}
            </div>
          </section>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-slate-600 flex items-center justify-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          瀏覽量為累計計數；回應與發文趨勢以香港時區按日統計
        </p>
        <p className="text-center text-xs text-gray-400 dark:text-slate-600 mt-1">
          Excel 備份含全部文章與回應（含待審、私密、已刪文章）；配圖僅記錄網址，圖檔本身由圖床保留
        </p>
      </div>
    </main>
  );
}

// 大指標卡片
function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'blue' | 'rose' | 'amber' | 'violet' | 'cyan';
}) {
  const colors = {
    blue: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
    rose: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    amber: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    violet: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900',
    cyan: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900',
  };
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm md:text-base font-bold">{label}</span>
      </div>
      <p className="text-2xl md:text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-xs md:text-sm text-gray-500 dark:text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

// 小數字格
function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-700 dark:text-emerald-400',
    sky: 'text-sky-700 dark:text-sky-400',
    gray: 'text-gray-500 dark:text-slate-400',
    red: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl py-2.5">
      <p className={`text-xl font-extrabold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
