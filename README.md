# yoanna1｜繁體中文 AI 聊天

Node.js 後端使用 OpenAI 官方 JavaScript SDK 的 **Responses API**。前端只呼叫同源 `/api/chat`；金鑰只在伺服器使用。保留原有繁體中文首頁，加入多輪聊天、載入提示、錯誤提示與清除對話。沒有假 AI 回答或離線替代回答。

## 檔案結構

- `public/index.html`、`public/styles.css`、`public/chat.js`：唯一公開的靜態檔案。
- `api/chat.js`：共用的 Node.js / Vercel API handler。
- `server.js`：本機 HTTP 伺服器，僅公開明列的前端檔案。
- `test/chat.test.js`：HTTP、輸入驗證、安全限制及可選的真實 API 測試。
- `vercel.json`：靜態輸出目錄、API 執行時間與安全標頭設定。
- `.env.example`：環境變數範本；`yy` 保留原始介紹。

## 本機執行

需要 **Node.js 24.x**（附 npm）與 OpenAI API 帳戶／可用額度；ChatGPT 訂閱不等同 API 額度。

```sh
npm ci
cp .env.example .env
```

Windows 可在檔案總管複製 `.env.example` 並命名為 `.env`。
在本機編輯器中編輯 `.env`，填入自己的 `OPENAI_API_KEY`。不要貼到聊天、終端指令、截圖或 Git 提交中。
`OPENAI_MODEL` 預設為 `gpt-4.1-mini`，可改為帳戶有權限使用、支援 Responses API 的模型。
範例檔所有值均留白；`OPENAI_MODEL` 與 `PORT` 留白時分別使用 `gpt-4.1-mini` 與 `3000`。
`npm start` / `npm run dev` 會透過 Node.js 的 `--env-file-if-exists=.env` 載入根目錄 `.env`。
`.env.local` 也被 Git 忽略，但目前不會自動載入；請使用 `.env`。直接執行 `node server.js` 只會使用已存在的程序環境變數。

```sh
npm run dev
```

開啟 `http://127.0.0.1:3000`，輸入問題並送出；應先顯示「AI 正在思考」，然後顯示真實回答。修改內容後自動重新啟動；`npm start` 是不監看變更的啟動方式。可用 `PORT` 調整連接埠，Ctrl+C 停止。
請使用 Node.js 伺服器，原本的 Python 靜態伺服器無法處理聊天 API。

## 測試

```sh
npm test
```

測試會啟動隨機本機連接埠，驗證公開頁面與資源、私密檔案不可存取、405/415/400/403/413/429，以及缺少金鑰時的 503。一般測試不呼叫付費 API，真實 API 測試預設明確跳過，不會產生模擬回答。

完成 `.env` 設定後，可選擇執行以下測試，**會產生 API 用量費用**：

```sh
node --env-file=.env --test --test-name-pattern="real OpenAI" test/chat.test.js
```

上述指令仍需在 `.env` 加入 `RUN_OPENAI_INTEGRATION=1` 才會啟用。測試檢查真實 Responses API 回傳非空回答，不會輸出金鑰或聊天內容。

瀏覽器另外確認：手機寬度排版、Tab 鍵操作、連續對話、清除對話、載入時避免重複送出，以及斷網錯誤。AI 回答以純文字顯示，不執行 HTML。

## API 與限制

`POST /api/chat`，Content-Type 為 `application/json`：

```json
{"messages":[{"role":"user","content":"你好"}]}
```

成功回應為 `{"reply":"…"}`，錯誤為 `{"error":"…"}`。僅接受交替的 `user` / `assistant` 訊息，使用者開始及結尾，最多 12 則、每則 2000 字、合計 8000 字，請求最多 24000 bytes。前端自動保留近期對話，較長的 AI 回答只將前 2000 字放入後續上下文，完整回答仍顯示於畫面。

每個 IP、每個執行個體每分鐘最多 10 次 POST；包含無效請求。OpenAI 呼叫逾時為 45 秒、不自動重試、最多輸出 1200 tokens；不接受使用者指定模型或 system 指令。上游錯誤不直接回傳，以免洩漏敏感資訊。

**Vercel 的記憶體限流不會跨執行個體共享，冷啟動也會重置**，不能當成公開服務的完整用量保護。本站尚無帳號登入。正式對外開放前，請在 Vercel Firewall 設定 `/api/chat` 的平台限流（依方案可用功能），或加入共享儲存限流及身分驗證，並在 OpenAI 設定用量提醒與適當專案權限。跨站瀏覽器請求會被拒絕；這不會阻止自行撰寫的 HTTP 客戶端。

訊息只保留在目前頁面記憶體，重整或清除即移除；每次呼叫會將保留的上下文傳送到 OpenAI。`store: false` 關閉 Responses 回應儲存，但不代表供應商沒有其他安全／濫用監控資料保留；請依 OpenAI 的資料政策使用，勿輸入敏感個資。

## 手動部署至 Vercel（本次不部署）

1. 本機測試完成後，檢查 `git status`；確認 `.env` 被忽略，只有 `.env.example` 會提交。自行提交並推送網站檔案至 GitHub。
2. 在 Vercel 選 **Add New → Project**，匯入 `yoanna66/yoanna1`。若平台之後綁定 Git 分支，後續推送通常會自動部署，請自行管理 Git Integration 設定。
3. Root Directory 選專案根目錄，Framework Preset 選 **Other**；Node.js 選 **24.x**。沿用 `vercel.json` 的 `public` 輸出目錄，不需前端建置指令；預設安裝會使用 lockfile。
4. 在 **Settings → Environment Variables** 安全新增 `OPENAI_API_KEY`，選擇需要的 Production / Preview 範圍；可選擇新增 `OPENAI_MODEL=gpt-4.1-mini`。不要加 `NEXT_PUBLIC_` 或 `VITE_` 前綴，也不要上傳 `.env`。
5. 自行部署。新增或修改環境變數後需重新部署才會套用。
6. 使用 Vercel 提供的 HTTPS 網址檢查首頁、樣式及真實聊天，確認 Network 中只有 `/api/chat`、沒有 API Key。測試空白／過長輸入、錯誤訊息與載入狀態；檢查 Functions 日誌時不要記錄金鑰或完整對話。
7. 在對外分享前完成前述平台限流／存取控制。需要控制 API 成本時，不要只依靠前端按鈕或記憶體計數。

GitHub Pages 只能提供靜態檔案，無法執行本專案的 Node.js API，請改用 Vercel 等支援伺服器函式的平台。

## 常見問題

- 503「尚未設定」：檢查伺服器 `OPENAI_API_KEY` 是否存在；修改後重啟本機或重新部署。
- 503「忙碌或額度不足」：檢查 OpenAI API 計費、配額及速率限制。
- 502：檢查金鑰有效性、模型權限及伺服器到 `api.openai.com` 的 HTTPS 連線。請勿停用 TLS 驗證。
- 429：本站請求過多，等待 `Retry-After` 秒數後再試。
- 504：AI 回答逾時，稍後再試或縮短問題。

金鑰若曾外洩，請立即在 OpenAI 撤銷並更新，僅刪除 Git 檔案不足以移除歷史紀錄。
