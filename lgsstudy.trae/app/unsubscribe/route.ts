// 取消訂閱頁面：讀者從電郵點進來，帶 token 完成退訂後顯示確認
// 回傳一個簡單的 HTML 頁面，不需 React（讀者可能在任何裝置的郵件客戶端點擊）
import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';

  const result = await unsubscribeByToken(token);

  const title = result.ok ? '已取消訂閱' : '取消訂閱失敗';
  const detail = result.ok
    ? `已停止對 ${result.email} 寄送新文章通知。日後想再收到通知，隨時可以回到網站重新訂閱。`
    : result.message;

  const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - 靈修文章網站</title>
<style>
  body { font-family: 'Microsoft JhengHei', Arial, sans-serif; background: #fdfbf7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px 24px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
  .icon { font-size: 48px; margin-bottom: 12px; }
  h1 { color: #059669; margin: 0 0 12px; font-size: 24px; }
  p { color: #475569; line-height: 1.7; margin: 0 0 20px; }
  .ok { color: #059669; }
  .fail { color: #dc2626; }
  a.btn { display: inline-block; background: #059669; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: bold; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${result.ok ? '📭' : '⚠️'}</div>
    <h1 class="${result.ok ? 'ok' : 'fail'}">${title}</h1>
    <p>${detail}</p>
    <a class="btn" href="/">返回靈修文章網站</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: result.ok ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
