import { createHash, timingSafeEqual } from "node:crypto";

// 作者後台簡易密碼保護：可用 .env.local 的 ADMIN_PASSWORD 覆蓋，未設定時預設 1234567
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234567";

export const ADMIN_COOKIE = "lgsstudy_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// 登入成功後寫入 cookie 的權杖（密碼的雜湊值，不存放明碼）
export function getAdminToken(): string {
  return sha256(`lgsstudy-admin-token:${ADMIN_PASSWORD}`);
}

// 常數時間比對，避免計時攻擊
export function isPasswordCorrect(input: string): boolean {
  const expected = Buffer.from(sha256(ADMIN_PASSWORD), "hex");
  const actual = Buffer.from(sha256(input), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// 檢查請求帶的 cookie 是否為有效登入權杖
export function isAdminRequest(request: Request): boolean {
  // 標準 Request 沒有 cookies 屬性，直接從 Cookie header 解析
  const cookieHeader = request.headers.get("cookie") || "";
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  const token = pair ? decodeURIComponent(pair.slice(ADMIN_COOKIE.length + 1)) : undefined;
  if (!token) return false;

  const expected = Buffer.from(getAdminToken(), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
