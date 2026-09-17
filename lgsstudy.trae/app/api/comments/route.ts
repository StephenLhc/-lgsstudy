import { NextResponse, after } from "next/server";
import { withDbRetry } from "@/lib/db";
import { sendNewCommentNotification } from "@/lib/mailer";

// 公開讀取某篇文章「可對讀者顯示」的回應：
// 必須同時滿意 已審核通過(status=approved) 且 回應者同意公開(is_public=true)；
// 管理員回覆（admin_reply）一併附上。私密與待審／駁回的留言不會出現。
export async function GET(request: Request) {
  try {
    const postId = Number(new URL(request.url).searchParams.get("postId"));
    if (!Number.isInteger(postId)) {
      return NextResponse.json(
        { error: "缺少有效的文章編號（postId）" },
        { status: 400 },
      );
    }

    const rows = await withDbRetry(
      (sql) => sql`
        SELECT
          c.id,
          c.user_name,
          c.salutation,
          c.comment_text,
          to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          c.admin_reply,
          to_char(c.replied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS replied_at
        FROM comments c
        INNER JOIN posts p ON p.id = c.post_id
        WHERE c.post_id = ${postId}
          AND c.status = 'approved'
          AND c.is_public = true
          AND p.is_deleted = false
          AND p.post_date <= (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date
        ORDER BY c.created_at ASC, c.id ASC
      `,
      { retryAfterSent: true },
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error("❌ 回應讀取失敗:", error);
    return NextResponse.json(
      { error: "讀取回應失敗，請稍後再試" },
      { status: 500 },
    );
  }
}

// 讀者提交文章回應（公開端點，無需登入）。
// 新回應一律先進入待審核（status=pending），作者於後台審核通過後才會公開顯示。
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const postId = Number(body?.postId);
    const userName = String(body?.userName ?? "").trim().slice(0, 50);
    const salutation = String(body?.salutation ?? "").trim().slice(0, 10);
    const ageGroup = String(body?.ageGroup ?? "").trim().slice(0, 20);
    const faithYears = String(body?.faithYears ?? "").trim().slice(0, 20);
    const churchName = String(body?.churchName ?? "").trim().slice(0, 100);
    const commentText = String(body?.commentText ?? "").trim().slice(0, 5000);
    const isPublic = Boolean(body?.isPublic);

    if (!Number.isInteger(postId)) {
      return NextResponse.json({ error: "缺少有效的文章編號（postId）" }, { status: 400 });
    }
    if (!userName) {
      return NextResponse.json({ error: "請填寫姓名／暱稱" }, { status: 400 });
    }
    if (!commentText) {
      return NextResponse.json({ error: "請填寫回應內容" }, { status: 400 });
    }

    // 確認文章存在且未刪除（標題供電郵通知使用）
    const target = await withDbRetry(
      (sql) => sql`SELECT id, title FROM posts WHERE id = ${postId} AND is_deleted = false`,
      { retryAfterSent: false },
    );
    if (target.length === 0) {
      return NextResponse.json({ error: "找不到這篇文章，可能已被移除" }, { status: 404 });
    }

    const inserted = await withDbRetry(
      (sql) => sql`
        INSERT INTO comments
          (post_id, user_name, salutation, age_group, faith_years, church_name, comment_text, is_public, status)
        VALUES
          (${postId}, ${userName}, ${salutation}, ${ageGroup}, ${faithYears}, ${churchName}, ${commentText}, ${isPublic}, 'pending')
        RETURNING id,
          to_char(created_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI') AS created_at_hk
      `,
      { retryAfterSent: false },
    );

    // 回應已存妥，回應送出後才寄通知信（失敗只記錄，不影響讀者）
    const postTitle = target[0].title;
    const adminUrl = `${new URL(request.url).origin}/admin/comments`;
    after(() =>
      sendNewCommentNotification({
        postId,
        postTitle,
        userName,
        salutation,
        ageGroup,
        faithYears,
        churchName,
        commentText,
        isPublic,
        createdAtHk: inserted[0].created_at_hk,
        adminUrl,
      }),
    );

    return NextResponse.json({ ok: true, id: inserted[0].id, pending: true });
  } catch (error) {
    console.error("❌ 回應寫入失敗:", error);
    return NextResponse.json(
      { error: "回應送出失敗，請稍後再試一次" },
      { status: 500 },
    );
  }
}
