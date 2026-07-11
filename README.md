# 竹筷橋梁實驗室

適合小學生的 3D 力學與橋梁結構教學遊戲。學生可以在瀏覽器中用「竹筷」連接節點，完成橋梁後逐步增加配重，觀察結構形變、受力顏色與倒塌過程。

## 功能

- 3D 視角旋轉與縮放
- 點選兩個節點放置竹筷
- 自由搭建、三角桁架橋、拱橋、斜張橋、吊橋範本
- 逐次或自動增加砝碼
- 竹筷受力顏色提示、斷裂與橋梁倒塌判定
- 竹筷強度調整、最大承重紀錄與課堂挑戰任務
- 手機、平板與桌面瀏覽器響應式介面

## 在本機執行

因為程式使用 JavaScript 模組，請使用本機伺服器，不要直接雙擊 `index.html`。

```bash
python3 -m http.server 8000
```

再開啟 `http://localhost:8000`。

## 部署到 GitHub Pages

1. 建立新的 GitHub Repository。
2. 將 `index.html`、`style.css`、`app.js` 上傳到 Repository 根目錄。
3. 進入 **Settings → Pages**。
4. 在 **Build and deployment** 選擇 **Deploy from a branch**。
5. Branch 選擇 `main`，資料夾選擇 `/ (root)`，按下 Save。
6. 等待 GitHub Pages 顯示公開網址。

## 教學提醒

這是一個簡化的視覺化模型，用來比較橋梁結構與建立「三角形較不易變形、斜撐能分散力量、橋中央通常承受較大彎曲」等概念。模擬數字不應視為真實竹筷的精密工程數據。

## 使用的開源函式庫

- Three.js：3D 場景與繪圖
- cannon-es：剛體與碰撞物理模擬
