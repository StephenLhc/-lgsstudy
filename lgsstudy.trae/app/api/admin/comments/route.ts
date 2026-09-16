import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";
import { isAdminRequest } from "../auth";

// GET /api/admin/comments
// - 不帶參數：回傳全部留言（待審核優先，再由新到舊）
// - ?status=pending|approved|rejected|all：狀態篩選
// - ?postId=123：只看某篇文章
// - ?summary=1：只回各狀態計數（供後台選單徽章，傳輸量小）
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") || "all";
    const postIdParam = Number(url.searchParams.get("postId"));
    const summaryOnly = url.searchParams.get("summary") === "1";

    if (summaryOnly) {
      const rows = await withDbRetry(
        (sql) => sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
          FROM comments
        `,
        { retryAfterSent: true },
      );
      return NextResponse.json(rows[0]);
    }

    const statuses = ["pending", "approved", "rejected"];
    const status = statuses.includes(statusParam) ? statusParam : "all";
    // 注意：Number(null) === 0，必須先判斷查詢字串是否真的帶了 postId
    const postId =
      url.searchParams.get("postId") !== null && Number.isInteger(postIdParam)
        ? postIdParam
        : null;

    // 管理端留言列表（LEFT JOIN 文章：文章即便已刪除仍可審核其留言）
    const rows = await withDbRetry(
      (sql) => sql`
        SELECT
          c.id,
          c.post_id,
          p.title AS post_title,
          c.user_name,
          c.salutation,
          c.age_group,
          c.faith_years,
          c.church_name,
          c.comment_text,
          c.is_public,
          c.status,
          c.admin_reply,
          to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          to_char(c.replied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS replied_at,
          p.is_deleted AS post_is_deleted
        FROM comments c
        LEFT JOIN posts p ON p.id = c.post_id
        WHERE (${status} = 'all' OR c.status = ${status})
          AND (${postId}::int IS NULL OR c.post_id = ${postId}::int)
        ORDER BY
          CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          c.created_at DESC,
          c.id DESC
      `,
      { retryAfterSent: true },
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error("❌ 管理端讀取回應失敗:", error);
    return NextResponse.json(
      { error: "讀取回應失敗，請稍後再試" },
      { status: 500 },
    );
  }
}

// PATCH /api/admin/comments
// body: { id, action: 'approve' | 'reject' | 'reply', replyText? }
// - approve：審核通過（讀者端立即可見，仍受回應者本身的 is_public 意願限制）
// - reject：駁回（從讀者端隱藏，可隨時再改回通過）
// - reply：寫入／修改管理員回覆；replyText 為空白時視為清除回覆
export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const id = Number(body?.id);
    const action = String(body?.action ?? "");

    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "缺少有效的回應編號" }, { status: 400 });
    }
    if (!["approve", "reject", "reply"].includes(action)) {
      return NextResponse.json({ error: "無效的操作" }, { status: 400 });
    }

    if (action === "approve") {
      await withDbRetry(
        (sql) => sql`UPDATE comments SET status = 'approved' WHERE id = ${id}`,
        { retryAfterSent: true },
      );
    } else if (action === "reject") {
      await withDbRetry(
        (sql) => sql`UPDATE comments SET status = 'rejected' WHERE id = ${id}`,
        { retryAfterSent: true },
      );
    } else {
      const replyText = String(body?.replyText ?? "").trim().slice(0, 5000);
      await withDbRetry(
        (sql) => sql`
          UPDATE comments
          SET admin_reply = ${replyText || null},
              replied_at = ${replyText ? new Date() : null}
          WHERE id = ${id}
        `,
        { retryAfterSent: true },
      );
    }

    // 回傳更新後的完整列，前端直接替換本地資料
    const rows = await withDbRetry(
      (sql) => sql`
        SELECT
          c.id,
          c.post_id,
          p.title AS post_title,
          c.user_name,
          c.salutation,
          c.age_group,
          c.faith_years,
          c.church_name,
          c.comment_text,
          c.is_public,
          c.status,
          c.admin_reply,
          to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          to_char(c.replied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS replied_at,
          p.is_deleted AS post_is_deleted
        FROM comments c
        LEFT JOIN posts p ON p.id = c.post_id
        WHERE c.id = ${id}
      `,
      { retryAfterSent: true },
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "找不到該筆回應" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("❌ 管理端更新回應失敗:", error);
    return NextResponse.json(
      { error: "操作失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
