import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { isAdminRequest } from "../auth";

// 需要寫入本機檔案系統（圖片上傳），強制使用 Node.js 執行環境
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

// 取得本機今天日期（YYYY-MM-DD），作為未指定發布日期時的預設值
function todayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 統一處理配圖：
// 1) 有上新檔 → 存檔並回傳新路徑
// 2) 否則有貼網址 → 驗證後回傳該網址
// 3) 兩者都沒有 → 回傳 existing（修改時保留原圖；新增時為 null）
// 驗證失敗時回傳 { error, status }
async function resolveImage(
  form: FormData,
  existing: string | null,
): Promise<
  { ok: true; imageUrl: string | null } | { ok: false; error: string; status: number }
> {
  const imageUrlInput = String(form.get("imageUrl") || "").trim();
  const imageFile = form.get("image");

  if (imageFile && imageFile instanceof File && imageFile.size > 0) {
    const ext = ALLOWED_IMAGE_TYPES[imageFile.type];
    if (!ext) {
      return { ok: false, error: "只接受 JPG、PNG、GIF 或 WebP 格式的圖片", status: 400 };
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "圖片檔案不可超過 5MB", status: 400 };
    }

    // 檔名消毒：去除任何路徑字元，只保留安全字元，再加上時間戳與隨機碼
    const rawName = path.parse(imageFile.name).name;
    const safeName =
      rawName
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9一-鿿-_]+/g, "_")
        .slice(0, 40) || "image";
    const fileName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}.${ext}`;

    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadDir, { recursive: true });
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      await writeFile(path.join(uploadDir, fileName), buffer);
      return { ok: true, imageUrl: `/uploads/${fileName}` };
    } catch (error) {
      console.error("❌ 圖片上傳寫入失敗:", error);
      return { ok: false, error: "圖片上傳失敗，請稍後再試", status: 500 };
    }
  }

  if (imageUrlInput) {
    if (!/^https?:\/\//i.test(imageUrlInput)) {
      return { ok: false, error: "圖片網址必須以 http:// 或 https:// 開頭", status: 400 };
    }
    return { ok: true, imageUrl: imageUrlInput };
  }

  return { ok: true, imageUrl: existing };
}

// 管理員用：取得全部文章（含已軟刪除），供後台管理列表與編輯預載使用
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "請先輸入正確密碼登入" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 未設定於環境變數中！");
    return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
  }

  try {
    const posts = await withDbRetry(
      (sql) => sql`
      SELECT
        id,
        title,
        scripture,
        COALESCE(category, '靈修默想') as category,
        content,
        post_date::text as post_date,
        COALESCE(like_count, 0) as like_count,
        COALESCE(dislike_count, 0) as dislike_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = posts.id)::int as comment_count,
        COALESCE(views, 0) as views,
        image_url,
        is_deleted,
        COALESCE(is_pinned, false) as is_pinned
      FROM posts
      ORDER BY is_deleted ASC, is_pinned DESC, post_date DESC, id DESC
    `,
      { retryAfterSent: true },
    );

    return NextResponse.json(posts);
  } catch (error) {
    console.error("❌ 管理員文章列表讀取失敗:", error);
    return NextResponse.json(
      { error: "文章列表讀取失敗", details: String(error) },
      { status: 500 },
    );
  }
}

// 作者後台發布新文章（含可選的圖片網址或圖片檔上傳）
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "請先輸入正確密碼登入" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("❌ FormData 解析失敗:", error);
    return NextResponse.json(
      { error: "發布資料格式錯誤", details: String(error) },
      { status: 400 },
    );
  }

  const title = String(form.get("title") || "").trim();
  const scripture = String(form.get("scripture") || "").trim();
  const category = String(form.get("category") || "").trim() || "靈修默想";
  const content = String(form.get("content") || "").trim();
  const postDate = String(form.get("post_date") || "").trim() || todayString();

  if (!title || !scripture || !content) {
    return NextResponse.json(
      { error: "標題、經文與內文為必填欄位" },
      { status: 400 },
    );
  }

  const imageResult = await resolveImage(form, null);
  if (!imageResult.ok) {
    return NextResponse.json({ error: imageResult.error }, { status: imageResult.status });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 未設定於環境變數中！");
    return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
  }

  try {
    const result = await withDbRetry(
      (sql) => sql`
      INSERT INTO posts (
        title, scripture, category, content, post_date, image_url,
        like_count, dislike_count, comment_count, views
      )
      VALUES (
        ${title}, ${scripture}, ${category}, ${content}, ${postDate}, ${imageResult.imageUrl},
        0, 0, 0, 0
      )
      RETURNING id
    `,
    );

    return NextResponse.json({
      ok: true,
      id: result[0]?.id ?? null,
      image_url: imageResult.imageUrl,
    });
  } catch (error) {
    console.error("❌ 文章發布失敗:", error);
    return NextResponse.json(
      { error: "文章發布失敗，請檢查資料庫連線後再試", details: String(error) },
      { status: 500 },
    );
  }
}

// 修改既有文章（含可選的替換配圖；沒給新圖時沿用原圖）
export async function PUT(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "請先輸入正確密碼登入" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("❌ FormData 解析失敗:", error);
    return NextResponse.json(
      { error: "更新資料格式錯誤", details: String(error) },
      { status: 400 },
    );
  }

  const postId = Number(form.get("id"));
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "有效的文章 id 為必填欄位" }, { status: 400 });
  }

  const title = String(form.get("title") || "").trim();
  const scripture = String(form.get("scripture") || "").trim();
  const category = String(form.get("category") || "").trim() || "靈修默想";
  const content = String(form.get("content") || "").trim();
  const postDate = String(form.get("post_date") || "").trim() || todayString();
  const existingImage = String(form.get("existingImage") || "").trim() || null;

  if (!title || !scripture || !content) {
    return NextResponse.json(
      { error: "標題、經文與內文為必填欄位" },
      { status: 400 },
    );
  }

  const imageResult = await resolveImage(form, existingImage);
  if (!imageResult.ok) {
    return NextResponse.json({ error: imageResult.error }, { status: imageResult.status });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 未設定於環境變數中！");
    return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
  }

  try {
    const result = await withDbRetry(
      (sql) => sql`
      UPDATE posts
      SET title = ${title},
          scripture = ${scripture},
          category = ${category},
          content = ${content},
          post_date = ${postDate},
          image_url = ${imageResult.imageUrl}
      WHERE id = ${postId}
      RETURNING id
    `,
      { retryAfterSent: true },
    );

    if (result.length === 0) {
      return NextResponse.json({ error: "找不到該篇文章" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: postId, image_url: imageResult.imageUrl });
  } catch (error) {
    console.error("❌ 文章更新失敗:", error);
    return NextResponse.json(
      { error: "目前連到資料庫的網路不穩，系統已自動重試數次仍未成功，請稍候一會再按一次儲存（已填內容不會遺失）" },
      { status: 500 },
    );
  }
}

// 軟刪除／還原／置頂／取消置頂
// - "delete"：軟刪除（讀者隱藏），同時清除置頂，避免日後還原時意外跳到最前
// - "restore"：還原軟刪除
// - "pin" / "unpin"：切換置頂（可同時置頂多篇）
export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "請先輸入正確密碼登入" }, { status: 401 });
  }

  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求資料格式錯誤" }, { status: 400 });
  }

  const postId = Number(body?.id);
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "有效的文章 id 為必填欄位" }, { status: 400 });
  }

  const action = body?.action;
  if (
    action !== "delete" &&
    action !== "restore" &&
    action !== "pin" &&
    action !== "unpin"
  ) {
    return NextResponse.json(
      { error: "action 必須是 delete、restore、pin 或 unpin" },
      { status: 400 },
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 未設定於環境變數中！");
    return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
  }

  try {
    // 每個分支皆為完整的 Neon tagged template（不可把 fragment 存成變數再嵌套）
    const result = await withDbRetry(
      (sql) =>
        action === "delete"
          ? sql`
            UPDATE posts
            SET is_deleted = true, is_pinned = false
            WHERE id = ${postId}
            RETURNING id, is_deleted, is_pinned
          `
          : action === "restore"
            ? sql`
              UPDATE posts
              SET is_deleted = false
              WHERE id = ${postId}
              RETURNING id, is_deleted, is_pinned
            `
            : action === "pin"
              ? sql`
                UPDATE posts
                SET is_pinned = true
                WHERE id = ${postId} AND is_deleted = false
                RETURNING id, is_deleted, is_pinned
              `
              : sql`
                UPDATE posts
                SET is_pinned = false
                WHERE id = ${postId}
                RETURNING id, is_deleted, is_pinned
              `,
      { retryAfterSent: true },
    );

    if (result.length === 0) {
      return NextResponse.json(
        {
          error:
            action === "pin"
              ? "找不到該篇文章（回收站內的文章請先還原再置頂）"
              : "找不到該篇文章",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: postId,
      is_deleted: result[0].is_deleted,
      is_pinned: result[0].is_pinned,
    });
  } catch (error) {
    console.error("❌ 文章狀態更新失敗:", error);
    return NextResponse.json(
      { error: "狀態更新失敗，請檢查資料庫連線後再試", details: String(error) },
      { status: 500 },
    );
  }
}

// 徹底刪除：只限於回收站中已軟刪除的文章。
// 會連同該文章的所有回應留言一併刪除；本機上傳的配圖檔也會盡量清除。
// 外部網址圖片（http(s)://）不屬於本站檔案，無法刪除。
export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "請先輸入正確密碼登入" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求資料格式錯誤" }, { status: 400 });
  }

  const postId = Number(body?.id);
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "有效的文章 id 為必填欄位" }, { status: 400 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL 未設定於環境變數中！");
    return NextResponse.json({ error: "DATABASE_URL is missing" }, { status: 500 });
  }

  try {
    // 單一查詢完成「檢查已軟刪 → 刪關聯留言 → 刪文章」，
    // 減少不穩網路下的往返次數；查無資料列代表文章不存在或未在回收站中。
    const result = await withDbRetry(
      (sql) => sql`
        WITH target AS (
          SELECT id, image_url
          FROM posts
          WHERE id = ${postId} AND is_deleted = true
        ),
        del_comments AS (
          DELETE FROM comments WHERE post_id IN (SELECT id FROM target)
        )
        DELETE FROM posts
        WHERE id IN (SELECT id FROM target)
        RETURNING id, image_url
      `,
      { retryAfterSent: true },
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: "找不到該篇回收站中的文章（可能已被還原或徹底刪除）" },
        { status: 404 },
      );
    }
    const imageUrl: string | null = result[0].image_url ?? null;
    // 盡量清除本機上傳的配圖（外部網址圖片跳過；清除失敗不影響刪除結果）
    if (imageUrl && imageUrl.startsWith("/uploads/")) {
      const safePart = path.basename(imageUrl); // 防止路徑穿越
      try {
        await unlink(path.join(process.cwd(), "public", "uploads", safePart));
      } catch (error) {
        console.warn("⚠️ 徹底刪除文章時配圖檔未能移除（可能早已不存在）:", error);
      }
    }

    return NextResponse.json({ ok: true, id: postId });
  } catch (error) {
    console.error("❌ 文章徹底刪除失敗:", error);
    return NextResponse.json(
      { error: "徹底刪除失敗，請檢查資料庫連線後再試", details: String(error) },
      { status: 500 },
    );
  }
}
