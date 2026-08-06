# 丰域农业桌面管理平台

`before` 是统一的桌面前端工程，包含 Electron 宿主、Vue 3 管理界面和 NestJS + SQLite 本地服务。桌面端支持离线运行、局域网与蓝牙接入、云端增量同步和 Windows 安装包发布。

## 目录

```text
before/
├─ main.cjs       Electron 主进程、服务监管、凭据和 BLE
├─ preload.cjs    受限预加载桥
├─ src/           Vue 3 渲染界面
├─ server/        NestJS + SQLite 本地 API
├─ scripts/       本地文件与云端增量同步验收脚本
├─ tests/         Playwright 视觉与跨端测试
├─ build/         桌面应用图标
└─ docs/          市场差距和离线架构分析
```

## 安装

```bash
npm install
npm --prefix server install
```

Electron 43 会在第一次开发或打包时按需下载运行时。网络受限时可先设置 `ELECTRON_MIRROR` 和 `ELECTRON_BUILDER_BINARIES_MIRROR`。

## 开发

启动完整 Electron 桌面端：

```bash
npm run dev
```

仅启动浏览器管理界面：

```bash
npm run dev:server
npm run dev:web
```

浏览器管理界面默认连接 `http://localhost:3100/api`。如需修改，可在 `.env` 中设置 `VITE_API_BASE_URL`。演示账号为 `admin` / `admin123`。

## 构建与测试

```bash
npm run build:web
npm run test:visual:all
npm run verify:sync
npm run verify:local-sync
npm run build
```

`build` 生成 Windows 安装包到 `before/release/`。Electron 启动后自动运行本地 API；SQLite 数据保存在系统 `userData/data/agriculture.db`，备份保存在 `userData/data/backups/`，受控附件保存在 `userData/documents/`，安装目录中不保存业务数据。

本地业务写入会进入 outbox，并可与部署后的 `after/` 服务执行增量同步。数据库恢复和外部文件同步要求管理员授权；合同与文书只同步结构化元数据，不上传本机附件路径。

市场功能差距与后续路线见 [`docs/market-gap-and-offline-architecture.md`](docs/market-gap-and-offline-architecture.md)。
