# 丰域农业线上同步 API

基于 NestJS 的农业管理后端。`POST /api/sync/exchange` 使用 SQLite/WAL 持久化 Electron 客户端上传的实体、单调变更游标和幂等回执；原有 REST 演示接口仍使用进程内数据，便于 Web 与 APP 联调。

## 运行

要求 Node.js 22 或更高版本。

```bash
npm install
npm run start:dev
```

默认监听 `http://localhost:3100`，REST 前缀为 `/api`。环境变量可参考 `.env.example`；本项目不额外加载 `.env` 文件，生产启动时请由运行环境注入变量。云端数据库默认位于当前目录的 `data/cloud-sync.db`，可通过 `AGRI_CLOUD_DATA_DIR` 指定持久卷。

```bash
npm run build
npm run start
```

## 认证

缺省开发账号为 `admin` / `admin123`。**生产环境必须通过 `ADMIN_PASSWORD` 设置强密码**；该缺省值只为兼容本地开发：

```http
POST /api/auth/login
Content-Type: application/json

{"username":"admin","password":"admin123"}
```

正常登录响应包含随机会话令牌；如配置 `DEMO_TOKEN`，该固定令牌仍映射到管理员账号。除健康检查、登录、按开关开放的注册和设备遥测外，请携带：

```http
Authorization: Bearer agri-demo-token
```

设备遥测不使用用户令牌，需携带 `x-device-key: agri-terminal-2026`。

公共注册默认关闭，只有 `ALLOW_PUBLIC_REGISTRATION=true` 时 `POST /api/auth/register` 才可用。管理员可通过 `POST /api/auth/users` 创建固定账号，请求体包含 `name`、`username`、`password`、`role`，其中 `role` 仅支持 `admin` 或 `worker`；普通账号调用会返回 403。`GET /api/auth/users` 继续对所有已登录账号开放，供聊天联系人列表使用。

管理员可调用 `POST /api/auth/operation-authorizations` 为高危操作申请 5 分钟有效的一次性令牌。请求体包含当前密码、操作名及对应确认短语；令牌只以 SHA-256 哈希保存在进程内，服务重启后失效。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康状态 |
| GET | `/api/app-update/latest` | APP 公开更新元数据 |
| POST | `/api/auth/login` | 演示账号登录 |
| POST | `/api/auth/logout` | 注销并撤销当前会话令牌 |
| GET / POST | `/api/auth/users` | 查询联系人 / 管理员创建固定账号 |
| POST | `/api/auth/operation-authorizations` | 管理员申请高危操作一次性令牌 |
| GET | `/api/dashboard` | 指标、环境、作物分布、任务趋势和动态 |
| GET / POST | `/api/fields` | 查询或新建田块 |
| GET / POST | `/api/tasks` | 查询或新建任务 |
| PATCH | `/api/tasks/:id/status` | 更新任务状态 |
| GET | `/api/devices` | 查询设备及最新遥测 |
| POST | `/api/devices/:id/telemetry` | 设备上报遥测 |
| GET | `/api/alerts` | 查询告警 |
| PATCH | `/api/alerts/:id/ack` | 确认告警 |
| GET | `/api/inventory` | 查询库存 |
| GET / POST | `/api/purchases` | 查询或新建采购单 |
| PATCH | `/api/purchases/:id/receive` | 确认采购到货并增加库存 |
| POST | `/api/sync/exchange` | 推送 outbox 事件并按游标拉取云端增量 |

新建田块需要 `name`、`crop`、`area`、`location`、`status`、`plantedAt`、`expectedHarvestAt`、`soilMoisture`、`manager`。新建任务需要 `title`、`fieldId`、`assignee`、`dueDate`、`priority`，可选 `description`。新建采购单需要 `inventoryItemId`、`quantity`、`unitPrice`、`supplier`、`expectedAt`、`buyer`，可选 `notes`；到货请求体为 `{ "operator": "经办人" }`，重复确认不会再次增加库存。状态更新请求体为 `{ "status": "pending|in_progress|completed" }`。遥测请求体包含数值型 `temperature`、`humidity`、`soilMoisture`、`light`。

APP 更新元数据通过 `APP_UPDATE_*` 环境变量配置，完整示例见 `.env.example`。可使用 `APP_UPDATE_ANDROID_*`、`APP_UPDATE_IOS_*` 覆盖对应平台配置；未配置版本或安装包地址时，接口返回无可用更新。发布 WGT 时必须配置 SHA-256，并确保资源版本号高于客户端当前 WGT 版本。
