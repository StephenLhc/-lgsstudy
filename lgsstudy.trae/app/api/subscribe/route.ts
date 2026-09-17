// 訂閱新文章通知（公開 API，讀者填寫電郵）
import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: '請求格式錯誤' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!email.trim()) {
    return NextResponse.json({ ok: false, message: '請輸入電郵地址' }, { status: 400 });
  }

  const result = await addSubscriber(email);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
