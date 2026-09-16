'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  LogOut,
  UploadCloud,
  Link2,
  Send,
  Loader2,
  CheckCircle2,
  X,
  Eye,
  ImageIcon,
  ArrowLeft,
  Save,
  Plus,
  BookMarked,
  ChevronRight,
} from 'lucide-react';
import {
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
  getChapterCount,
  getVerseCount,
} from '@/lib/bible-data';

interface AdminPost {
  id: number;
  title: string;
  scripture: string;
  category: string | null;
  content: string;
  post_date: string;
  image_url: string | null;
  is_deleted: boolean;
}

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ───────────────────────── 草稿自動儲存（localStorage） ─────────────────────────
// 新建與編輯各自獨立：新建固定一個位置，編輯則依文章 id 隔離，不會互相覆蓋
const DRAFT_KEY_NEW = 'lgsstudy_draft_new';
const DRAFT_POST_PREFIX = 'lgsstudy_draft_post_';

interface DraftData {
  title: string;
  postDate: string;
  scriptureA: string;
  scriptureB: string;
  selectedCategories: string[];
  content: string;
  imageMode: 'url' | 'upload';
  imageUrl: string;
  // File 物件無法存進 localStorage，只記錄檔名作為還原後重新選圖的提示
  imageFileName: string;
  savedAt: number;
}

// 用於判斷「目前表單」與「上次已存草稿」是否相同（指紋比對，避免還原草稿瞬間誤判為變更）
interface DraftFpInput {
  title: string;
  postDate: string;
  scriptureA: string;
  scriptureB: string;
  selectedCategories: string[];
  content: string;
  imageMode: 'url' | 'upload';
  imageUrl: string;
  imageFileToken: string;
}

function draftKeyFor(isEdit: boolean, editId: number): string {
  return isEdit ? `${DRAFT_POST_PREFIX}${editId}` : DRAFT_KEY_NEW;
}

function fingerprintOf(v: DraftFpInput): string {
  return JSON.stringify([
    v.title,
    v.postDate,
    v.scriptureA,
    v.scriptureB,
    JSON.stringify(v.selectedCategories),
    v.content,
    v.imageMode,
    v.imageUrl.trim(),
    v.imageFileToken,
  ]);
}

// 空白表單（或僅有預設值）不算草稿，避免一直存無意義的內容
function draftHasContent(d: DraftData | null): boolean {
  if (!d) return false;
  return Boolean(
    d.title.trim() ||
      d.scriptureA.trim() ||
      d.scriptureB.trim() ||
      d.content.trim() ||
      d.imageUrl.trim() ||
      d.imageFileName,
  );
}

function readDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<DraftData>;
    if (!d || typeof d !== 'object') return null;
    const categories = Array.isArray(d.selectedCategories)
      ? d.selectedCategories.filter((x): x is string => typeof x === 'string').slice(0, 3)
      : [];
    return {
      title: typeof d.title === 'string' ? d.title : '',
      postDate: typeof d.postDate === 'string' ? d.postDate : getTodayString(),
      scriptureA: typeof d.scriptureA === 'string' ? d.scriptureA : '',
      scriptureB: typeof d.scriptureB === 'string' ? d.scriptureB : '',
      selectedCategories: categories.length ? categories : ['靈修默想'],
      content: typeof d.content === 'string' ? d.content : '',
      imageMode: d.imageMode === 'upload' ? 'upload' : 'url',
      imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : '',
      imageFileName: typeof d.imageFileName === 'string' ? d.imageFileName : '',
      savedAt: Number.isFinite(Number(d.savedAt)) ? Number(d.savedAt) : Date.now(),
    };
  } catch {
    return null;
  }
}

function defaultDraftBaseline(): DraftFpInput {
  return {
    title: '',
    postDate: getTodayString(),
    scriptureA: '',
    scriptureB: '',
    selectedCategories: ['靈修默想'],
    content: '',
    imageMode: 'url',
    imageUrl: '',
    imageFileToken: '',
  };
}

