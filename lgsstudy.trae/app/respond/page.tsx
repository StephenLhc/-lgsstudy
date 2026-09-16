'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { bibleUrl } from '@/lib/bible';

// 文章最小欄位（與 /api/posts 回傳一致）
interface PostSummary {
    id: number;
    title: string;
    scripture: string;
    content: string;
}

// 本裝置記住的回應者登記資料（localStorage key）
const RESPONDER_KEY = 'lgsstudy_responder';

function RespondPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const postIdFromUrl = Number(searchParams.get('postId'));

    // 步驟控制：1 = 填寫個人資料，2 = 左右分欄 (左文章、右回應)
    const [step, setStep] = useState<1 | 2>(1);

    // 文章列表（用於指定回應對象；?postId= 会預選）
    const [posts, setPosts] = useState<PostSummary[]>([]);
    const [postsLoading, setPostsLoading] = useState(true);
    const [selectedPostId, setSelectedPostId] = useState<number | ''>('');

    // 個人資料狀態
    const [userName, setUserName] = useState('');
    const [salutation, setSalutation] = useState('弟兄');
    const [ageGroup, setAgeGroup] = useState('');
    const [faithYears, setFaithYears] = useState('');
    const [churchName, setChurchName] = useState('');

    // 回應內容狀態
    const [commentText, setCommentText] = useState('');

    // 彈窗控制狀態
    const [showConsentModal, setShowConsentModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false); // 自訂成功提示框
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    // 曾在本裝置登記過的回應者：免重填登記表，並沿用上次的公開設定
    const [isReturning, setIsReturning] = useState(false);
    const [savedConsent, setSavedConsent] = useState<boolean | null>(null);
    // 剛送出回應的公開意願，用於成功彈窗顯示對應說明
    const [lastConsentPublic, setLastConsentPublic] = useState<boolean | null>(null);

    // 載入文章列表（決定這份回應屬於哪篇文章）
    useEffect(() => {
        let cancelled = false;
        (async () => {
            for (let attempt = 1; attempt <= 3 && !cancelled; attempt++) {
                try {
                    const res = await fetch('/api/posts');
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const list: PostSummary[] = await res.json();
                    if (cancelled) return;
                    setPosts(list);
                    // 網址有帶 postId 且存在時預選；否則選第一篇
                    const target = Number.isInteger(postIdFromUrl)
                        ? list.find((p) => p.id === postIdFromUrl)
                        : undefined;
                    setSelectedPostId(target ? target.id : list[0]?.id ?? '');
                    setPostsLoading(false);
                    // 讀取本裝置已登記的回應者資料；有就直接跳到寫回應，免重填登記表
                    try {
                        const raw = localStorage.getItem(RESPONDER_KEY);
                        if (raw) {
                            const saved = JSON.parse(raw);
                            if (saved?.userName) {
                                setUserName(String(saved.userName));
                                setSalutation(String(saved.salutation ?? '弟兄'));
                                setAgeGroup(String(saved.ageGroup ?? ''));
                                setFaithYears(String(saved.faithYears ?? ''));
                                setChurchName(String(saved.churchName ?? ''));
                                setSavedConsent(typeof saved.isPublic === 'boolean' ? saved.isPublic : null);
                                setIsReturning(true);
                                setStep(2);
                            }
                        }
                    } catch {
                        // 讀取失敗不影響正常流程
                    }
                    return;
                } catch {
                    if (attempt === 3 && !cancelled) setPostsLoading(false);
                    await new Promise((r) => setTimeout(r, 1500 * attempt));
                }
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedPost = useMemo(
        () => posts.find((p) => p.id === selectedPostId) ?? null,
        [posts, selectedPostId],
    );

    // 第一步：驗證並進入左右分欄
    const handleProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userName.trim()) {
            return;
        }
        if (!selectedPost) {
            return;
        }
        setStep(2); // 切換至左右分欄畫面
    };

    // 第二步：按下右下角「發送」按鈕
    const handleFinalSubmit = () => {
        if (!commentText.trim()) {
            return;
        }
        setSubmitError('');
        // 跳出隱私公開授權詢問
        setShowConsentModal(true);
    };

    // 確認隱私設定並正式提交（真正寫入資料庫）
    const confirmConsent = async (isPublic: boolean) => {
        setShowConsentModal(false);
        setSubmitting(true);
        setSubmitError('');
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    postId: selectedPostId,
                    userName: userName.trim(),
                    salutation,
                    ageGroup,
                    faithYears,
                    churchName,
                    commentText: commentText.trim(),
                    isPublic,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSubmitError(json?.error || '回應送出失敗，請稍後再試一次');
                return;
            }
            setCommentText('');
            setLastConsentPublic(isPublic);
            setShowSuccessModal(true);
        } catch {
            setSubmitError('網路不穩，回應未能送出，請再按一次「發送回應」');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFinish = () => {
        setShowSuccessModal(false);
        router.push('/'); // 返回首頁
    };

    return (
        <main className="min-h-screen bg-[#FDFBF7] text-[#222222] font-sans p-4 md:p-8">

            {/* 📍 第一階段：填寫基本資料 */}
            {step === 1 && (
                <div className="max-w-xl mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-200 mt-4">
                    <h2 className="text-3xl font-bold mb-6 text-emerald-800 text-center">請先填寫基本資料</h2>

                    <form onSubmit={handleProfileSubmit} className="space-y-6 text-xl">
                        <div>
                            <label className="block text-gray-800 font-bold mb-2">
                                回應哪篇文章 <span className="text-red-600">(必選)</span>
                            </label>
                            {postsLoading ? (
                                <p className="text-gray-500 flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" /> 文章載入中……
                                </p>
                            ) : (
                                <select
                                    value={selectedPostId}
                                    onChange={(e) => setSelectedPostId(Number(e.target.value))}
                                    className="w-full p-3 border-2 border-gray-300 rounded-xl bg-white focus:border-emerald-600 outline-none"
                                >
                                    {posts.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.title}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-gray-800 font-bold mb-2">
                                姓名 / 暱稱 <span className="text-red-600">(必填)</span>
                            </label>
                            <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="例如：陳大文"
                                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-emerald-600 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">稱謂</label>
                            <select
                                value={salutation}
                                onChange={(e) => setSalutation(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl bg-white focus:border-emerald-600 outline-none"
                            >
                                <option value="弟兄">弟兄</option>
                                <option value="姊妹">姊妹</option>
                                <option value="先生">先生</option>
                                <option value="女士">女士</option>
                                <option value="牧者">牧者</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">年齡組別</label>
                            <select
                                value={ageGroup}
                                onChange={(e) => setAgeGroup(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl bg-white focus:border-emerald-600 outline-none"
                            >
                                <option value="">不透露</option>
                                <option value="18歲或以下">18歲或以下</option>
                                <option value="19-29歲">19-29歲</option>
                                <option value="30-39歲">30-39歲</option>
                                <option value="40-59歲">40-59歲</option>
                                <option value="60歲或以上">60歲或以上</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">信主年日</label>
                            <select
                                value={faithYears}
                                onChange={(e) => setFaithYears(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl bg-white focus:border-emerald-600 outline-none"
                            >
                                <option value="">不透露</option>
                                <option value="未信">未信</option>
                                <option value="1年以下">1年以下</option>
                                <option value="1-5年">1-5年</option>
                                <option value="6-10年">6-10年</option>
                                <option value="11-20年">11-20年</option>
                                <option value="21-30年">21-30年</option>
                                <option value="30年以上">30年以上</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">教會名稱（選填）</label>
                            <input
                                type="text"
                                value={churchName}
                                onChange={(e) => setChurchName(e.target.value)}
                                placeholder="例如：樂道堂"
                                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-emerald-600 outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={postsLoading || !selectedPost}
                            className="w-full bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl text-2xl font-bold hover:bg-emerald-800 transition"
                        >
                            下一步：寫回應 ➔
                        </button>
                    </form>
                </div>
            )}

            {/* 📍 第二階段：左右分欄（左文章、右回應） */}
            {step === 2 && selectedPost && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto mt-4">

                    {/* 左邊：文章 */}
                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-gray-200">
                        <div className="border-b pb-4 mb-4">
                            <span className="text-emerald-800 font-bold text-lg">📖 靈修文章閱讀</span>
                            <h1 className="text-3xl font-bold text-slate-900 mt-2">{selectedPost.title}</h1>
                            <p className="text-xl text-amber-800 font-medium mt-2 bg-amber-50 p-2 rounded-lg border border-amber-200 inline-block">
                                經文：{(selectedPost.scripture || '').split('；').map((s, i, arr) => {
                                  const part = s.trim();
                                  if (!part) return null;
                                  return (
                                    <span key={i}>
                                      {i > 0 && '；'}
                                      <a
                                        href={bibleUrl(part)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-amber-600 hover:decoration-amber-700"
                                        title={`到香港聖經公會 RCUV 查看：${part}`}
                                      >
                                        {part}
                                      </a>
                                    </span>
                                  );
                                })}
                            </p>
                        </div>
                        <article className="text-xl md:text-2xl leading-relaxed text-gray-800 whitespace-pre-line">
                            {selectedPost.content}
                        </article>
                    </div>

                    {/* 右邊：寫回應框 */}
                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-gray-200 flex flex-col justify-between min-h-[500px] sticky top-8">
                        <div>
                            <div className="border-b pb-3 mb-4">
                                <h2 className="text-2xl font-bold text-emerald-800">
                                    寫下您的回應
                                </h2>
                                <p className="text-gray-600 text-lg mt-1">
                                    發言人：<span className="font-bold text-gray-900">{userName} {salutation}</span>
                                </p>
                                {isReturning && (
                                    <button
                                        onClick={() => setStep(1)}
                                        className="text-sm text-emerald-700 underline hover:opacity-80 mt-1"
                                    >
                                        已自動帶入你上次登記的資料，按此可更改
                                    </button>
                                )}
                            </div>

                            <label className="block text-gray-700 text-lg font-medium mb-2">
                                請在下方框內輸入您的感想或心得：
                            </label>
                            <textarea
                                rows={10}
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="請在此輸入回應內容..."
                                className="w-full p-4 border-2 border-gray-300 rounded-xl text-xl focus:border-emerald-600 outline-none resize-none bg-amber-50/30"
                            />
                            {submitError && (
                                <p className="text-red-600 font-bold mt-2">{submitError}</p>
                            )}
                        </div>

                        <button
                            onClick={handleFinalSubmit}
                            disabled={submitting || !commentText.trim()}
                            className="w-full bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl text-2xl font-bold hover:bg-blue-800 transition shadow-md mt-6 flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin" /> 送出中……
                                </>
                            ) : (
                                '發送回應'
                            )}
                        </button>
                    </div>

                </div>
            )}

            {/* 📍 隱私授權 Modal 彈出視窗 */}
            {showConsentModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-lg w-full text-center shadow-2xl">
                        <h3 className="text-2xl font-bold mb-4 text-gray-900">感謝您的回應！</h3>
                        <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                            這是您第一次發表回應。請問您是否同意將您的回應內容公開讓其他讀者看見？
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => confirmConsent(true)}
                                disabled={submitting}
                                className="flex-1 bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl text-xl font-bold hover:bg-emerald-800"
                            >
                                同意公開分享
                            </button>
                            <button
                                onClick={() => confirmConsent(false)}
                                disabled={submitting}
                                className="flex-1 bg-gray-300 disabled:opacity-50 text-gray-800 py-3 rounded-xl text-xl font-bold hover:bg-gray-400"
                            >
                                僅供作者閱讀 (不公開)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 📍 自訂成功提示 Modal 彈出視窗 (替代原生 alert，不會顯示 localhost:3000) */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
                        <CheckCircle2 className="w-16 h-16 text-emerald-600 mb-3" />
                        <h3 className="text-3xl font-bold mb-2 text-gray-900">回應傳送成功！</h3>
                        <p className="text-xl text-gray-600 mb-2">感謝您的寶貴分享與鼓勵。</p>
                        <p className="text-base text-gray-500 mb-6">
                            {lastConsentPublic === false
                                ? '您的回應僅供作者私人閱讀，不會公開顯示。'
                                : '您的回應會在作者審核通過後，顯示於文章下方。'}
                        </p>
                        <button
                            onClick={handleFinish}
                            className="w-full bg-emerald-700 text-white py-3 rounded-xl text-2xl font-bold hover:bg-emerald-800 transition"
                        >
                            確定
                        </button>
                    </div>
                </div>
            )}

        </main>
    );
}

export default function RespondPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-[#FDFBF7] p-8" />}>
            <RespondPageInner />
        </Suspense>
    );
}
