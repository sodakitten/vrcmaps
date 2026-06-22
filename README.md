# vrcmaps

VRChat 世界收藏浏览器 —— 自动读取本地 VRCX 客户端收藏，通过 VRChat 公开 API 获取实时数据与封面。

## 功能

- 自动读取 VRCX 数据库（%APPDATA%/VRCX/VRCX.sqlite3），无需手动导入
- 通过 VRChat 公开 API 获取世界实时热度、收藏数、访问量（无需登录）
- 从 VRChat CDN 下载世界封面图并本地缓存
- 按 VRCX 收藏分组归类展示，支持多个收藏夹
- 纯静态 HTML 页面，文字即时渲染

## 快速开始

```bash
cd server
npm install
npm start
```

浏览器打开 http://localhost:3456

首次启动会自动读取 VRCX 数据并调用 VRChat API，等待数秒后刷新页面即可。点击页面顶部刷新链接可随时重新同步。

## 工作原理

1. 服务器启动，读取本机 VRCX.sqlite3 的 favorite_world 和 cache_world 表
2. 对每个世界调用 VRChat 公开 API（GET /api/1/worlds/{id}）
3. 下载封面图到 public/covers/
4. 生成静态 HTML 页面，按分组展示

## 依赖

- Node.js + Express
- sql.js（SQLite WASM，无需原生编译）
- VRChat 公开 API（api.vrchat.cloud）
- 本地需安装 VRCX 客户端

## 相关项目

- [VRCX](https://github.com/vrcx-team/VRCX) —— VRChat 伴侣应用
- [VRChat API 文档](https://vrchat.community/reference/get-world)
