# 作者後台（寫文 + 配圖 + 發布）實作計畫

## 一、研究結論

- 專案為 Next.js 16.3（App Router、Turbopack）、React 19，讀者端為 Client Component。
- 現有 API [app/api/posts/route.ts](file:///c:/Users/win10/Documents/Programming/nextjs/projects/lgsstudy.trae/app/api/posts/route.ts)：每次請求用 `neon(process.env.DATABASE_URL)` 連 Neon Postgres；目前有 GET（含 `image_url` 欄位，但前端未顯示）與 PATCH（閱讀／讚／有待改善）。
- 讀者介面有兩份內容幾乎相同的檔案：[app/page.tsx](file:///c:/Users/win10/Documents/Programming/nextjs/projects/lgsstudy.trae/app/page.tsx) 與 [app/reader/page.tsx](file:///c:/Users/win10/Documents/Programming/nextjs/projects/lgsstudy.trae/app/reader/page.tsx)，改動需兩邊同步。
- `node_modules/next/dist/docs/` 僅有 stub 索引，實質語法沿用專案既有 Route Handler 寫法（`Request`／`Response` Web API、`NextResponse`）。
- 已確認需求：① 圖片「貼網址」與「上傳檔案」兩種都支援；② 簡單密碼保護，密碼 `1234567`；③ 配圖以文章頂部大圖展示給讀者；④ 範圍只做「寫文章＋發布」，不含編輯／刪除。

## 二、預計新增／修改檔案

### 新增
1. `app/api/admin/auth.ts`
   - 後台共用驗證：密碼讀 `process.env.ADMIN_PASSWORD`，未設定時預設 `1234567`。
   - 以 `node:crypto` 產生 SHA-256 token，核對用 `timingSafeEqual`；匯出 cookie 名稱、產生 token、驗證請求是否已登入等函式。
2. `app/api/admin/login/route.ts`
   - `POST`：比對密碼，成功於回應設定 `httpOnly`、`SameSite=Lax`、7 天效期的 cookie（名稱 `lgsstudy_admin`）；失敗回 401。
3. `app/api/admin/logout/route.ts`
   - `POST`：清除 cookie。
4. `app/api/admin/posts/route.ts`
   - `POST`：先驗證 cookie，未登入回 401。
   - 接收 `multipart/form-data`：title、scripture、category、post_date、content、imageUrl、image 檔。
   - 圖片二選一：有上傳檔時存入 `public/uploads/`（檔名以時間戳＋隨機字元＋消毒過的原始檔名），`image_url` 存 `/uploads/...`；否則使用貼上的網址；兩者皆無則存 NULL。
   - 安全限制：僅接受 `image/*` MIME、大小上限 5MB、擋掉路徑穿越字元。
   - 以參數化 SQL `INSERT INTO posts (...)` 寫入，計數欄位交由資料庫預設值，回傳新文章 id。
   - `export const runtime = "nodejs"`（需用 `node:fs/promises` 寫檔）。
5. `app/admin/page.tsx`
   - Client Component。未登入顯示密碼輸入框（呼叫 login API）；登入後顯示寫文工作台：
     - 欄位：標題、日期（預設今天）、經文、分類（輸入框＋從既有文章彙整的 datalist 建議）、配圖（網址輸入與檔案上傳二選一，含即時縮圖預覽與清除）、內文（Markdown 大字 textarea）。
     - 右側／下方即時預覽，沿用讀者端的 ReactMarkdown 樣式。
     - 「發布給讀者」按鈕：表單驗證（標題、經文、內文必填）→ POST FormData → 成功顯示繁體中文成功提示，可選擇「再寫一篇」或「前往閱讀」。
     - 右上角登出按鈕。
6. `public/uploads/.gitkeep`
   - 保留上傳目錄；執行時若目錄不存在會自動 `mkdir`。

### 修改
7. [app/page.tsx](file:///c:/Users/win10/Documents/Programming/nextjs/projects/lgsstudy.trae/app/page.tsx) 與 [app/reader/page.tsx](file:///c:/Users/win10/Documents/Programming/nextjs/projects/lgsstudy.trae/app/reader/page.tsx)
   - 在標題／經文區塊下方、Markdown 內文上方，當 `selectedPost.image_url` 有值時顯示置中大圖（`rounded-2xl`、陰影、`max-h-[420px] object-cover w-full`，深色模式配合）；無圖不留下空位。
   - 用一般 `<img>` 而非 `next/image`，避免外部網址需逐一設定 remotePatterns 白名單。

## 三、實作步驟（依賴順序）

1. 建立 `auth.ts` 共用驗證模組。
2. 建立 login／logout API。
3. 建立 `POST /api/admin/posts`（含上傳寫檔與 INSERT）。
4. 建立 `/admin` 寫文工作台頁面。
5. 兩份讀者頁面加入頂部配圖顯示。
6. 整體驗證（見下）。

## 四、相依與注意事項

- 不新增任何 npm 套件；Markdown 預覽沿用既有 `react-markdown`，icon 沿用 `lucide-react`。
- 密碼預設值直接寫在後端常數做為 fallback，本機自用可免改環境變數；日後可在 `.env.local` 加 `ADMIN_PASSWORD` 覆蓋。
- 上傳採本機磁碟，只在自架／本機環境持久；將來部署至 Vercel（唯獨檔案系統）需改接 Vercel Blob 之類的物件儲存，會在後台介面加一句繁體中文說明提醒。
- `post_date` 以 `YYYY-MM-DD` 字串送出，配合資料庫 date 型別。
- 所有新介面文字皆使用繁體中文。

## 五、驗證方式

- 未帶 cookie 打 `POST /api/admin/posts` 應回 401；錯誤密碼打 login 應回 401。
- 瀏覽器開 `http://localhost:3000/admin`：輸入 `1234567` 可進入，錯密碼會擋下。
- 用「圖片網址」發一篇測試文 → 成功提示 → 回首頁可見該文出現在列表與本文，頂部顯示大圖。
- 用「上傳檔案」再發一篇 → 確認檔案出現在 `public/uploads/`，文章大圖正常顯示。
- 沒圖的舊文章呈現維持原狀、不留下空位。
- 編輯器診斷 0 錯誤；瀏覽器 console 無紅錯。測試完的文章若要移除會先詢問您（本次預設不代為刪除資料列）。

## 六、風險與對策

- 風險：本機上傳在 Serverless 部署無法持久 → 介面加註明，程式保留日後換 Blob 的單一寫入點。
- 風險：固定簡單密碼、cookie 為自簽 token → 符合本機／低風險自用場景；程式集中在 `auth.ts`，日後可無痛升級為正式帳號體系。
- 風險：外部圖片熱連結失效 → 同時提供本機上傳方案分散風險。
- 風險：上傳惡意檔名或過大檔案 → 檔名消毒、MIME 檢查、5MB 限制。
