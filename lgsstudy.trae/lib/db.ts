import { neon } from '@neondatabase/serverless';

// 本機連到 Neon（AWS 新加坡）的網路品質不佳，TCP 連線常要 2～10 秒，
// 偶爾會持續一兩分鐘連不上。以下錯誤都發生在「建立連線」階段，
// 請求根本還沒送出，重試絕對安全（也不會造成資料重複寫入）。
const CONNECT_STAGE_PATTERN =
  /fetch failed|connect timeout|connection timeout|UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNABORTED/i;

// 以下錯誤可能發生在「請求已送出、回應途中」，對 INSERT 重試有機會造成重複列，
// 因此預設不對這類錯誤重試；只有呼叫端明示 retryAfterSent 才重試
// （GET、冪等的 UPDATE/PATCH 可以安全重試）。
const RESPONSE_STAGE_PATTERN =
  /terminating connection|socket hang up|ECONNRESET|UND_ERR_SOCKET/i;

function isTransientDbError(err: unknown): { connectStage: boolean; responseStage: boolean } {
  const e = err as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  } | null;
  if (!e) return { connectStage: false, responseStage: false };
  const text = [e.code, e.message, e.cause?.code, e.cause?.message]
    .filter(Boolean)
    .join(' ');
  return {
    connectStage: CONNECT_STAGE_PATTERN.test(text),
    responseStage: RESPONSE_STAGE_PATTERN.test(text),
  };
}

type NeonSql = ReturnType<typeof neon>;

interface RetryOptions {
  // 最多嘗試幾次（含第一次），預設 6 次
  attempts?: number;
  // 是否允許在「請求可能已送達」後重試；INSERT 務必維持 false 以免重複寫入
  retryAfterSent?: boolean;
}

// 每次重試都建立全新連線，等待時間拉長為 2s、5s、10s、20s、30s，
// 覆蓋本機網路常見的 1～2 分鐘不穩視窗。SQL 層級錯誤一律不重試。
// T 預設為列陣列（SELECT／UPDATE RETURNING 的結果），呼叫端可直接 .length、[0] 取用
export async function withDbRetry<T = Record<string, any>[]>(
  fn: (sql: NeonSql) => Promise<unknown>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const retryAfterSent = options.retryAfterSent ?? false;
  const delays = [2000, 5000, 10000, 20000, 30000];
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    const sql: NeonSql = neon(process.env.DATABASE_URL as string);
    try {
      return (await fn(sql)) as T;
    } catch (err) {
      lastErr = err;
      const { connectStage, responseStage } = isTransientDbError(err);
      const canRetry = connectStage || (retryAfterSent && responseStage);
      if (i === attempts || !canRetry) throw err;
      const wait = delays[Math.min(i - 1, delays.length - 1)];
      console.warn(`⚠️ 資料庫連線不穩，${wait / 1000} 秒後進行第 ${i + 1} 次嘗試…`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw lastErr;
}
