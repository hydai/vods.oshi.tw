# VODs by oshi.tw

`vods.oshi.tw` 是一個用來快速瀏覽 VTuber 歌回 VOD、歌曲與演唱時間點的網站。

## 資料來源

網站在伺服器端讀取 [`https://data.oshi.tw/vod/v1/manifest.json`](https://data.oshi.tw/vod/v1/manifest.json)，並依 manifest 指向的 immutable snapshot 載入完整資料。

載入流程會驗證：

- schema major version、欄位與集合上限
- snapshot trusted origin、路徑、decoded byte length 與 SHA-256
- manifest / snapshot version 與 counts 一致性
- ID 唯一性、canonical ordering、日期與時間範圍
- URL provider allowlist、Unicode scalar / NFC 與顯示文字首尾空白

新 snapshot 全部通過驗證後才會原子切換；更新失敗時，常駐 instance 會繼續使用上一個已驗證版本。公開 feed 不支援瀏覽器 CORS，因此資料不會由訪客的瀏覽器直接下載。

同一 instance 的併發請求共用一次下載；快取每 60 秒在背景更新，下載與讀取 body 合計最多 10 秒，失敗後等待 15 秒再重試。已驗證的舊資料會在更新期間繼續提供。未知的社群平台欄位會略過，直到介面支援該平台。

本站允許 manifest 的 `publishedAt` 最多比伺服器當下時間超前 5 分鐘；超出此時鐘誤差範圍會拒絕更新並保留既有資料，避免錯誤的未來時間使後續正常發布一直被判定為舊版本。此檢查也適用於相同 hash 的 manifest 更新。

規格文件：

- [Consumer guide](https://data.oshi.tw/vod/v1/guide.md)
- [Manifest schema](https://data.oshi.tw/vod/v1/schemas/1.0.0/manifest.schema.json)
- [Snapshot schema](https://data.oshi.tw/vod/v1/schemas/1.0.0/snapshot.schema.json)

## 本機開發

```bash
npm ci
npm run dev
```

常用檢查：

```bash
npm run lint
npm test
```

`npm test` 會建置、產生 Workers bindings 型別，分別檢查瀏覽器與 Worker 型別，並執行單元測試及 Miniflare／workerd 整合測試；測試使用本機 feed，不連線至正式資料來源。建置後可用 `npm run typecheck` 單獨檢查型別。

網站只接受 GET／HEAD。HTML 的 CSP 使用每次回應產生的 nonce，並允許 YouTube 播放器；新增外部資源時需同步檢查 `worker/index.ts` 的政策。`ASSETS` binding 由 `vite.config.ts` 設定；未啟用 Images binding，因此圖片端點回傳原圖。

## 主要頁面

- `/`：全站搜尋、VTuber／團體／年份篩選、排序與 VOD 卡片
- `/vod/[streamer]/[videoId]`：VOD 詳情、歌曲時間軸與 YouTube timestamp 連結

## 技術

- Next.js App Router + React
- vinext / Cloudflare Workers runtime
- Prism 共用的淺色、深色設計 token
- Zod runtime validation
- Lucide icons

## 授權

程式碼以 [Apache License 2.0](LICENSE) 授權，Copyright 2026 hydai。

「oshi.tw」名稱與 VODs／Prism 品牌視覺素材（含 logo、favicon 與 `public/og.png`）不在授權範圍內；依 Apache-2.0 第 6 條，本授權不授予任何商標權。
