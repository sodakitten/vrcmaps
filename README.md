# vrcmaps 🗺️

**VRChat 世界收藏浏览器** — 自动读取本地 VRCX 客户端收藏，通过 VRChat 公开 API 获取实时数据与封面图。

## 功能

- 🔗 **自动读取 VRCX 数据库** — 无需手动导入，直接读取 %APPDATA%/VRCX/VRCX.sqlite3
- 📊 **实时数据** — 通过 VRChat 公开 API 获取世界热度、收藏数、访问量
- 🖼 **封面下载** — 从 VRChat CDN 自动下载世界封面图并本地缓存
- 📂 **分组展示** — 按 VRCX 收藏分组归类，支持多个收藏夹
- 🌐 **零依赖前端** — 纯静态 HTML，无 JavaScript 加载状态，文字即时渲染

## 快速开始

`ash
cd server
npm install
npm start
# → http://localhost:3456
`

首次启动会自动读取 VRCX 数据并拉取 VRChat API，等待几秒后刷新页面即可。

点击页面顶部 **🔄 点击刷新数据** 可随时重新同步。

## 架构

`
vrcmaps/
├── server/
│   ├── index.js       # Express 服务器（单文件，包含全部逻辑）
│   ├── package.json
│   └── public/
│       └── covers/    # 封面图缓存目录
└── .gitignore
`

## 工作原理

1. 服务器启动 → 读取本机 VRCX.sqlite3 的 avorite_world 和 cache_world 表
2. 对每个世界调用 VRChat 公开 API（无需登录）
3. 下载封面图到 public/covers/
4. 生成静态 HTML 页面，按分组展示

## 依赖

- Node.js + Express
- sql.js（SQLite WASM，零原生编译）
- VRChat 公开 API（api.vrchat.cloud）
- 本地需安装 VRCX 客户端

## 相关

- [VRCX](https://github.com/vrcx-team/VRCX) — VRChat 伴侣应用
- [VRChat API 文档](https://vrchat.community/reference/get-world)
