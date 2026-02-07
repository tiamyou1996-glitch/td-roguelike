# 塔防 Roguelike · H5 网页版

手机浏览器可直接玩的版本，无需微信。与 `wechat-mini-game` 同源，通过适配层在浏览器中运行。

## 本地运行

1. 用浏览器直接打开 `index.html`，或  
2. 用本地服务器（推荐，避免部分浏览器对 file:// 限制）：
   ```bash
   # 若已安装 Python 3
   python3 -m http.server 8080
   # 然后访问 http://localhost:8080
   ```
   ```bash
   # 若已安装 Node.js 的 npx
   npx serve .
   ```

## 手机测试

- 电脑和手机在同一 WiFi 下时，用电脑跑上述服务器，手机浏览器访问 `http://电脑IP:8080` 即可。
- 或把整个文件夹上传到 Itch.io / GitHub Pages 等，用链接分享。

## 文件说明

- `index.html`：入口页，viewport 已适配手机
- `js/adapter.js`：微信 API 的浏览器适配（canvas / 触摸 / 存档 / 音效占位）
- `js/main.js`：与微信小游戏版相同的游戏逻辑

存档使用浏览器 `localStorage`，与微信版互不共用。
