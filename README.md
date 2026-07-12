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
