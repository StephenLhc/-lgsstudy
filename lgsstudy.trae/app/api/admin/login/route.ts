import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  getAdminToken,
  isAdminRequest,
  isPasswordCorrect,
} from "../auth";

// 確認目前是否已登入（供後台頁面開啟時檢查 cookie）
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

// 作者後台登入：核對密碼，成功後設定 httpOnly cookie
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isPasswordCorrect(password)) {
      return NextResponse.json({ error: "密碼不正確" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, getAdminToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("❌ 後台登入失敗:", error);
    return NextResponse.json({ error: "登入要求格式錯誤" }, { status: 400 });
  }
}
