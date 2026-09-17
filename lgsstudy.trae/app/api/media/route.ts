import { NextResponse } from "next/server";
import { withDbRetry } from "@/lib/db";
import { deleteMedia } from "@/lib/media";
import { put, del, type PutBlobResult } from "@vercel/blob";
import { isAdminRequest } from "@/app/api/admin/auth";

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

// GET /api/media?isVideo=true — 列出媒體（後台專用）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isVideo = searchParams.get("isVideo") === "true";
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  // 檢查後台登入
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: '未登入後台' }, { status: 401 });
  }

  try {
    const rows = await withDbRetry(
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
    return NextResponse.json(rows);
  } catch (error) {
    console.error('媒體庫讀取失敗:', error);
    return NextResponse.json({ error: '讀取媒體庫失敗' }, { status: 500 });
  }
}

// POST /api/media — 上傳媒體（multipart form）
export async function POST(request: Request) {
  // 檢查後台登入
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: '未登入後台' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: '缺少檔案' }, { status: 400 });
    }

    const isVideo = file.type.startsWith('video/');
    const allowedTypes = isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
    const ext = allowedTypes[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: isVideo ? '視頻只支援 MP4／WebM／MOV' : '圖片只支援 JPG／PNG／GIF／WebP' },
        { status: 400 },
      );
    }

    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `檔案太大（上限 ${isVideo ? '100MB' : '5MB'}）` },
        { status: 400 },
      );
    }

    const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, '_').slice(0, 80);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blobName = `${isVideo ? 'videos' : 'images'}/${dateStr}/${Date.now()}-${safeName}`;

    let url: string;
    let storage: 'vercel-blob' | 'local';

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // 部署環境：上傳到 Vercel Blob
      try {
        const blob: PutBlobResult = await put(blobName, file, {
          access: 'public',
          contentType: file.type,
        });
        url = blob.url;
        storage = 'vercel-blob';
      } catch (err) {
        return NextResponse.json({ error: `Vercel Blob 上傳失敗：${String(err)}` }, { status: 500 });
      }
    } else {
      // 本地開發：存到 public/uploads/
      // 用 server action 不適用於 route handler，改用 Node.js fs
      const path = await import('node:path');
      const fs = await import('node:fs/promises');
      const { randomBytes } = await import('node:crypto');

      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });
      const finalName = `${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`;
      await fs.writeFile(path.join(uploadDir, finalName), Buffer.from(await file.arrayBuffer()));
      url = `/uploads/${finalName}`;
      storage = 'local';
    }

    // 寫入 media 表
    const insertRows = await withDbRetry(
      (sql) => sql`
        INSERT INTO media
          (file_name, original_name, mime_type, file_size, url, storage, is_video)
        VALUES
          (${blobName}, ${file.name}, ${file.type}, ${file.size}, ${url}, ${storage}, ${isVideo})
        RETURNING id
      `,
      { retryAfterSent: false },
    );

    return NextResponse.json({
      ok: true,
      id: insertRows[0].id,
      url,
      storage,
      isVideo,
      originalName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('媒體上傳失敗:', error);
    return NextResponse.json({ error: '上傳失敗，請稍後再試' }, { status: 500 });
  }
}

// DELETE /api/media?id=N — 刪除媒體
export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: '未登入後台' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '缺少有效的媒體 id' }, { status: 400 });
  }

  try {
    const result = await deleteMedia(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('媒體刪除失敗:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
