// 文章／回應匯出 Excel 備份（後台專用）
// 一次下載含「文章」「回應」兩個分頁的 .xlsx，繁體中文欄名
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withDbRetry } from "@/lib/db";
import { isAdminRequest } from "@/app/api/admin/auth";

export const dynamic = "force-dynamic"; // 確保每次都產生最新備份，不走快取

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    // ───── 文章（含已刪除、排程中，完整備份） ─────
    const posts = await withDbRetry(
      (sql) => sql`
        SELECT
          id,
          title,
          scripture,
          category,
          content,
          to_char(post_date, 'YYYY-MM-DD') AS post_date,
          COALESCE(views, 0)::int AS views,
          COALESCE(like_count, 0)::int AS like_count,
          COALESCE(dislike_count, 0)::int AS dislike_count,
          COALESCE(comment_count, 0)::int AS comment_count,
          image_url,
          is_pinned,
          is_deleted,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created_at
        FROM posts
        ORDER BY id
      `,
      { retryAfterSent: true },
    );

    // ───── 回應（含待審／已駁回／私密，完整備份，JOIN 文章標題） ─────
    const comments = await withDbRetry(
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
          to_char(c.replied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS replied_at,
          to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created_at
        FROM comments c
        LEFT JOIN posts p ON p.id = c.post_id
        ORDER BY c.id
      `,
      { retryAfterSent: true },
    );

    // 香港時區今天（用於判斷排程狀態）
    const now = new Date();
    const hkParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const hkToday =
      hkParts.find((p) => p.type === "year")?.value +
      "-" +
      hkParts.find((p) => p.type === "month")?.value +
      "-" +
      hkParts.find((p) => p.type === "day")?.value;

    const statusLabel: Record<string, string> = {
      pending: "待審核",
      approved: "已通過",
      rejected: "已駁回",
    };

    // ───── 組成文章分頁（繁中欄名） ─────
    const postRows = posts.map((p) => {
      const postDate = String(p.post_date ?? "");
      let state = "已發布";
      if (p.is_deleted) state = "已刪除（回收站）";
      else if (postDate && postDate > hkToday) state = "排程中";
      return {
        "文章編號": p.id,
        "標題": p.title,
        "經文": p.scripture,
        "主題分類": p.category,
        "內文（Markdown）": p.content,
        "發布日期": postDate,
        "狀態": state,
        "是否置頂": p.is_pinned ? "是" : "",
        "瀏覽量": p.views,
        "讚好": p.like_count,
        "有待進步": p.dislike_count,
        "回應數": p.comment_count,
        "配圖網址": p.image_url ?? "",
        "建立時間(UTC)": p.created_at,
      };
    });

    // ───── 組成回應分頁 ─────
    const commentRows = comments.map((c) => ({
      "回應編號": c.id,
      "文章編號": c.post_id,
      "文章標題": c.post_title ?? "（文章已不存在）",
      "姓名／暱稱": c.user_name,
      "稱謂": c.salutation,
      "年齡組別": c.age_group,
      "信主年日": c.faith_years,
      "教會": c.church_name,
      "回應內容": c.comment_text,
      "公開意願": c.is_public ? "同意公開" : "僅供作者",
      "審核狀態": statusLabel[String(c.status)] ?? String(c.status),
      "作者回覆": c.admin_reply ?? "",
      "回覆時間(UTC)": c.replied_at ?? "",
      "提交時間(UTC)": c.created_at,
    }));

    // ───── 產生活頁簿 ─────
    const wb = XLSX.utils.book_new();
    const wsPosts = XLSX.utils.json_to_sheet(
      postRows.length ? postRows : [{ "提示": "目前沒有任何文章" }],
    );
    const wsComments = XLSX.utils.json_to_sheet(
      commentRows.length ? commentRows : [{ "提示": "目前沒有任何回應" }],
    );

    // 設定欄寬（內文欄加寬，其餘適中）
    wsPosts["!cols"] = [
      { wch: 8 }, { wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 60 },
      { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 8 }, { wch: 7 },
      { wch: 9 }, { wch: 8 }, { wch: 40 }, { wch: 16 },
    ];
    wsComments["!cols"] = [
      { wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 14 }, { wch: 8 },
      { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 50 }, { wch: 10 },
      { wch: 10 }, { wch: 40 }, { wch: 16 }, { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(wb, wsPosts, "文章");
    XLSX.utils.book_append_sheet(wb, wsComments, "讀者回應");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 檔名含香港日期：靈修網站備份-2026-09-17.xlsx
    const filename = `靈修網站備份-${hkToday}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("匯出備份失敗:", error);
    return NextResponse.json({ error: "匯出失敗，請稍後再試" }, { status: 500 });
  }
}
