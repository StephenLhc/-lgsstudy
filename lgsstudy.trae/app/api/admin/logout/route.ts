import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "../auth";

// 作者後台登出：清除登入 cookie
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
