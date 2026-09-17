// 後台：檢視訂閱者名單與手動刪除
import { NextResponse } from "next/server";
import { listAllSubscribers } from "@/lib/newsletter";
import { withDbRetry } from "@/lib/db";
import { isAdminRequest } from "@/app/api/admin/auth";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  try {
    const subs = await listAllSubscribers();
    const active = subs.filter((s) => s.is_active).length;
    return NextResponse.json({ subs, active, total: subs.length });
  } catch (error) {
    return NextResponse.json({ error: "讀取訂閱者失敗" }, { status: 500 });
  }
}

// 管理員手動刪除訂閱者（依 id）
export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
  }
  try {
    await withDbRetry(
      (sql) => sql`DELETE FROM subscribers WHERE id = ${id}`,
      { retryAfterSent: false },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
