'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, Trash2, Image, Video, Loader2,
  Check, AlertCircle, Copy, ExternalLink, FileImage,
} from 'lucide-react';

interface MediaItem {
  id: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  url: string;
  storage: string;
  is_video: boolean;
  width: number | null;
  height: number | null;
  duration: number | null;
  alt_text: string | null;
  created_at: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MediaLibraryPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tab, setTab] = useState<'images' | 'videos'>('images');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const isVideo = tab === 'videos';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/media?isVideo=${isVideo}`);
        if (!res.ok) {
          if (res.status === 401) { router.push('/admin'); return; }
          throw new Error(`HTTP ${res.status}`);
        }
        const list = await res.json();
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled) setError('載入媒體庫失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isVideo]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/media', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '上傳失敗');
      // 重新載入
      const res2 = await fetch(`/api/media?isVideo=${isVideo}`);
      const list = await res2.json();
      setItems(list);
      showToast('success', `上傳成功：${data.originalName || file.name}`);
    } catch (err) {
      showToast('error', String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個媒體嗎？如果有文章引用它，文章的配圖會失效。')) return;
    try {
      const res = await fetch(`/api/media?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      if (data.inUse) {
        showToast('success', '已刪除，但有文章曾引用此圖片');
      } else {
        showToast('success', '已刪除');
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      showToast('error', String(err));
    }
  };

  const copyUrl = async (id: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
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
            <FileImage className="w-6 h-6" />
            媒體庫
          </h1>
          <div className="w-20" />
        </header>

        {/* 分頁 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('images')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition ${
              tab === 'images'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 hover:border-emerald-500'
            }`}
          >
            <Image className="w-4 h-4" />
            圖片
          </button>
          <button
            onClick={() => setTab('videos')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition ${
              tab === 'videos'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 hover:border-emerald-500'
            }`}
          >
            <Video className="w-4 h-4" />
            視頻（預備）
          </button>
        </div>

        {/* 上傳區 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-400 dark:border-slate-600 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition mb-6 bg-white dark:bg-slate-900"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={isVideo ? 'video/*' : 'image/jpeg,image/png,image/gif,image/webp'}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-lg font-bold">上傳中...</span>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 mx-auto text-emerald-700 dark:text-emerald-400 mb-2" />
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200">
                點擊或拖放檔案到此處上傳
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {isVideo ? '視頻支援 MP4／WebM／MOV（上限 100MB）' : '圖片支援 JPG／PNG／GIF／WebP（上限 5MB）'}
              </p>
              {!process.env.BLOB_READ_WRITE_TOKEN && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ 本地開發模式：圖片暫存 public/uploads/，部署到 Vercel 後需設定 BLOB_READ_WRITE_TOKEN
                </p>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 p-3 rounded-xl mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 網格 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-slate-400">
            {isVideo ? '還沒有視頻' : '還沒有圖片'}，上傳第一個吧！
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition group"
              >
                {/* 預覽 */}
                <div className="aspect-square bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                  {item.is_video ? (
                    <Video className="w-12 h-12 text-gray-400 dark:text-slate-500" />
                  ) : (
                    <img
                      src={item.url}
                      alt={item.original_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  {/* 操作按鈕浮層 */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => copyUrl(item.id, item.url)}
                      title="複製連結"
                      className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-emerald-100 transition"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-700" />
                      )}
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="新視窗開啟"
                      className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-blue-100 transition"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-700" />
                    </a>
                    <button
                      onClick={() => handleDelete(item.id)}
                      title="刪除"
                      className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-100 transition"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                {/* 資訊 */}
                <div className="p-2.5">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={item.original_name}>
                    {item.original_name}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center justify-between">
                    <span>{formatSize(item.file_size)}</span>
                    <span>{formatDate(item.created_at).slice(0, 10)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 font-bold ${
            toast.type === 'success'
              ? 'bg-emerald-700 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </main>
  );
}
