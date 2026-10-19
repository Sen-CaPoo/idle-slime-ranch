# 貢獻指南

[English](CONTRIBUTING.en.md) · [回到 README](README.md)

謝謝你有興趣參與！這個專案同時是一款遊戲和一份「AI 怎麼開發遊戲」的教材，所以除了程式碼，**開發過程的紀錄**也一樣重要。

## 可以貢獻什麼

- 🐞 回報錯誤：附上瀏覽器、作業系統、重現步驟，最好附截圖或匯出的存檔碼。
- 🎵 試聽回饋：AI 無法聽音樂，你的耳朵很有價值。用 `node tools/render-music.js` 輸出 WAV 後告訴我們哪首需要調整。
- 📱 實機效能：在真實的中低階手機上開啟，回報 FPS 與是否自動降級。
- 🧪 測試：開發期間的單元測試沒有整理成檔案，歡迎把它們補成 `tests/`。
- 🌐 翻譯：遊戲內文目前只有正體中文。
- 📝 教材：如果你用這套方法做了自己的遊戲，歡迎分享心得。

## 開發流程

1. 開一個 issue 說明你想做什麼（小修正可以直接送 PR）。
2. 改動前先讀 [架構說明](docs/ARCHITECTURE.md)，確認你改的檔案屬於哪一層。
3. 如果改到 `window.Game` 的公開 API 或事件，請一併更新 [`COLLAB.html`](COLLAB.html) 的介面合約。
4. 改到存檔結構時，`SAVE_VERSION` +1，並在 `MIGRATIONS` 加上升級函式。
5. 送出前依改動範圍跑對應的驗收（見下表）。

## 驗收要求

| 你改了 | 請跑 | 標準 |
|---|---|---|
| 數值、經濟、扭蛋、遠征 | `node tools/sim-seeds.js 30 5 f2p,light,heavy` | F2P 地區解鎖不晚於現狀 2 天以上；輕課快 10–25% |
| 任何畫面 | `node tools/regress-browser.js` | 例外 0、60fps、純白像素 < 5% |
| 按鈕、操作流程 | `node tools/accept-ux.js` | 16/16 通過 |
| 扭蛋揭曉、特效 | `node tools/perf-gacha.js` | CPU ×4 下平均 ≥ 50fps、p95 ≤ 33ms |
| 音訊 | `node tools/render-music.js` | 峰值 < 0.99、沒有幾乎無聲的音效 |

PR 說明請附上數字，例如「sim-seeds 中位數：F2P D3/D7/D12/D22」。

## 程式風格

- 純 ES2017 以上的 JavaScript，不使用模組語法、打包工具或框架，維持 `file://` 可用。
- 每個檔案用 IIFE 包起來，對外只掛一個全域物件。
- 邏輯層（`engine.js`、`shop.js`、`dungeon.js`、`quests.js`）不能碰 DOM，必須能在 Node 載入。
- 呼叫其他模組的 API 前先確認存在（例如 `if (Game.dungeon && Game.dungeon.mult)`）。
- 註解用正體中文，說明「為什麼」，不必重述程式在做什麼。
- 不加入圖片或音訊檔：角色、背景、圖示用程式繪製，聲音用 Web Audio 合成。

## 設計原則

- **課金**：機率公開、有保底；不使用虛構原價、體力限制、差一點點的門檻、假倒數。
- **智財**：只參考類型風格，不複製任何作品的角色、介面、旋律。
- **好玩優先**：新內容不能讓 F2P 玩家的進度倒退。

## 授權

送出貢獻即表示你同意以 [MIT 授權](LICENSE) 釋出你的貢獻。
