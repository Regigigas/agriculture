# 农业巡田 APP

基于 uni-app、Vue 3 和 Pinia 的农业巡田移动端，支持 H5 与 App 构建。

## 功能

- 账号登录、token 持久化与 401 自动返回登录页
- 首页天气环境、今日概览、待办任务和异常设备
- 任务状态筛选与确认完工
- 地块作物、面积、生长阶段和状态展示
- 账号信息与退出登录

## 接口

API 地址集中配置在 `src/utils/request.js`，可通过 `VITE_API_BASE_URL` 覆盖：

```js
VITE_API_BASE_URL=http://localhost:3100/api
```

已接入以下接口：

- `POST /auth/login`
- `GET /dashboard`
- `GET /fields`
- `GET /tasks`
- `GET /devices`
- `PATCH /tasks/:id/status`

请求自动附加 `Authorization: Bearer <token>`。登录接口可直接返回 `{ token, user }`，也可放在 `data` 字段中；列表接口可直接返回数组，也可使用对应的 `fields`、`tasks`、`devices` 或 `items` 字段。

## 运行

项目未包含已安装依赖。安装依赖后可执行：

```bash
npm run dev:h5
npm run build:h5
```

也可以在 HBuilderX 中打开 `APP` 目录，运行到浏览器或 App 基座。

## localhost 说明

- H5 在同一台电脑浏览器中运行时，`http://localhost:3100` 指向本机后端。
- Android 模拟器中，`localhost` 指向模拟器自身。Android Studio 默认模拟器通常需要改为 `http://10.0.2.2:3100/api`。
- iOS 模拟器通常可以访问电脑的 `localhost`，具体取决于模拟器和网络配置。
- 真机中，`localhost` 指向手机自身，必须把 API 地址改为电脑在同一局域网内的 IP，例如 `http://192.168.1.20:3100/api`，并确保后端监听 `0.0.0.0`、系统防火墙放行 3100 端口。
- H5 跨域访问需要后端允许当前前端来源；App 端还需确认 Android 明文 HTTP 和平台网络安全策略。生产环境应使用 HTTPS。

修改地址时设置 `VITE_API_BASE_URL` 即可，默认仍为 `http://localhost:3100/api`。
