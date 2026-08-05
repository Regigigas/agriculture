# 丰域农业 Electron 桌面端

该目录是独立桌面工程，不修改或依赖仓库外部的 `before/`、`after/`、`APP/` 和 `terminal/` 源码。

## 目录

```text
desktop/
├─ main.cjs       Electron 主进程、服务监管、凭据和 BLE
├─ preload.cjs    受限预加载桥
├─ renderer/      Vue 3 管理界面
├─ server/        NestJS + SQLite 本地 API
└─ docs/          市场差距和离线架构分析
```

## 安装

```bash
cd desktop
npm install
npm --prefix server install
npm --prefix renderer install
```

Electron 43 会在第一次开发或打包时按需下载运行时，`npm run dev/build/pack` 已自动执行检查。网络受限环境可在运行命令前设置：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
```

## 开发与打包

```bash
npm run dev
npm run build
```

Windows 安装包输出到 `desktop/release/`。Electron 启动后自动运行本地 API；SQLite 数据保存在系统 `userData/data/agriculture.db`，备份保存在 `userData/data/backups/`，受控合同和文书附件保存在 `userData/documents/`，安装目录中不保存业务数据。纠错中心不会随登录自动弹出，需要时可通过顶部纠错图标或页面错误入口打开单例原生窗口。

“运营风险与数据安全”页面可以随时新建一致性数据库备份、打开备份目录、导出单份备份，或选择类似 `E:\Project\agriculture`、移动硬盘和共享盘的外部目录生成镜像备份。账号与聊天和业务数据位于同一份 `agriculture.db`，因此会一并进入快照。也可以选择 `.db`、`.sqlite` 或 `.sqlite3` 文件进行本地同步：Electron 使用 Node `node:sqlite` 先生成只读一致性快照，本地服务再执行完整性和结构版本检查、自动备份当前库，并按记录更新时间合并已知业务实体、遥测与审计数据。外部同步不导入其他电脑的账号、聊天、服务器标识、云端游标、冲突、操作回执和附件路径。

数据库恢复和外部文件同步要求管理员登录令牌、当前密码和指定确认短语。服务端签发的授权令牌五分钟过期且只能使用一次；恢复 IPC 会回到本地服务端消费授权，不能只跳过界面确认。

“工作沟通”使用 Electron 启动的本地 NestJS/SQLite 服务，不依赖公网后端。管理员可添加 `worker` 或 `admin` 固定账号，普通账号可登录局域网 App 并参与私聊和群聊，但不能添加账号。App 也可以切换到部署后的 `after/` 线上服务，接口契约保持一致。

## 云端增量同步

在“连接中心”填写已部署 `after/` 服务的 API 地址和 `DEMO_TOKEN`。地址必须使用 HTTPS，本机联调允许 `http://localhost`。令牌由 Electron `safeStorage` 加密保存，不写入业务 SQLite，也不会回传到渲染进程。

本地业务写入自动合并进入 outbox，每分钟尝试同步，也可手动执行。云端以事件 ID 幂等、以单调游标下发变更，并通过实体 revision 检测并发修改。冲突不会覆盖本地数据，可在连接中心选择采用云端或以当前云端 revision 重新上传本机版本。合同与文书附件仍保留在本机，仅同步不含 `filePath` 的结构化元数据。

本机登录账号为 `admin`，安装级随机密码由 Windows 安全存储保护并在桌面登录页自动填充。局域网 API 地址和采集终端密钥在“连接中心”查看。

当前桌面端已形成完整农业经营主线：经营主体与农场、地块档案、种植季、生产计划、农事实绩、采收质检、销售交付和批次追溯。系统还包括巡田问题闭环、农资采购/领用/退料/盘点、合同与合规文书、受控附件、运营风险、不可变审计、数据库完整性检查、手动备份和独立纠错中心。顶部通知、驾驶舱经营指标和侧栏服务状态均来自本地 API 实际数据。

市场功能差距与后续路线见 [`docs/market-gap-and-offline-architecture.md`](docs/market-gap-and-offline-architecture.md)。