function formatSavedAt(ts: number): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function WriteEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 網址帶 ?id= 時為編輯模式
  const editId = Number(searchParams.get('id'));
  const isEdit = Number.isInteger(editId) && editId > 0;

  // 草稿儲存位置：新建用固定 key，編輯用文章 id 隔離
  const draftKey = draftKeyFor(isEdit, editId);

  // 開啟時檢查登入狀態，未登入直接跳回 /admin 密碼閘
  const [ready, setReady] = useState(false);

  // 編輯模式下文章原本的配圖（沒換新圖時沿用）
  const [existingImage, setExistingImage] = useState<string | null>(null);

  // 文章欄位（經文最多兩段，發布時以「；」合併；分類最多三個，以「、」合併）
  const [title, setTitle] = useState('');
  const [postDate, setPostDate] = useState(getTodayString());
  const [scriptureA, setScriptureA] = useState('');
  const [scriptureB, setScriptureB] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['靈修默想']);
  const [categoryNotice, setCategoryNotice] = useState('');
  const [content, setContent] = useState('');

  // 配圖：網址 或 上傳（二選一）
  const [imageMode, setImageMode] = useState<'url' | 'upload'>('url');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string>('');

  // 發布狀態
  const [submitting, setSubmitting] = useState(false);
  // 發布自動重試目前跑到第幾輪（1＝首次，2＝自動再試），用於按鈕提示
  const [submitRound, setSubmitRound] = useState(0);
  const [publishError, setPublishError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // ───── 草稿自動儲存狀態 ─────
  // idle＝尚無草稿；unsaved＝有變更待儲存；saved＝已存入本機瀏覽器；error＝儲存失敗
  const [draftStatus, setDraftStatus] = useState<'idle' | 'unsaved' | 'saved' | 'error'>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  // 進入頁面時偵測到的舊草稿，等待作者選擇「還原」或「捨棄」
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  // 還原草稿時上傳檔無法自動帶回，由此提示重新選圖
  const [draftImageNotice, setDraftImageNotice] = useState('');
  // 最近一次已存草稿（或已載入文章）的指紋，用於判斷是否真的有變更
  const lastSavedFpRef = useRef('');

  // 既有分類（給按鈕選項）
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  // 經文挑選面板（由左至右逐欄展開：書卷 → 由章 → 由節 → 至章 → 至節，可跨章）、分類新增表單
  const [showScripturePicker, setShowScripturePicker] = useState(false);
  const [pickerBook, setPickerBook] = useState('');
  const [pickerStartChapter, setPickerStartChapter] = useState(0);
  const [pickerStartVerse, setPickerStartVerse] = useState<number | null>(null);
  const [pickerEndChapter, setPickerEndChapter] = useState(0);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categoryError, setCategoryError] = useState('');
  // 經文挑選面板目前要寫入哪一段（0＝第一段、1＝第二段）
  const [pickerTarget, setPickerTarget] = useState(0);
  const scriptureARef = useRef<HTMLInputElement>(null);
  const scriptureBRef = useRef<HTMLInputElement>(null);
  const pickerColumnsRef = useRef<HTMLDivElement>(null);

  // 每當右側新欄位展開，自動把面板橫向捲到最右，確保最新的選擇欄立即可見
  useEffect(() => {
    const el = pickerColumnsRef.current;
    if (showScripturePicker && el) el.scrollLeft = el.scrollWidth;
  }, [showScripturePicker, pickerBook, pickerStartChapter, pickerStartVerse, pickerEndChapter]);

  // 分類正規化：去除前後空白（含全形空白）、不分大小寫，作為重複比對的依據
  const normalizeCategory = (c: string) => c.replace(/^[\s　]+|[\s　]+$/g, '').toLowerCase();

  // 分類按鈕選項＝預設值＋現有分類＋目前輸入值，並依正規化結果去除重複（保留首次出現的寫法）
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of ['靈修默想', ...selectedCategories, ...existingCategories]) {
      const trimmed = c?.trim();
      if (!trimmed) continue;
      const key = normalizeCategory(trimmed);
      if (!map.has(key)) map.set(key, trimmed);
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories, existingCategories]);

  // 預覽用的有效圖片：優先新選的檔案，再來是貼的網址，最後沿用原圖
  const previewImage = useMemo(() => {
    if (imageMode === 'upload') {
      if (imagePreview) return imagePreview;
      // 編輯時原圖若是上傳檔，在「上傳」頁籤也一併顯示
      if (isEdit && existingImage && !/^https?:\/\//i.test(existingImage)) return existingImage;
      return '';
    }
    return imageUrl.trim() || (isEdit ? existingImage ?? '' : '');
  }, [imageMode, imagePreview, imageUrl, isEdit, existingImage]);

  // ───────────────────────── 草稿函式 ─────────────────────────
  const buildDraft = (): DraftData => ({
    title,
    postDate,
    scriptureA,
    scriptureB,
    selectedCategories: [...selectedCategories],
    content,
    imageMode,
    imageUrl: imageUrl.trim(),
    imageFileName: imageFile?.name ?? '',
    savedAt: Date.now(),
  });

  const currentFingerprint = (): string =>
    fingerprintOf({
      title,
      postDate,
      scriptureA,
      scriptureB,
      selectedCategories,
      content,
      imageMode,
      imageUrl,
      imageFileToken: imageFile ? `${imageFile.name}:${imageFile.size}:${imageFile.lastModified}` : '',
    });

  // 每輪渲染更新最新值，提供 30 秒定時器與 beforeunload 兜底使用（避免閉包抓到舊值）
  const latestFpRef = useRef('');
  latestFpRef.current = currentFingerprint();
  const buildDraftRef = useRef(buildDraft);
  buildDraftRef.current = buildDraft;
  const showSuccessRef = useRef(showSuccess);
  showSuccessRef.current = showSuccess;

  // 立即把草稿寫入 localStorage（空白表單則移除草稿）
  const persistDraftNow = (): boolean => {
    const draft = buildDraft();
    try {
      if (!draftHasContent(draft)) {
        localStorage.removeItem(draftKey);
        lastSavedFpRef.current = currentFingerprint();
        setDraftStatus('idle');
        setDraftSavedAt(null);
        return true;
      }
      localStorage.setItem(draftKey, JSON.stringify(draft));
      lastSavedFpRef.current = currentFingerprint();
      setDraftStatus('saved');
      setDraftSavedAt(draft.savedAt);
      return true;
    } catch {
      setDraftStatus('error');
      return false;
    }
  };
  const persistDraftRef = useRef(persistDraftNow);
  persistDraftRef.current = persistDraftNow;

  // 文章欄位載入完成後比對舊草稿：與已發布內容相同就清掉，不同才提示還原
  const initDraftCheck = (baseline: DraftFpInput) => {
    lastSavedFpRef.current = fingerprintOf(baseline);
    const draft = readDraft(draftKey);
    if (!draft || !draftHasContent(draft)) return;
    const draftFp = fingerprintOf({
      title: draft.title,
      postDate: draft.postDate,
      scriptureA: draft.scriptureA,
      scriptureB: draft.scriptureB,
      selectedCategories: draft.selectedCategories,
      content: draft.content,
      imageMode: draft.imageMode,
      imageUrl: draft.imageUrl,
      imageFileToken: '',
    });
    if (draftFp === fingerprintOf(baseline)) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // 無法清除也不影響使用
      }
      return;
    }
    setPendingDraft(draft);
  };

  // 還原草稿：把所有欄位帶回表單；上傳檔瀏覽器不容許自動帶回，僅提示重新選擇
  const restoreDraft = (d: DraftData) => {
    setTitle(d.title);
    setPostDate(d.postDate || getTodayString());
    setScriptureA(d.scriptureA);
    setScriptureB(d.scriptureB);
    setSelectedCategories(d.selectedCategories.length ? d.selectedCategories.slice(0, 3) : ['靈修默想']);
    setContent(d.content);
    setImageMode(d.imageMode);
    setImageUrl(d.imageUrl);
    setDraftImageNotice(
      d.imageMode === 'upload' && d.imageFileName
        ? `草稿中的上傳圖片「${d.imageFileName}」需重新選擇（瀏覽器不容許自動帶回檔案；編輯文章時原圖仍會保留）。`
        : '',
    );
    // 把基線設成還原後的狀態，防抖效果就不會把這次載入誤判為新變更
    lastSavedFpRef.current = fingerprintOf({
      title: d.title,
      postDate: d.postDate || getTodayString(),
      scriptureA: d.scriptureA,
      scriptureB: d.scriptureB,
      selectedCategories: d.selectedCategories.length ? d.selectedCategories.slice(0, 3) : ['靈修默想'],
      content: d.content,
      imageMode: d.imageMode,
      imageUrl: d.imageUrl,
      imageFileToken: '',
    });
    setDraftStatus('saved');
    setDraftSavedAt(d.savedAt);
    setPendingDraft(null);
  };

  const discardPendingDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // 忽略
    }
    setPendingDraft(null);
  };

  // 手動放棄草稿：只刪本機備份，表單內容維持不變
  const clearDraft = () => {
    if (!window.confirm('確定放棄已儲存的草稿備份？（表單上的內容不會被清空）')) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // 忽略
    }
    lastSavedFpRef.current = latestFpRef.current;
    setDraftStatus('idle');
    setDraftSavedAt(null);
  };

  // 手動「立即儲存」按鈕是否可用：表單完全空白時不用存
  const hasDraftContentNow = Boolean(
    title.trim() ||
      scriptureA.trim() ||
      scriptureB.trim() ||
      content.trim() ||
      imageUrl.trim() ||
      imageFile,
  );

  // 開啟頁面時檢查是否已登入（未登入跳回 /admin）；
  // 編輯模式下從管理員列表撈出該文章並預載所有欄位
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/admin/login');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        const postsRes = await fetch('/api/admin/posts');
        if (!postsRes.ok) {
          if (postsRes.status === 401) {
            router.replace('/admin');
            return;
          }
          // 網路不穩拿不到列表：新建模式仍可用預設基線比對草稿；編輯模式無從比對，跳過提示
          if (!isEdit) initDraftCheck(defaultDraftBaseline());
          setReady(true);
          return;
        }
        const posts: AdminPost[] = await postsRes.json();
        // 從「未刪除」的文章收集分類，並依正規化結果去重（防呆：若資料庫曾有大小寫或空白變體）
        setExistingCategories((prev) => {
          const map = new Map<string, string>();
          for (const c of [
            ...prev,
            ...(posts
              .filter((p) => !p.is_deleted)
              .map((p) => p.category)
              .filter(Boolean) as string[]),
          ]) {
            const trimmed = c.trim();
            if (!trimmed) continue;
            const key = normalizeCategory(trimmed);
            if (!map.has(key)) map.set(key, trimmed);
          }
          return Array.from(map.values());
        });

        // 文章載入後的草稿比對基線（新建為預設空白表單）
        let baseline: DraftFpInput | null = isEdit ? null : defaultDraftBaseline();

        if (isEdit) {
          const target = posts.find((p) => p.id === editId);
          if (!target) {
            setPublishError('找不到要編輯的文章，可能已被移除');
          } else {
            setTitle(target.title);
            setPostDate(target.post_date.slice(0, 10) || getTodayString());
            // 經文以「；」分隔還原成兩段；分類以「、」分隔還原（最多三個）
            const scriptureParts = target.scripture.split('；').map((s) => s.trim()).filter(Boolean);
            setScriptureA(scriptureParts[0] ?? '');
            setScriptureB(scriptureParts[1] ?? '');
            const categoryParts = (target.category || '靈修默想')
              .split('、')
              .map((s) => s.trim())
              .filter(Boolean);
            const loadedCategories = categoryParts.length ? categoryParts.slice(0, 3) : ['靈修默想'];
            setSelectedCategories(loadedCategories);
            setContent(target.content);
            setExistingImage(target.image_url);
            // 原本是外部網址就帶入網址欄；本機上傳檔停留在上傳頁籤顯示原圖
            const isExternalImage = Boolean(target.image_url && /^https?:\/\//i.test(target.image_url));
            const loadedImageMode: 'url' | 'upload' = isExternalImage ? 'url' : target.image_url ? 'upload' : 'url';
            const loadedImageUrl = isExternalImage ? (target.image_url as string) : '';
            if (isExternalImage) setImageUrl(loadedImageUrl);
            setImageMode(loadedImageMode);
            // 建立與表單狀態一致的基線，供草稿指紋比對
            baseline = {
              title: target.title,
              postDate: target.post_date.slice(0, 10) || getTodayString(),
              scriptureA: scriptureParts[0] ?? '',
              scriptureB: scriptureParts[1] ?? '',
              selectedCategories: loadedCategories,
              content: target.content,
              imageMode: loadedImageMode,
              imageUrl: loadedImageUrl,
              imageFileToken: '',
            };
          }
        }
        if (baseline) initDraftCheck(baseline);
        setReady(true);
      } catch {
        router.replace('/admin');
      }
    }
    checkSession();

    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 第一層：欄位變更後靜止 3 秒自動寫入（指紋相同代表只是還原草稿，不重存）
  useEffect(() => {
    if (!ready || showSuccess) return;
    if (currentFingerprint() === lastSavedFpRef.current) return;
    setPendingDraft(null);
    setDraftStatus('unsaved');
    const timer = setTimeout(() => {
      persistDraftNow();
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    showSuccess,
    title,
    postDate,
    scriptureA,
    scriptureB,
    selectedCategories,
    content,
    imageMode,
    imageUrl,
    imageFile,
  ]);

  // 第二層：每 30 秒檢查一次，仍有未儲存變更就補存（對應長時間慢慢寫的狀況）
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (showSuccessRef.current) return;
      if (latestFpRef.current !== lastSavedFpRef.current) {
        persistDraftRef.current();
      }
    }, 30000);
    return () => clearInterval(id);
  }, [ready]);

  // 第三層：關閉分頁／重整／離開頁面前同步兜底（localStorage 寫入為同步，可在卸載前完成）
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (showSuccessRef.current) return;
      if (latestFpRef.current === lastSavedFpRef.current) return;
      try {
        const draft = buildDraftRef.current();
        if (draftHasContent(draft)) {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch {
        // 關頁階段無法提示，忽略
      }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [ready, draftKey]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.push('/admin');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError('');
    const file = e.target.files?.[0] ?? null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }

    if (!file) {
      setImageFile(null);
      setImagePreview('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('請選擇圖片檔（JPG、PNG、GIF 或 WebP）');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('圖片不可超過 5MB，請換一張較小的圖片');
      e.target.value = '';
      return;
    }

    setImageFile(file);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImagePreview(url);
  };

  const clearSelectedImage = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }
    setImageFile(null);
    setImagePreview('');
    setImageError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 打開經文挑選面板：target 為要寫入的段落（0／1），清空右側各欄由選書卷重新開始
  const openScripturePicker = (target: number) => {
    setPickerTarget(target);
    setPickerBook('');
    setPickerStartChapter(0);
    setPickerStartVerse(null);
    setPickerEndChapter(0);
    setShowScripturePicker(true);
  };

  // 選書卷：右邊展開「由第幾章」欄，並重設更右邊的選擇
  const handleSelectBook = (book: string) => {
    setPickerBook(book);
    setPickerStartChapter(0);
    setPickerStartVerse(null);
    setPickerEndChapter(0);
  };

  // 選「由第幾章」：結尾章預設與起始章相同（作者可再改），其餘右側選擇重設
  const handleSelectStartChapter = (chapter: number) => {
    setPickerStartChapter(chapter);
    setPickerStartVerse(null);
    setPickerEndChapter(chapter);
  };

  // 選「由第幾節」
  const handleSelectStartVerse = (verse: number) => {
    setPickerStartVerse(verse);
  };

  // 選「至第幾章」：不可早於起始章；改章後要重選結尾節
  const handleSelectEndChapter = (chapter: number) => {
    if (chapter < pickerStartChapter) return;
    setPickerEndChapter(chapter);
  };

  // 把最終經文字串寫入目前目標段（尾端留空白，方便作者再手動補字）並關閉面板
  const commitScripture = (value: string) => {
    if (pickerTarget === 1) setScriptureB(value);
    else setScriptureA(value);
    setShowScripturePicker(false);
    requestAnimationFrame(() => {
      const el = pickerTarget === 1 ? scriptureBRef.current : scriptureARef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  // 只要「書卷 章」，不指定節
  const handleCommitChapterOnly = () => {
    if (pickerBook && pickerStartChapter) commitScripture(`${pickerBook} ${pickerStartChapter} `);
  };

  // 選「至第幾節」後即完成：
  // 同章同節＝只選一節；同章不同節＝章內範圍；不同章＝跨章範圍（如 3:16-4:2）
  const handleSelectEndVerse = (verse: number) => {
    if (pickerStartVerse === null || !pickerEndChapter) return;
    if (pickerEndChapter === pickerStartChapter && verse < pickerStartVerse) return;

    if (pickerEndChapter === pickerStartChapter) {
      if (verse === pickerStartVerse) {
        commitScripture(`${pickerBook} ${pickerStartChapter}:${verse} `);
        return;
      }
      commitScripture(`${pickerBook} ${pickerStartChapter}:${pickerStartVerse}-${verse} `);
      return;
    }
    commitScripture(`${pickerBook} ${pickerStartChapter}:${pickerStartVerse}-${pickerEndChapter}:${verse} `);
  };

  // 點分類按鈕：已選→取消；未選→加入（最多三個，超出時提示）
  const toggleCategory = (c: string) => {
    setCategoryNotice('');
    if (selectedCategories.includes(c)) {
      setSelectedCategories((prev) => prev.filter((x) => x !== c));
      return;
    }
    if (selectedCategories.length >= 3) {
      setCategoryNotice('主題分類最多可以選三個，請先取消一個再選新的');
      return;
    }
    setSelectedCategories((prev) => [...prev, c]);
  };

  // 即時新增一個自訂分類並選取它；加入前先檢查，名稱重複（不分大小寫、忽略前後空白）一律擋下
  const handleAddCategory = () => {
    const value = newCategory.trim();
    if (!value) return;

    const duplicated = categoryOptions.find((c) => normalizeCategory(c) === normalizeCategory(value));
    if (duplicated) {
      setCategoryError(`「${duplicated}」分類已存在，請直接點選既有的按鈕，不必重複新增`);
      // 直接幫作者選好既有的同名分類（仍受最多三個限制）
      if (selectedCategories.length < 3) {
        setSelectedCategories((prev) =>
          prev.some((x) => normalizeCategory(x) === normalizeCategory(duplicated)) ? prev : [...prev, duplicated],
        );
      }
      return;
    }

    setCategoryError('');
    setExistingCategories((prev) => [...prev, value]);
    if (selectedCategories.length >= 3) {
      setCategoryNotice(`「${value}」已加入分類選項；目前最多只可選三個，請先取消一個再選它`);
    } else {
      setSelectedCategories((prev) => [...prev, value]);
    }
    setNewCategory('');
    setShowAddCategory(false);
  };

  const resetForm = () => {
    setTitle('');
    setPostDate(getTodayString());
    setScriptureA('');
    setScriptureB('');
    setSelectedCategories(['靈修默想']);
    setCategoryNotice('');
    setContent('');
    setImageUrl('');
    clearSelectedImage();
    setShowAddCategory(false);
    setNewCategory('');
    setCategoryError('');
    setShowScripturePicker(false);
    setPublishError('');
    setShowSuccess(false);
    // 發布成功後草稿已刪除，重設為空白基線，避免空白表單又被當成變更加以備份
    lastSavedFpRef.current = fingerprintOf(defaultDraftBaseline());
    setDraftStatus('idle');
    setDraftSavedAt(null);
    setPendingDraft(null);
    setDraftImageNotice('');
  };

  const handlePublish = async () => {
    setPublishError('');

    if (!title.trim() || !scriptureA.trim() || !content.trim()) {
      setPublishError('標題、經文（第一段）與內文為必填，請填寫完整後再發布');
      return;
    }
    if (imageMode === 'url' && imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) {
      setPublishError('圖片網址必須以 http:// 或 https:// 開頭');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('scripture', [scriptureA.trim(), scriptureB.trim()].filter(Boolean).join('；'));
    // 發布前保險：每個所選分類都對正既有正名（僅大小寫／前後空白不同者沿用既有寫法），以「、」合併儲存
    const canonicalCategories = selectedCategories.map(
      (c) => existingCategories.find((e) => normalizeCategory(e) === normalizeCategory(c)) ?? c.trim(),
    );
    formData.append('category', (canonicalCategories.length ? canonicalCategories : ['靈修默想']).join('、'));
    formData.append('content', content);
    formData.append('post_date', postDate || getTodayString());
    if (imageMode === 'url') {
      formData.append('imageUrl', imageUrl.trim());
    } else if (imageFile) {
      formData.append('image', imageFile);
    }
    // 編輯模式帶入原圖，後端在沒換新圖時沿用
    if (isEdit) {
      formData.append('id', String(editId));
      formData.append('existingImage', existingImage ?? '');
    }

    setSubmitting(true);
    setSubmitRound(1);
    try {
      let lastMessage = '';
      // 後端已自動重試 6 次（覆蓋約 2 分鐘的不穩視窗）；
      // 前端再補一輪，避免用戶在網路長時間不穩時還要手動重按（已填內容全部保留）
      for (let round = 1; round <= 2; round++) {
        setSubmitRound(round);
        let res: Response;
        try {
          res = await fetch('/api/admin/posts', {
            method: isEdit ? 'PUT' : 'POST',
            body: formData,
          });
        } catch {
          lastMessage = '瀏覽器連到主機失敗，正在自動重試…';
          if (round < 2) await new Promise((r) => setTimeout(r, 12000));
          continue;
        }

        if (res.status === 401) {
          router.replace('/admin');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          // 文章已成功發布／更新，本機草稿功成身退立刻移除
          try {
            localStorage.removeItem(draftKey);
          } catch {
            // 忽略
          }
          lastSavedFpRef.current = latestFpRef.current;
          setDraftStatus('idle');
          setDraftSavedAt(null);
          setPendingDraft(null);
          setShowSuccess(true);
          return;
        }

        // 5xx（資料庫暫時連不上）才自動再試一輪；4xx 是表單問題，直接顯示錯誤
        if (res.status >= 500 && round < 2) {
          lastMessage =
            data.error || '連到資料庫的網路不穩，12 秒後自動再試一次（內容已保留）…';
          await new Promise((r) => setTimeout(r, 12000));
          continue;
        }

        const fallback =
          res.status >= 500
            ? isEdit
              ? '網路仍不穩，請稍候一會再按一次「儲存修改」（內容不會遺失）'
              : '網路仍不穩，請稍候一會再按一次「發布給讀者」（內容不會遺失）'
            : isEdit
              ? '更新失敗，請稍後再試'
              : '發布失敗，請稍後再試';
        setPublishError(data.error || fallback);
        return;
      }
      setPublishError(lastMessage || '網路連線失敗，請稍後再按一次發布');
    } finally {
      setSubmitting(false);
      setSubmitRound(0);
    }
  };

  // 尚未確認登入狀態前只顯示載入畫面（未登入會自動跳回 /admin）
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

  // ───────────────────────── 寫文工作台 ─────────────────────────
  return (
    <main className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 text-[#222222] dark:text-slate-100 font-sans p-4 md:p-8 transition-colors">
      <div className="max-w-7xl mx-auto">
        {/* 頂部列 */}
        <header className="mb-6 border-b-2 border-emerald-700 dark:border-emerald-600 pb-4 flex flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2 sm:gap-3">
            <BookOpen className="w-6 h-6 sm:w-9 sm:h-9 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>
              作者後台 · {isEdit ? '修改文章' : '撰寫新文章'}
            </span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => router.push(isEdit ? '/admin/manage' : '/admin')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-amber-100 dark:bg-slate-800 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-amber-300 dark:border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              {isEdit ? '返回管理列表' : '返回選單'}
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-xs sm:text-base hover:opacity-80 transition shadow-sm border border-blue-200 dark:border-blue-800"
            >
              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              讀者板面
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

        {/* 偵測到舊草稿：讓作者選擇還原繼續寫，或捨棄草稿重來 */}
        {pendingDraft && (
          <div className="mb-6 rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                <BookMarked className="w-5 h-5 shrink-0" />
                找到上次未完成的草稿
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200/90 mt-1">
                草稿於 {formatSavedAt(pendingDraft.savedAt)} 儲存
                {pendingDraft.title ? <>，標題：「{pendingDraft.title}」</> : '（尚未填標題）'}
                。要還原草稿繼續撰寫，還是以目前表單內容重新開始？
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => restoreDraft(pendingDraft)}
                className="px-4 py-2 rounded-xl font-bold text-sm bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                還原草稿
              </button>
              <button
                type="button"
                onClick={discardPendingDraft}
                className="px-4 py-2 rounded-xl font-bold text-sm bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-2 border-gray-300 dark:border-slate-600 hover:opacity-80 transition"
              >
                捨棄
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* 左側：填寫表單 */}
          <section className="bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 rounded-2xl shadow-md border border-gray-200 dark:border-slate-800 space-y-5">
            {/* 草稿自動儲存狀態列：輸入靜止 3 秒或每 30 秒自動存到本機瀏覽器，發布後自動清除 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {draftStatus === 'unsaved' ? (
                  <span className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    有變更尚未儲存，靜止 3 秒後自動儲存…
                  </span>
                ) : draftStatus === 'saved' ? (
                  <span className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    草稿已儲存{draftSavedAt ? `（${formatSavedAt(draftSavedAt)}）` : ''}，關閉瀏覽器也不會遺失
                  </span>
                ) : draftStatus === 'error' ? (
                  <span className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400">
                    <X className="w-4 h-4" />
                    草稿儲存失敗（瀏覽器空間可能已滿），請按「立即儲存」重試
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-bold text-gray-500 dark:text-slate-400">
                    <Save className="w-4 h-4" />
                    自動草稿：輸入內容後會自動儲存在此瀏覽器
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={persistDraftNow}
                    disabled={!hasDraftContentNow}
                    className="px-2.5 py-1 rounded-lg font-bold text-xs border-2 border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    立即儲存
                  </button>
                  {(draftStatus === 'saved' || draftStatus === 'error') && (
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="px-2.5 py-1 rounded-lg font-bold text-xs border-2 border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      放棄草稿
                    </button>
                  )}
                </span>
              </div>
              {draftImageNotice && (
                <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400">{draftImageNotice}</p>
              )}
            </div>

            <div>
              <label className="block font-bold mb-1.5 text-base sm:text-lg">
                文章標題 <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：每日靈修：在主裡的喜樂"
                className="w-full p-2.5 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1.5 text-base sm:text-lg">發布日期</label>
                <input
                  type="date"
                  value={postDate}
                  onChange={(e) => setPostDate(e.target.value)}
                  className="w-full p-2.5 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block font-bold mb-1.5 text-base sm:text-lg">
                  主題分類
                  <span className="font-normal text-sm text-gray-500 dark:text-slate-400 ml-2">
                    （可點選，最多三個）
                  </span>
                </label>

                {/* 既有分類用按鈕直接點選（可多選，最多三個） */}
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((c) => {
                    const selected = selectedCategories.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCategory(c)}
                        className={`px-3 py-1.5 rounded-full font-bold text-sm border-2 transition ${
                          selected
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                            : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-emerald-500'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}

                  {/* 沒有合適分類時，可即時新增 */}
                  {!showAddCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryError('');
                        setNewCategory('');
                        setShowAddCategory(true);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-sm border-2 border-dashed border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                    >
                      <Plus className="w-4 h-4" />
                      新增分類
                    </button>
                  )}
                </div>

                {categoryNotice && (
                  <p className="text-amber-600 dark:text-amber-400 font-bold text-sm mt-1.5">{categoryNotice}</p>
                )}

                {showAddCategory && (
                  <div className="mt-2.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => {
                          setNewCategory(e.target.value);
                          setCategoryError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCategory();
                          } else if (e.key === 'Escape') {
                            setShowAddCategory(false);
                            setCategoryError('');
                          }
                        }}
                        placeholder="輸入新分類名稱（不可與現有分類重複）"
                        autoFocus
                        className={`flex-1 p-2 border-2 rounded-lg text-base outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                          categoryError
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-gray-300 dark:border-slate-600 focus:border-emerald-600 dark:focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        disabled={!newCategory.trim()}
                        className="px-3 py-2 rounded-lg bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 transition disabled:opacity-50"
                      >
                        加入
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCategory(false);
                          setNewCategory('');
                          setCategoryError('');
                        }}
                        className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold text-sm hover:opacity-80 transition"
                      >
                        取消
                      </button>
                    </div>
                    {categoryError && (
                      <p className="text-red-600 font-bold text-sm mt-1.5">{categoryError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <label className="block font-bold mb-1.5 text-base sm:text-lg">
                經文（最多兩段） <span className="text-red-600">*</span>
                <span className="font-normal text-sm text-gray-500 dark:text-slate-400 ml-2">
                  （點擊欄位可依「書卷 → 章 → 節」挑選，也可直接輸入；第二段可留空）
                </span>
              </label>
              <input
                ref={scriptureARef}
                type="text"
                value={scriptureA}
                onChange={(e) => setScriptureA(e.target.value)}
                onFocus={() => openScripturePicker(0)}
                onClick={() => {
                  if (!showScripturePicker) openScripturePicker(0);
                }}
                onBlur={() => setTimeout(() => setShowScripturePicker(false), 200)}
                placeholder="第一段經文，例如：腓立比書 4:1-9（必填）"
                className="w-full p-2.5 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-2 mb-1">
                ＋ 第二段經文（選填）
              </p>
              <input
                ref={scriptureBRef}
                type="text"
                value={scriptureB}
                onChange={(e) => setScriptureB(e.target.value)}
                onFocus={() => openScripturePicker(1)}
                onClick={() => {
                  if (!showScripturePicker) openScripturePicker(1);
                }}
                onBlur={() => setTimeout(() => setShowScripturePicker(false), 200)}
                placeholder="第二段經文，例如：約翰福音 3:16-4:2（可留空）"
                className="w-full p-2.5 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              {showScripturePicker && (
                <div
                  onMouseDown={(e) => e.preventDefault()}
                  className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl border-2 border-emerald-500 dark:border-emerald-600 shadow-2xl p-3"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 text-sm flex-wrap">
                      <BookMarked className="w-4 h-4 shrink-0" />
                      選擇經文
                      {pickerBook && (
                        <>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-normal text-gray-600 dark:text-slate-300">{pickerBook}</span>
                        </>
                      )}
                      {pickerStartChapter > 0 && (
                        <span className="font-normal text-gray-600 dark:text-slate-300">
                          由 {pickerStartChapter} 章{pickerStartVerse !== null ? `:${pickerStartVerse}` : ''} 節
                        </span>
                      )}
                      {pickerStartVerse !== null && pickerEndChapter > 0 && (
                        <span className="font-normal text-gray-600 dark:text-slate-300">
                          至第 {pickerEndChapter} 章（選節）
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowScripturePicker(false)}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 shrink-0"
                      aria-label="關閉經文選單"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 由左至右逐欄展開：書卷 → 由章 → 由節 → 至章 → 至節；欄位太多時可左右滑動 */}
                  <div ref={pickerColumnsRef} className="flex items-start gap-2.5 overflow-x-auto pb-1" style={{ maxHeight: '19rem' }}>
                    {/* 第一欄：書卷（固定顯示，可隨時改選） */}
                    <div className="shrink-0 w-32 sm:w-36 overflow-y-auto pr-0.5" style={{ maxHeight: '18rem' }}>
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-1 sticky top-0 bg-white dark:bg-slate-900 py-0.5">舊約</p>
                      <div className="flex flex-col gap-1 mb-2">
                        {OLD_TESTAMENT_BOOKS.map((book) => (
                          <button
                            key={book}
                            type="button"
                            onClick={() => handleSelectBook(book)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold text-left transition truncate border ${
                              pickerBook === book
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'text-gray-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            }`}
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs font-bold text-blue-800 dark:text-blue-400 mb-1 sticky top-0 bg-white dark:bg-slate-900 py-0.5">新約</p>
                      <div className="flex flex-col gap-1">
                        {NEW_TESTAMENT_BOOKS.map((book) => (
                          <button
                            key={book}
                            type="button"
                            onClick={() => handleSelectBook(book)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold text-left transition truncate border ${
                              pickerBook === book
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'text-gray-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                            }`}
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 第二欄：由第幾章（只列出該卷實際擁有的章數，例如腓立比書只有 1～4） */}
                    {pickerBook && (
                      <div className="shrink-0 w-20 sm:w-24">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                          由第幾章
                        </p>
                        <div className="grid grid-cols-4 gap-1 overflow-y-auto pr-0.5" style={{ maxHeight: '14.5rem' }}>
                          {Array.from({ length: getChapterCount(pickerBook) }, (_, i) => i + 1).map((ch) => (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => handleSelectStartChapter(ch)}
                              className={`h-8 flex items-center justify-center rounded-md text-xs font-bold transition border ${
                                pickerStartChapter === ch
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'text-gray-700 dark:text-slate-200 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-600 hover:text-white'
                              }`}
                            >
                              {ch}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleCommitChapterOnly}
                          className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                        >
                          只選本章
                        </button>
                      </div>
                    )}

                    {/* 第三欄：由第幾節（只到該章實際節數，例如馬太福音 16 章只到 28，不會有 29） */}
                    {pickerStartChapter > 0 && (
                      <div className="shrink-0 w-20 sm:w-24">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                          由第幾節
                        </p>
                        <div className="grid grid-cols-4 gap-1 overflow-y-auto pr-0.5" style={{ maxHeight: '17rem' }}>
                          {Array.from({ length: getVerseCount(pickerBook, pickerStartChapter) }, (_, i) => i + 1).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => handleSelectStartVerse(v)}
                              className={`h-8 flex items-center justify-center rounded-md text-xs font-bold transition border ${
                                pickerStartVerse === v
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 第四欄：至第幾章（不可早於起始章；可跨章，例如由第 3 章至第 4 章） */}
                    {pickerStartChapter > 0 && (
                      <div className={`shrink-0 w-20 sm:w-24 ${pickerStartVerse === null ? 'opacity-50' : ''}`}>
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                          至第幾章
                        </p>
                        <div className="grid grid-cols-4 gap-1 overflow-y-auto pr-0.5" style={{ maxHeight: '17rem' }}>
                          {Array.from({ length: getChapterCount(pickerBook) }, (_, i) => i + 1).map((ch) => {
                            const disabled = pickerStartVerse === null || ch < pickerStartChapter;
                            return (
                              <button
                                key={ch}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSelectEndChapter(ch)}
                                className={`h-8 flex items-center justify-center rounded-md text-xs font-bold transition border ${
                                  disabled
                                    ? 'text-gray-300 dark:text-slate-600 bg-gray-50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-800 cursor-not-allowed'
                                    : pickerEndChapter === ch
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'text-gray-700 dark:text-slate-200 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-600 hover:text-white'
                                }`}
                              >
                                {ch}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 第五欄：至第幾節（同章時不可小於起始節；跨章時由第 1 節起均可；節數隨所選結尾章的實際節數） */}
                    {pickerStartVerse !== null && pickerEndChapter > 0 && (
                      <div className="shrink-0 w-20 sm:w-24">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                          至第幾節
                          <span className="font-normal text-gray-400">
                            （{pickerEndChapter} 章共 {getVerseCount(pickerBook, pickerEndChapter)} 節）
                          </span>
                        </p>
                        <div className="grid grid-cols-4 gap-1 overflow-y-auto pr-0.5" style={{ maxHeight: '17rem' }}>
                          {Array.from({ length: getVerseCount(pickerBook, pickerEndChapter) }, (_, i) => i + 1).map((v) => {
                            const sameChapter = pickerEndChapter === pickerStartChapter;
                            const disabled = sameChapter && v < (pickerStartVerse ?? 1);
                            return (
                              <button
                                key={v}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSelectEndVerse(v)}
                                className={`h-8 flex items-center justify-center rounded-md text-xs font-bold transition border ${
                                  disabled
                                    ? 'text-gray-300 dark:text-slate-600 bg-gray-50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-800 cursor-not-allowed'
                                    : sameChapter && pickerStartVerse === v
                                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-400 dark:border-emerald-700 hover:bg-emerald-600 hover:text-white'
                                      : 'text-gray-700 dark:text-slate-200 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-600 hover:text-white'
                                }`}
                              >
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                    {!pickerBook
                      ? '先在左邊點選書卷，右邊會接著出現「由第幾章」。'
                      : !pickerStartChapter
                        ? `已選「${pickerBook}」，請在「由第幾章」欄選擇起始章（只選一章不指定節可按「只選本章」）。`
                        : pickerStartVerse === null
                          ? `已選由第 ${pickerStartChapter} 章，請在「由第幾節」欄選擇起始節。`
                          : `已選由 ${pickerStartChapter}:${pickerStartVerse}；請在「至第幾章」選擇結尾章（可跨章，同章則維持 ${pickerStartChapter}），再於「至第幾節」選擇結尾節——與起始相同代表只選一節。`}
                  </p>
                </div>
              )}
            </div>

            {/* 配圖區：網址 / 上傳 二選一 */}
            <div>
              <label className="block font-bold mb-1.5 text-base sm:text-lg">文章配圖（選填）</label>

              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-sm border-2 transition ${
                    imageMode === 'url'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600'
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  貼圖片網址
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-sm border-2 transition ${
                    imageMode === 'upload'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  上傳圖片檔
                </button>
              </div>

              {imageMode === 'url' ? (
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full p-2.5 sm:p-3 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-emerald-100 dark:file:bg-emerald-950 file:text-emerald-800 dark:file:text-emerald-300 hover:file:bg-emerald-200 cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                    限 JPG、PNG、GIF、WebP，最大 5MB。上傳圖片存放於本機 public/uploads；日後若部署至
                    Vercel 等雲端平台，建議改用「圖片網址」方式。
                  </p>
                  {imageFile && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-bold mt-1.5">
                      已選擇：{imageFile.name}（{(imageFile.size / 1024 / 1024).toFixed(2)} MB）
                    </p>
                  )}
                </div>
              )}

              {imageError && <p className="text-red-600 font-bold mt-2 text-sm">{imageError}</p>}
            </div>

            <div>
              <label className="block font-bold mb-1.5 text-base sm:text-lg">
                文章內容 <span className="text-red-600">*</span>
                <span className="font-normal text-sm text-gray-500 dark:text-slate-400 ml-2">
                  （支援 Markdown：### 小標題、&gt; 引言、**粗體**、* 項目）
                </span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder={'### 📖 今日經文\n> 「經文內容...」\n\n### 💡 靈修默想\n在這裡撰寫您的靈修分享...'}
                className="w-full p-3 sm:p-4 border-2 border-gray-300 dark:border-slate-600 rounded-xl text-base sm:text-lg leading-relaxed outline-none focus:border-emerald-600 dark:focus:border-emerald-500 bg-amber-50/30 dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-y"
              />
            </div>

            {publishError && (
              <p className="text-red-600 font-bold text-sm sm:text-base">{publishError}</p>
            )}

            <button
              onClick={handlePublish}
              disabled={submitting}
              className="w-full bg-emerald-700 text-white py-4 rounded-xl text-xl sm:text-2xl font-bold hover:bg-emerald-800 transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isEdit ? (
                <Save className="w-6 h-6" />
              ) : (
                <Send className="w-6 h-6" />
              )}
              {submitting
                ? submitRound >= 2
                  ? '網路不穩，自動重試中…'
                  : isEdit
                    ? '儲存中...'
                    : '發布中...'
                : isEdit
                  ? '儲存修改'
                  : '發布給讀者'}
            </button>
          </section>

          {/* 右側：即時預覽 */}
          <aside className="bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 rounded-2xl shadow-md border border-gray-200 dark:border-slate-800 lg:sticky lg:top-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 pb-2 border-b dark:border-slate-800 flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              讀者所見預覽
            </h2>

            <div className="border-b dark:border-slate-800 pb-4 mb-5">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-amber-800 dark:text-amber-400 font-bold text-sm sm:text-base">
                  📅 日期：{postDate || '（尚未選擇日期）'}
                </span>
                <span className="flex gap-1.5 flex-wrap">
                  {selectedCategories.length > 0 ? (
                    selectedCategories.map((c) => (
                      <span key={c} className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold px-3 py-1 rounded-full text-sm">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold px-3 py-1 rounded-full text-sm">
                      靈修默想
                    </span>
                  )}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold leading-tight text-slate-900 dark:text-slate-100 mt-1">
                {title || '（文章標題）'}
              </h3>
              <div className="text-lg sm:text-xl text-amber-800 dark:text-amber-300 font-medium mt-3 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 inline-block">
                {scriptureA.trim() && (
                  <p>
                    📖 經文{scriptureB.trim() ? '一' : ''}：{scriptureA}
                  </p>
                )}
                {scriptureB.trim() && <p className="mt-1">📖 經文二：{scriptureB}</p>}
                {!scriptureA.trim() && !scriptureB.trim() && <p>📖 經文：（經文出處）</p>}
              </div>
            </div>

            {previewImage ? (
              <div className="mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt={title || '文章配圖'}
                  className="w-full max-h-[320px] object-cover rounded-2xl shadow-md border border-gray-200 dark:border-slate-700"
                />
              </div>
            ) : (
              <div className="mb-6 w-full h-32 rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-700 flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 gap-1">
                <ImageIcon className="w-7 h-7" />
                <span className="text-sm">尚未加入配圖</span>
              </div>
            )}

            <article className="prose prose-slate prose-lg max-w-none text-lg md:text-xl leading-relaxed text-gray-800 dark:text-slate-200">
              {content ? (
                <ReactMarkdown
                  components={{
                    h3: ({ node, ...props }) => (
                      <h3 className="text-xl sm:text-2xl font-bold text-emerald-900 dark:text-emerald-400 mt-6 mb-3" {...props} />
                    ),
                    p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        className="border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 p-3 sm:p-4 rounded-r-xl italic my-4 text-amber-900 dark:text-amber-300 font-medium"
                        {...props}
                      />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc pl-5 sm:pl-6 mb-4 space-y-2" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-bold text-emerald-800 dark:text-emerald-400" {...props} />
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-gray-400 dark:text-slate-500 italic">
                  在左側輸入文章內容後，這裡會即時呈現讀者看到的樣子...
                </p>
              )}
            </article>
          </aside>
        </div>
      </div>

      {/* 發布／更新成功彈窗 */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mb-3" />
            <h3 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-900 dark:text-slate-100">
              {isEdit ? '文章更新成功！' : '文章發布成功！'}
            </h3>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-slate-300 mb-6">
              {isEdit
                ? '您的修改已儲存。'
                : '讀者現在已經可以在首頁看到這篇文章了。'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              {isEdit ? (
                <button
                  onClick={() => router.push('/admin/manage')}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-700 text-white py-3 rounded-xl text-lg sm:text-xl font-bold hover:bg-emerald-800 transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                  返回管理列表
                </button>
              ) : (
                <button
                  onClick={resetForm}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-700 text-white py-3 rounded-xl text-lg sm:text-xl font-bold hover:bg-emerald-800 transition"
                >
                  <X className="w-5 h-5" />
                  再寫一篇
                </button>
              )}
              <button
                onClick={() => router.push('/')}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-700 text-white py-3 rounded-xl text-lg sm:text-xl font-bold hover:bg-blue-800 transition"
              >
                <Eye className="w-5 h-5" />
                前往閱讀
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// useSearchParams 需要 Suspense 邊界，否則部分渲染模式會報錯
export default function AdminWritePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-950 flex items-center justify-center">
          <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-2xl font-bold">
            <Loader2 className="w-8 h-8 animate-spin" />
            載入中...
          </div>
        </div>
      }
    >
      <WriteEditor />
    </Suspense>
  );
}
