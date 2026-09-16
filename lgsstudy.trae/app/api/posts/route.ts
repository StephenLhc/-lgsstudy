import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error("❌ DATABASE_URL 未設定於環境變數中！");
      return NextResponse.json(
        { error: "DATABASE_URL is missing" },
        { status: 500 },
      );
    }

    // 簡化 SQL，確保基本欄位都能順利抓取，避免轉型失敗；withDbRetry 會在冷連線逾時時自動重試
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
        -- 讀者可見回應數：只計已審核通過且回應者同意公開者（待審／駁回／私密不計）
        (SELECT COUNT(*) FROM comments c
         WHERE c.post_id = posts.id AND c.status = 'approved' AND c.is_public = true)::int as comment_count,
        COALESCE(views, 0) as views,
        image_url,
        COALESCE(is_pinned, false) as is_pinned
      FROM posts
      WHERE is_deleted = false
      -- 置頂文章永遠排最前；其餘（及多篇置頂之間）按發布日期由新到舊
      ORDER BY is_pinned DESC, post_date DESC, id DESC
    `,
      { retryAfterSent: true },
    );

    return NextResponse.json(posts);
  } catch (error) {
    console.error("❌ 資料庫讀取失敗詳細資訊:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts", details: String(error) },
      { status: 500 },
    );
  }
}

// 更新文章互動數據：
// - 未帶 type：瀏覽量 +1（讀者開啟文章時由前端呼叫；同一瀏覽工作階段每篇只計一次，由前端 sessionStorage 把關）
// - type 為 like / dislike：依 active 對該計數 +1 或 −1（再按一次即取消）
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const postId = Number(body?.id);

    if (!Number.isInteger(postId)) {
      return NextResponse.json(
        { error: "有效的文章 id 為必填欄位" },
        { status: 400 },
      );
    }

    const type = body?.type === undefined ? "view" : String(body.type);

    if (type !== "view" && type !== "like" && type !== "dislike") {
      return NextResponse.json(
        { error: "type 必須是 view、like 或 dislike" },
        { status: 400 },
      );
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error("❌ DATABASE_URL 未設定於環境變數中！");
      return NextResponse.json(
        { error: "DATABASE_URL is missing" },
        { status: 500 },
      );
    }

    // 瀏覽量：固定 +1（資料庫端原子累加，避免並發遺失更新）
    if (type === "view") {
      const result = await withDbRetry(
        (sql) => sql`
        UPDATE posts
        SET views = COALESCE(views, 0) + 1
        WHERE id = ${postId} AND is_deleted = false
        RETURNING COALESCE(views, 0) as views
      `,
      );

      if (result.length === 0) {
        return NextResponse.json(
          { error: "找不到該篇文章" },
          { status: 404 },
        );
      }

      return NextResponse.json({ id: postId, views: result[0].views });
    }

    // 讚 / 有待改善：active 為 true 時 +1，false（取消）時 −1，並以 GREATEST 守住下限 0
    const active = body?.active !== false;

    const result = await withDbRetry((sql) =>
      type === "like"
        ? active
          ? sql`
              UPDATE posts
              SET like_count = COALESCE(like_count, 0) + 1
              WHERE id = ${postId} AND is_deleted = false
              RETURNING COALESCE(like_count, 0) as like_count,
                        COALESCE(dislike_count, 0) as dislike_count
            `
          : sql`
              UPDATE posts
              SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0)
              WHERE id = ${postId} AND is_deleted = false
              RETURNING COALESCE(like_count, 0) as like_count,
                        COALESCE(dislike_count, 0) as dislike_count
            `
        : active
          ? sql`
              UPDATE posts
              SET dislike_count = COALESCE(dislike_count, 0) + 1
              WHERE id = ${postId} AND is_deleted = false
              RETURNING COALESCE(like_count, 0) as like_count,
                        COALESCE(dislike_count, 0) as dislike_count
            `
          : sql`
              UPDATE posts
              SET dislike_count = GREATEST(COALESCE(dislike_count, 0) - 1, 0)
              WHERE id = ${postId} AND is_deleted = false
              RETURNING COALESCE(like_count, 0) as like_count,
                        COALESCE(dislike_count, 0) as dislike_count
            `,
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: "找不到該篇文章" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: postId,
      like_count: result[0].like_count,
      dislike_count: result[0].dislike_count,
    });
  } catch (error) {
    console.error("❌ 文章互動數據更新失敗:", error);
    return NextResponse.json(
      { error: "Failed to update post", details: String(error) },
      { status: 500 },
    );
  }
}
