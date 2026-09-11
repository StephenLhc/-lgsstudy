import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

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

    const sql = neon(databaseUrl);

    // 簡化 SQL，確保基本欄位都能順利抓取，避免轉型失敗
    const posts = await sql`
      SELECT 
        id, 
        title, 
        scripture, 
        COALESCE(category, '靈修默想') as category, 
        content, 
        post_date::text as post_date, 
        COALESCE(like_count, 0) as like_count, 
        COALESCE(dislike_count, 0) as dislike_count, 
        COALESCE(comment_count, 0) as comment_count 
      FROM posts 
      ORDER BY post_date DESC, id DESC
    `;

    return NextResponse.json(posts);
  } catch (error) {
    console.error("❌ 資料庫讀取失敗詳細資訊:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts", details: String(error) },
      { status: 500 },
    );
  }
}
