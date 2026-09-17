// 數據儀表板統計 API（後台專用）
// 單一端點回傳所有儀表板資料，減少往返（Neon 冷連線時尤其重要）
import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";
import { isAdminRequest } from "@/app/api/admin/auth";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    // ───── 1. 文章與互動總覽（含訂閱人數，用子查詢一次取回） ─────
    const overviewRows = await withDbRetry(
      (sql) => sql`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = false)::int AS published_posts,
          COUNT(*) FILTER (
            WHERE is_deleted = false
              AND post_date > (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date
          )::int AS scheduled_posts,
          COUNT(*) FILTER (WHERE is_deleted = true)::int AS deleted_posts,
          COALESCE(SUM(views) FILTER (WHERE is_deleted = false), 0)::int AS total_views,
          COALESCE(SUM(like_count) FILTER (WHERE is_deleted = false), 0)::int AS total_likes,
          COALESCE(SUM(dislike_count) FILTER (WHERE is_deleted = false), 0)::int AS total_dislikes,
          (SELECT COUNT(*) FROM subscribers WHERE is_active = true)::int AS active_subscribers,
          (SELECT COUNT(*) FROM subscribers)::int AS total_subscribers
        FROM posts
      `,
      { retryAfterSent: true },
    );

    // ───── 2. 回應總覽（按審核狀態＋公開意願） ─────
    const commentRows = await withDbRetry(
      (sql) => sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE is_public = false)::int AS private
        FROM comments
      `,
      { retryAfterSent: true },
    );

    // ───── 3. 全部未刪文章（文章量少，一次取回，前端排三個排行榜） ─────
    const postRows = await withDbRetry(
      (sql) => sql`
        SELECT
          id,
          title,
          COALESCE(views, 0)::int AS views,
          COALESCE(like_count, 0)::int AS like_count,
          COALESCE(dislike_count, 0)::int AS dislike_count,
          COALESCE(comment_count, 0)::int AS comment_count,
          to_char(post_date, 'YYYY-MM-DD') AS post_date
        FROM posts
        WHERE is_deleted = false
        ORDER BY views DESC, id DESC
      `,
      { retryAfterSent: true },
    );

    // ───── 4. 最近 14 天趨勢：每日新回應數＋新發文數（合併成一次查詢） ─────
    const trendRows = await withDbRetry(
      (sql) => sql`
        WITH days AS (
          SELECT generate_series(
            ((NOW() AT TIME ZONE 'Asia/Hong_Kong')::date - INTERVAL '13 days'),
            (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date,
            INTERVAL '1 day'
          )::date AS day
        )
        SELECT
          to_char(d.day, 'YYYY-MM-DD') AS date,
          COUNT(c.id)::int AS comments,
          COUNT(p.id)::int AS posts
        FROM days d
        LEFT JOIN comments c
          ON (c.created_at AT TIME ZONE 'Asia/Hong_Kong')::date = d.day
        LEFT JOIN posts p
          ON p.post_date = d.day AND p.is_deleted = false
        GROUP BY d.day
        ORDER BY d.day
      `,
      { retryAfterSent: true },
    );

    const trend = trendRows.map((r) => ({
      date: r.date as string,
      comments: Number(r.comments),
      posts: Number(r.posts),
    }));

    // ───── 5. 分類表現（category 以頓號分隔，一列文章可計入多個分類） ─────
    const categoryRows = await withDbRetry(
      (sql) => sql`
        SELECT
          cat AS category,
          COUNT(*)::int AS posts,
          COALESCE(SUM(COALESCE(views, 0)), 0)::int AS views,
          COALESCE(SUM(COALESCE(like_count, 0)), 0)::int AS likes,
          COALESCE(SUM(COALESCE(dislike_count, 0)), 0)::int AS dislikes
        FROM posts,
             unnest(string_to_array(COALESCE(NULLIF(category, ''), '靈修默想'), '、')) AS cat
        WHERE is_deleted = false
        GROUP BY cat
        ORDER BY views DESC, posts DESC
      `,
      { retryAfterSent: true },
    );

    const overview = overviewRows[0];
    const commentStats = commentRows[0];
    const publishedPosts = Number(overview.published_posts) || 0;
    const totalViews = Number(overview.total_views) || 0;
    const totalLikes = Number(overview.total_likes) || 0;
    const totalDislikes = Number(overview.total_dislikes) || 0;

    return NextResponse.json({
      overview: {
        publishedPosts,
        scheduledPosts: Number(overview.scheduled_posts) || 0,
        deletedPosts: Number(overview.deleted_posts) || 0,
        totalViews,
        totalLikes,
        totalDislikes,
        avgViews: publishedPosts > 0 ? Math.round(totalViews / publishedPosts) : 0,
        subscribers: Number(overview.active_subscribers) || 0,
        totalSubscribers: Number(overview.total_subscribers) || 0,
        // 互動比例：有待進步佔「讚好＋有待進步」的比率
        improvementRate:
          totalLikes + totalDislikes > 0
            ? Math.round((totalDislikes / (totalLikes + totalDislikes)) * 1000) / 10
            : 0,
      },
      comments: {
        total: Number(commentStats.total) || 0,
        pending: Number(commentStats.pending) || 0,
        approved: Number(commentStats.approved) || 0,
        rejected: Number(commentStats.rejected) || 0,
        private: Number(commentStats.private) || 0,
      },
      posts: postRows,
      trend,
      categories: categoryRows,
    });
  } catch (error) {
    console.error("儀表板統計失敗:", error);
    return NextResponse.json({ error: "統計資料讀取失敗，請稍後再試" }, { status: 500 });
  }
}
