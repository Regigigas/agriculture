# 丰域农业管理系统

面向规模化农场的多端农业生产管理项目。系统借鉴参考养老项目的驾驶舱、任务闭环、物联网告警与移动作业模式，并按农业场景实现地块档案、作物生产、农资库存和田间环境监测。

## 项目结构

```text
agriculture/
├─ after/     NestJS 线上增量同步与 REST API
├─ before/    Electron + Vue 3 桌面管理端与 NestJS + SQLite 本地服务
├─ terminal/  C++17 物联网数据采集终端
└─ APP/       uni-app + Pinia 巡田移动端
```

## 核心功能

- 农业驾驶舱：地块面积、任务、设备、告警、作物占比和近七日趋势
- 经营组织：经营主体、农场、地块三级归属和启停约束
- 生产周期：种植季、生产计划、农事实绩、执行成本和受控状态流转
- 生产任务：新建农事任务、责任人分配、进度筛选和完工闭环
- 农田档案：面积、位置、作物、生产状态、墒情和种植周期
- 设备监控：环境遥测、在线状态、维护状态和告警确认
- 巡田问题：异常登记、责任分派、处理、复查和关闭
- 农资库存：采购入库、生产领用、退料、盘点、变动流水和低库存提示
- 采收追溯：采收批次、质检、销售、交付收款和全链追溯码
- 合规经营：合同、证照文书、受控附件、到期提醒和跨层级归属校验
- 运营安全：经营风险聚合、不可变审计日志、SQLite 完整性检查、本地备份与数据文件同步
- 工作沟通：Electron 本地或线上账号、管理员受控开户、私聊、群聊、未读和消息重试
- 三维巡查：Electron 与 uni-app App 均支持 Three.js 多角度地块查看、拖拽旋转和缩放
- 纠错中心：按需打开独立桌面窗口、自动记录功能位置、问题处理和解决留痕
- 移动巡田：任务处理、地块状态、异常设备和个人工作台
- C++ 终端：跨平台模拟采集温湿度、墒情和光照并持续上报

## 快速启动

环境要求：Node.js 22+、npm 10+。C++ 终端需要 CMake 3.16+ 和支持 C++17 的编译器。

```bash
cd before
npm install
npm --prefix server install
npm run dev
```

Electron 会自动启动本地 API 和管理界面。仅在浏览器中联调时，分别运行：

```bash
npm --prefix before run dev:server
npm run dev:web
```

浏览器联调默认地址：

- 后端 API：`http://localhost:3100/api`
- 管理端：`http://localhost:5173`
- 健康检查：`http://localhost:3100/api/health`

演示账号：`admin` / `admin123`。

## 离线桌面端

桌面端位于 `before/`，是当前功能最完整的本地入口。它会自动启动 NestJS 本地 API，使用 SQLite/WAL 持久化业务、账号和聊天数据，并提供数据文件、局域网、BLE 和云端增量同步入口。断网时写入进入本地 outbox，联网后按云端游标同步；并发版本冲突在“连接中心”选择保留本机或采用云端。纠错中心不会在登录后自动弹出，需要时可通过顶部纠错图标或页面错误入口打开。

```bash
npm --prefix before install
npm --prefix before/server install
npm run dev:desktop
```

生成 Windows 安装包：

```bash
npm run build:desktop
```

详细说明和市场对标见 `before/README.md` 与 `before/docs/market-gap-and-offline-architecture.md`。

## 巡田 APP

`APP` 可使用 HBuilderX 5.15 直接打开并运行，也可使用 CLI：

```bash
cd APP
npm install
npm run dev:h5
```

App 内可切换“Electron 本地”与“线上服务”。真机连接本地服务时不能使用电脑的 `localhost`，应填写电脑局域网地址。具体说明见 `APP/README.md`。

## C++ 采集终端

```bash
cmake -S terminal -B terminal/build
cmake --build terminal/build --config Release
terminal/build/agri_terminal --once
```

Windows 多配置生成器的可执行文件通常位于 `terminal/build/Release/`。默认设备 `DEV-001` 已在后端注册；终端每 5 秒上报一次，也可通过 `--host`、`--port`、`--device`、`--interval` 和 `--once` 调整。

## 同步与数据说明

`after/` 使用 SQLite/WAL 持久化云端同步实体、变更游标和幂等回执；原有 REST 演示业务数据仍用于 Web 与 APP 联调。`before/server/` 持久化经营主体、农场、地块、种植季、计划实绩、采收销售、合同文书、任务问题、库存、纠错和遥测数据，并提供审计、完整性检查、手动备份、SQLite 数据文件合并和云端增量同步。合同与文书只同步结构化元数据，本机附件路径不会上传或被外部数据文件覆盖。

当前 beta 面向单实例云服务。正式多用户部署仍需将云端同步库迁移至 PostgreSQL，并补齐租户隔离、用户角色、令牌轮换、对象存储、自动备份与恢复演练和公网 TLS。

同步验收：

```bash
cd before
npm run verify:sync
npm run verify:local-sync
```
