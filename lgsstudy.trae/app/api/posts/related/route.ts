import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";

// 相關文章推薦：找出與指定文章共享至少一個主題分類的其他未刪除文章
// - 排除自己
// - 排序：共享分類數降序 → 發布日期由新到舊 → id 由大到小
// - 最多回傳 4 篇
// category 欄位可能含多個分類，以「、」（頓號）分隔
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postIdParam = searchParams.get("postId");
    const postId = postIdParam ? Number(postIdParam) : NaN;

    // postId 必須是正整數（拒絕 null、空字串、字串、0 與負數）
    if (!Number.isInteger(postId) || postId <= 0) {
      return NextResponse.json(
        { error: "有效的 postId 為必填參數" },
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

    const related = await withDbRetry(
      (sql) => sql`
        WITH target AS (
          SELECT
            COALESCE(
              string_to_array(NULLIF(category, ''), '、'),
              ARRAY['靈修默想']::text[]
            ) AS cats
          FROM posts
          WHERE id = ${postId} AND is_deleted = false
        )
        SELECT
          p.id,
          p.title,
          p.scripture,
          COALESCE(p.category, '靈修默想') as category,
          p.post_date::text as post_date,
          p.image_url,
          COALESCE(p.views, 0) as views,
          (
            SELECT count(*)
            FROM unnest(
              string_to_array(COALESCE(p.category, '靈修默想'), '、')
            ) AS pc
            WHERE pc = ANY(target.cats)
          ) AS overlap_count
        FROM posts p
        CROSS JOIN target
        WHERE p.id <> ${postId}
          AND p.is_deleted = false
          AND p.post_date <= (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date
          -- 至少共享一個分類（陣列重疊運算子 &&）
          AND string_to_array(COALESCE(p.category, '靈修默想'), '、') && target.cats
        ORDER BY overlap_count DESC, p.post_date DESC, p.id DESC
        LIMIT 4
      `,
      { retryAfterSent: true },
    );

    return NextResponse.json(related);
  } catch (error) {
    console.error("❌ 讀取相關文章失敗:", error);
    return NextResponse.json(
      { error: "Failed to fetch related posts", details: String(error) },
      { status: 500 },
    );
  }
}
