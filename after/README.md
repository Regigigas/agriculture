# Agriculture Demo API

基于 NestJS 的农业管理演示后端。所有数据保存在进程内存中，服务重启后会恢复本项目内置的田块、任务、设备、告警和库存种子数据。

## 运行

要求 Node.js 20 或更高版本。

```bash
npm install
npm run start:dev
```

默认监听 `http://localhost:3100`，REST 前缀为 `/api`。环境变量可参考 `.env.example`；本项目不额外加载 `.env` 文件，生产启动时请由运行环境注入变量。

```bash
npm run build
npm run start
```

## 认证

演示账号为 `admin` / `admin123`：

```http
POST /api/auth/login
Content-Type: application/json

{"username":"admin","password":"admin123"}
```

登录响应包含固定令牌 `agri-demo-token`。除健康检查、登录和设备遥测外，请携带：

```http
Authorization: Bearer agri-demo-token
```

设备遥测不使用用户令牌，需携带 `x-device-key: agri-terminal-2026`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康状态 |
| POST | `/api/auth/login` | 演示账号登录 |
| GET | `/api/dashboard` | 指标、环境、作物分布、任务趋势和动态 |
| GET / POST | `/api/fields` | 查询或新建田块 |
| GET / POST | `/api/tasks` | 查询或新建任务 |
| PATCH | `/api/tasks/:id/status` | 更新任务状态 |
| GET | `/api/devices` | 查询设备及最新遥测 |
| POST | `/api/devices/:id/telemetry` | 设备上报遥测 |
| GET | `/api/alerts` | 查询告警 |
| PATCH | `/api/alerts/:id/ack` | 确认告警 |
| GET | `/api/inventory` | 查询库存 |

新建田块需要 `name`、`crop`、`area`、`location`、`status`、`plantedAt`、`expectedHarvestAt`、`soilMoisture`、`manager`。新建任务需要 `title`、`fieldId`、`assignee`、`dueDate`、`priority`，可选 `description`。状态更新请求体为 `{ "status": "pending|in_progress|completed" }`。遥测请求体包含数值型 `temperature`、`humidity`、`soilMoisture`、`light`。
