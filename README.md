# vrcmaps

VRChat world browser — auto-reads local VRCX favorites, fetches live data and covers from VRChat public API.
VRChat 世界浏览器 —— 自动读取本机 VRCX 收藏夹，通过 VRChat 公开 API 获取实时数据与封面。

## Quick Start / 快速开始

Download from [Releases](https://github.com/sodakitten/vrcmaps/releases):
从 [Releases](https://github.com/sodakitten/vrcmaps/releases) 下载：

- `vrcmaps-zh.exe` — Chinese UI / 中文界面
- `vrcmaps-en.exe` — English UI / 英文界面

Or run from source / 或从源码运行：

```bash
python vrcmaps.py          # Chinese / 中文（默认）
python vrcmaps.py --lang en  # English / 英文
```

Browser opens automatically at http://127.0.0.1:3456
浏览器自动打开 http://127.0.0.1:3456

### Build exe / 打包

```bash
pip install pyinstaller
pyinstaller --onefile --name vrcmaps --add-data "covers;covers" --console vrcmaps.py
```

## Features / 功能

- Auto-reads VRCX database / 自动读取 VRCX 数据库
- Fetches live world stats from VRChat API (no login) / 通过 VRChat 公开 API 获取实时数据（无需登录）
- Downloads world cover images / 下载世界封面图
- Groups worlds by VRCX favorite categories / 按 VRCX 收藏分组归类
- Chinese & English UI / 中英文界面
- Keyboard shortcuts: R = refresh, Q = quit / 快捷键：R = 刷新, Q = 退出

## Requirements / 依赖

- Python 3.9+ (stdlib only / 仅标准库)
- VRCX client installed / 安装 VRCX 客户端

## See also / 相关

- [VRCX](https://github.com/vrcx-team/VRCX)
- [VRChat API docs](https://vrchat.community/reference/get-world)
