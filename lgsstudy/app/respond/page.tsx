'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export default function RespondPage() {
    const router = useRouter();

    // 步驟控制：1 = 填寫個人資料，2 = 左右分欄 (左文章、右回應)
    const [step, setStep] = useState<1 | 2>(1);

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

    // 模擬文章資料
    const post = {
        title: '每日靈修：上帝的恩典與平安',
        scripture: '詩篇 23:1-3',
        content: `耶和華是我的牧者，我必不致缺乏。他使我躺臥在青草地上，領我在可安歇的水邊。他使我的靈魂蘇醒，為自己的名引導我走義路。

親愛的弟兄姊妹，在日常生活中，我們常常面臨各種挑戰與焦慮，但神答應做我們的牧者。無論年歲如何增長，祂的恩典與慈愛必不離開我們。讓我們今天停下腳步，默想神的恩典，將心中的重擔交托給祂。`,
    };

    // 第一步：驗證並進入左右分欄
    const handleProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userName.trim()) {
            return;
        }
        setStep(2); // 切換至左右分欄畫面
    };

    // 第二步：按下右下角「發送」按鈕
    const handleFinalSubmit = () => {
        if (!commentText.trim()) {
            return;
        }
        // 跳出隱私公開授權詢問
        setShowConsentModal(true);
    };

    // 確認隱私設定並正式提交
    const confirmConsent = (isPublic: boolean) => {
        setShowConsentModal(false);

        // 這裡未來呼叫 API 將資料寫入 Neon 資料庫
        console.log('提交資料：', {
            userName,
            salutation,
            ageGroup,
            faithYears,
            churchName,
            commentText,
            isPublic,
        });

        // 顯示漂亮的自訂成功彈窗，不再使用瀏覽器 alert()
        setShowSuccessModal(true);
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
                                姓名 / 暱稱 <span className="text-red-600">(必填)</span>
                            </label>
                            <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="例如：陳大文"
                                className="w-full p-3 border-2 border-gray-300 rounded-xl text-xl focus:border-emerald-600 outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">稱呼 (必填)</label>
                            <select
                                value={salutation}
                                onChange={(e) => setSalutation(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl text-xl bg-white"
                            >
                                <option value="弟兄">弟兄</option>
                                <option value="姊妹">姊妹</option>
                                <option value="先生">先生</option>
                                <option value="女士">女士</option>
                                <option value="牧者">牧者</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">年齡層 (選填)</label>
                            <select
                                value={ageGroup}
                                onChange={(e) => setAgeGroup(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl text-xl bg-white"
                            >
                                <option value="">-- 請選擇 --</option>
                                <option value="30或以上">30歲或以上</option>
                                <option value="40或以上">40歲或以上</option>
                                <option value="50或以上">50歲或以上</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">信主年日 (選填)</label>
                            <select
                                value={faithYears}
                                onChange={(e) => setFaithYears(e.target.value)}
                                className="w-full p-3 border-2 border-gray-300 rounded-xl text-xl bg-white"
                            >
                                <option value="">-- 請選擇 --</option>
                                <option value="10年以下">10年以下</option>
                                <option value="10年或以上">10年或以上</option>
                                <option value="20年或以上">20年或以上</option>
                                <option value="30年或以上">30年或以上</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-gray-800 font-bold mb-2">教會名稱 (選填)</label>
                            <input
                                type="text"
                                value={churchName}
                                onChange={(e) => setChurchName(e.target.value)}
                                placeholder="例如：恩典浸信會"
                                className="w-full p-3 border-2 border-gray-300 rounded-xl text-xl focus:border-emerald-600 outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-emerald-700 text-white py-4 rounded-xl text-2xl font-bold hover:bg-emerald-800 transition shadow-md mt-4"
                        >
                            下一步：寫回應 ➔
                        </button>
                    </form>
                </div>
            )}

            {/* 📍 第二階段：左右分欄版面 */}
            {step === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto items-start">

                    {/* 左邊：文章 */}
                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-gray-200">
                        <div className="border-b pb-4 mb-4">
                            <span className="text-emerald-800 font-bold text-lg">📖 靈修文章閱讀</span>
                            <h1 className="text-3xl font-bold text-slate-900 mt-2">{post.title}</h1>
                            <p className="text-xl text-amber-800 font-medium mt-2 bg-amber-50 p-2 rounded-lg border border-amber-200 inline-block">
                                經文：{post.scripture}
                            </p>
                        </div>
                        <article className="text-xl md:text-2xl leading-relaxed text-gray-800 whitespace-pre-line">
                            {post.content}
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
                        </div>

                        <button
                            onClick={handleFinalSubmit}
                            className="w-full bg-blue-700 text-white py-4 rounded-xl text-2xl font-bold hover:bg-blue-800 transition shadow-md mt-6"
                        >
                            發送回應
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
                                className="flex-1 bg-emerald-700 text-white py-3 rounded-xl text-xl font-bold hover:bg-emerald-800"
                            >
                                同意公開分享
                            </button>
                            <button
                                onClick={() => confirmConsent(false)}
                                className="flex-1 bg-gray-300 text-gray-800 py-3 rounded-xl text-xl font-bold hover:bg-gray-400"
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
                        <p className="text-xl text-gray-600 mb-6">感謝您的寶貴分享與鼓勵。</p>
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