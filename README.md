# DDF — Designer Desk Fuel

設計師的工作空間 × 創意據點。**Find Your Space. Fuel Your Magic.**

DDF 是一個 **Workspace Directory**：只刊登經店家授權、並經管理員核對資料後公開的工作空間資訊。不做推薦、星級或排名。

技術：React + TypeScript（Vite）· Supabase（PostgreSQL / Auth / RLS）· Vitest + PGlite（在真實 Postgres 引擎上測試資料庫權限）。

---

## 目前狀態

### ✅ 已完成並有自動化測試
- 資料庫結構與 RLS：`spaces`、`space_authorizations`、`space_assets`、`space_update_requests`、`space_update_logs`、`space_reviews`、`profiles`、`user_roles`、`admin_audit_log`
- 公開目錄只能透過 `list_public_spaces()` 讀取；條件全部在資料庫判斷（不依賴前端隱藏）：
  已授權 + 授權未過期 + 未撤回 + 已核對資料 + 已上架 + 非 DEMO
- 超過複查期限：自動標示「資料待確認」，並停止回傳價格與營業時間
- 店家申請、素材授權、資料更新申請、暫停／撤回（立即生效）
- 管理員審核、核對、上架／暫停／撤下、素材授權、更新審核、評價隱藏；全部寫入不可修改的稽核紀錄
- 設計師真實評價：僅限登入會員、僅限已公開空間、每人每空間一則、無星級與排名、管理員可隱藏
- 活動場地與聚會：可辦活動／講座、容納人數、可接待聚會、大桌面

**資料庫安全測試：34 項全部通過**（`npm test`）。涵蓋規格書的 8 項測試案例，以及評價、DEMO 資料、刪除帳號等情境。

### ✅ 已完成（前端，尚未在連線 Supabase 的環境實測）
首頁、關於 DDF（`/about`）、探索空間（`/spaces`）、店家申請（`/list-your-space`）、我的刊登（`/my-spaces`）、登入／註冊／忘記密碼／重設密碼、管理後台（`/admin`）、店家刊登授權條款、素材使用規範。

> 前端程式可以通過型別檢查與正式版建置，但**尚未接上真正的 Supabase 專案跑過完整流程**。接上後請依「上線前檢查」逐項走一次。

### ⏳ 尚未完成
- 會員聊天室（DDF Lounge）、私訊、封鎖、檢舉系統、Magic Level（第一份規格書的 Phase 4–5）
- 照片／Logo 直接上傳（目前以 https 圖片網址提交；需設定 Supabase Storage）
- 評價檢舉功能（目前由管理員主動隱藏）
- 隱私權政策、服務條款等法律頁面僅有草稿框架，**需法律審閱**；營運者資訊、保存期限標示為【待確認】
- 授權到期提醒 Email（需 Edge Function + 寄信服務）
- 部署設定

---

## 專案結構

```
supabase/
  migrations/
    20261109000100_core_roles_audit.sql      會員資料、管理員角色、稽核紀錄
    20261109000200_workspace_directory.sql   店家授權刊登目錄（資料表、RLS、函式）
    20261109000300_space_reviews.sql         設計師真實評價
  seed.sql                                   DEMO 資料（僅供開發，永遠不會公開）
src/
  pages/            各頁面（admin/ 為管理後台）
  components/       Layout、Icon、評價元件
  lib/              Supabase client、登入狀態、中文標籤
tests/db/           資料庫安全測試（PGlite 真實 Postgres）
public/             Logo、主視覺與用途卡片圖片
```

---

## Supabase 設定步驟（需要你操作）

1. 到 [supabase.com](https://supabase.com) 建立免費專案（Region 建議選 Tokyo 或 Singapore）。
2. **執行資料庫 migration**（擇一）：
   - 用 Supabase CLI：`npx supabase link --project-ref <你的 project ref>`，接著 `npx supabase db push`
   - 或在 Dashboard → SQL Editor，依檔名順序貼上 `supabase/migrations/` 三個檔案執行
3. Authentication → Providers：確認 **Email** 已開啟，並開啟 **Confirm email**（Email 驗證）。
4. Authentication → URL Configuration：
   - Site URL：你的網站網址（本機開發用 `http://localhost:5173`）
   - Redirect URLs 加入：`<網站網址>/login`、`<網站網址>/reset-password`
5. 正式上線前，到 Authentication → SMTP Settings 設定自訂寄信服務。Supabase 內建寄信每小時只能寄很少封，只適合測試。

### 環境變數

複製 `.env.example` 為 `.env`，從 Dashboard → Project Settings → API 填入：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

- `anon key` 本來就是公開金鑰，資料安全靠 RLS 保護。
- **絕對不要**把 `service_role key` 放進前端或 commit 到 GitHub。
- 未設定時，網站會顯示「尚未連接 Supabase」，不會顯示任何假資料。

### 建立管理員帳號

1. 先在網站上用你的 Email 註冊並完成驗證。
2. 在 SQL Editor 執行（只有專案擁有者能做，一般會員無法自行設定角色）：

```sql
insert into public.user_roles (user_id, role, note)
select id, 'admin', '平台擁有者'
from auth.users
where email = '你的Email';
```

3. 重新登入後，選單會出現「管理後台」。

---

## 本機開發

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 資料庫安全測試（不需要 Supabase 帳號）
npm run build   # 正式版建置
```

## 部署注意

這是單頁應用程式（SPA），主機需把所有路徑導回 `index.html`：
- **Vercel／Netlify／Cloudflare Pages**：設定 SPA rewrite（建議，三者都有免費方案）
- **GitHub Pages**：不支援 rewrite，需改用 HashRouter 或加 404.html 轉址

在主機的環境變數中設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。

---

## 上線前檢查（接上 Supabase 後實測）

- [ ] 註冊 → 收到驗證信 → 登入 → 登出 → 忘記密碼 → 重設
- [ ] 以 SQL 設定管理員後，`/admin` 可進入；一般會員進入顯示「無權限」
- [ ] 店家送出申請 → 後台核准（填授權證明與到期日）→ 核對資料 → 上架 → `/spaces` 出現
- [ ] 店家暫停／撤回 → `/spaces` 立即消失
- [ ] 店家送出資料更新 → 後台核准前公開資料不變
- [ ] 素材未確認前不顯示
- [ ] 會員在已公開空間留下評價；管理員隱藏後消失
- [ ] 稽核紀錄有上述所有操作

---

## 免費方案限制與未來可能費用

Supabase Free 方案（2026-11 查詢，請以官網為準）：
- 資料庫 500 MB、檔案儲存 1 GB、流量（egress）5 GB／月、50,000 位月活躍使用者
- 最多 2 個進行中的專案
- **專案閒置 7 天會自動暫停**，網站會連不上直到手動恢復，這是正式上線最大的風險
- 沒有自動備份

正式上線建議升級 Pro（US$25／月起）：8 GB 資料庫、250 GB 流量、100,000 月活躍使用者、不會因閒置暫停、每日備份。超量另計。

其他可能費用：自訂寄信服務（多數有免費額度）、網域、地圖服務（若之後接 Google Maps／Mapbox）。

---

## 已知風險

- 授權驗證（確認申請人真的是店家）目前靠管理員人工核對，並在後台記錄證明編號。
- 管理後台以瀏覽器對話框輸入原因，功能可用但操作較陽春。
- 評價屬使用者生成內容，需訂定社群守則與申訴流程（法律頁面待補）。
- 首頁合作夥伴（@socialdesignlab_、@pptnight.tw）已由擁有者授權，Logo 檔待提供。
