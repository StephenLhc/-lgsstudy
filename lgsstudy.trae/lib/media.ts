// 媒體庫工具：上傳到 Vercel Blob + 寫入 media 表
// 本地開發時用 localStorage 模擬 Blob（因為 Vercel Blob 需要部署環境的 BLOB_READ_WRITE_TOKEN）
import { put, list, del, type PutBlobResult } from '@vercel/blob';
import { withDbRetry } from './db';

// 上傳到 Vercel Blob（部署環境自動生效；本地開發走 local fallback）
export async function uploadToBlob(
  file: File,
  prefix: string = 'media',
): Promise<{ ok: true; url: string; fileName: string } | { ok: false; error: string }> {
  try {
    const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, '_').slice(0, 80);
    const blobName = `${prefix}/${Date.now()}-${safeName}`;

    // 本地開發時（無 BLOB_READ_WRITE_TOKEN），退而存到 public/uploads/（既有流程）
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // 用 Next.js route handler 內建的 writeFile 來存本地
      // 但這裡是 lib function，改由呼叫方決定 fallback
      return { ok: false, error: 'BLOB_READ_WRITE_TOKEN not set — 請先到 Vercel 建立 Blob Store 或用本地上傳' };
    }

    const blob: PutBlobResult = await put(blobName, file, {
      access: 'public',
      contentType: file.type || 'application/octet-stream',
    });
    return { ok: true, url: blob.url, fileName: blob.pathname };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 寫入 media 表
export async function insertMedia(params: {
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  storage: 'vercel-blob' | 'local';
  isVideo: boolean;
  width?: number;
  height?: number;
  duration?: number;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const rows = await withDbRetry(
      (sql) => sql`
        INSERT INTO media
          (file_name, original_name, mime_type, file_size, url, storage, is_video, width, height, duration)
        VALUES
          (${params.fileName}, ${params.originalName}, ${params.mimeType}, ${params.fileSize},
           ${params.url}, ${params.storage}, ${params.isVideo},
           ${params.width ?? null}, ${params.height ?? null}, ${params.duration ?? null})
        RETURNING id
      `,
      { retryAfterSent: false },
    );
    return { ok: true, id: rows[0].id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// 列出媒體（支援 is_video 篩選，預設圖片）
export async function listMedia(isVideo: boolean = false, limit: number = 50) {
  return withDbRetry(
    (sql) => sql`
      SELECT
        id,
        file_name,
        original_name,
        mime_type,
        file_size,
        url,
        storage,
        is_video,
        width,
        height,
        duration,
        alt_text,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM media
      WHERE is_video = ${isVideo}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `,
    { retryAfterSent: true },
  );
}

// 刪除媒體（同時從 Blob 刪除 + 清 media 表 + 檢查是否有文章引用）
export async function deleteMedia(id: number): Promise<{ ok: true; inUse: boolean } | { ok: false; error: string }> {
  try {
    const rows = await withDbRetry(
      (sql) => sql`SELECT url, storage FROM media WHERE id = ${id}`,
      { retryAfterSent: false },
    );
    if (rows.length === 0) return { ok: false, error: '找不到該媒體' };

    const url = rows[0].url as string;
    const storage = rows[0].storage as string;

    // 檢查是否有文章引用
    const refs = await withDbRetry(
      (sql) => sql`SELECT COUNT(*) as cnt FROM posts WHERE image_url = ${url} AND is_deleted = false`,
      { retryAfterSent: false },
    );
    const inUse = (refs[0].cnt as number) > 0;

    // 從 Blob 刪除（本地 storage 的 /uploads/ 檔案由應用層處理）
    if (storage === 'vercel-blob') {
      try { await del(url); } catch {}
    }

    await withDbRetry(
      (sql) => sql`DELETE FROM media WHERE id = ${id}`,
      { retryAfterSent: false },
    );

    return { ok: true, inUse };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
