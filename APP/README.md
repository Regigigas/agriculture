# 农业巡田 APP

基于 uni-app、Vue 3 和 Pinia 的农业巡田移动端，支持 H5 与 App 构建。

## 功能

- 账号登录、token 持久化与 401 自动返回登录页
- 首页天气环境、今日概览、待办任务和异常设备
- 任务状态筛选与确认完工
- 地块作物、面积、生长阶段和状态展示
- Three.js 地块三维巡查、四个预设角度、触摸/鼠标旋转与缩放
- 采购单创建、状态筛选、到货确认和库存联动
- Electron 本地/线上服务切换、私聊、群聊和消息重试
- 管理员添加固定账号、账号信息与服务端注销
- 线上检测更新、默认/自定义更新地址与 Android 本地更新

## 接口

线上 API 缺省地址可通过 `VITE_API_BASE_URL` 覆盖。运行后还可在登录页或“我的/服务连接”切换 Electron 本地服务并保存局域网地址：

```js
VITE_API_BASE_URL=http://localhost:3100/api
VITE_APP_UPDATE_URL=http://localhost:3100/api/app-update/latest
```

已接入以下接口：

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/users`（仅管理员）
- `GET /auth/users`
- `GET/POST/PATCH /chat/*`
- `GET /dashboard`
- `GET /fields`
- `GET /tasks`
- `GET /devices`
- `PATCH /tasks/:id/status`
- `GET /inventory`
- `GET /purchases`
- `POST /purchases`
- `PATCH /purchases/:id/receive`
- `GET /app-update/latest`

更新地址返回 `code: 0` 表示无更新、`code: 101` 表示 WGT 更新、`code: 102` 表示整包更新。更新数据放在 `data` 中，包含 `type`、`versionName`、`versionCode`、`downloadUrl`，可选 `title`、`description`、`size`、`sha256`、`mandatory`、`publishedAt` 和 `storeUrl`。WGT 必须提供 `sha256`，Android 会在安装前校验安装包大小和摘要。Android 本地更新支持 APK/WGT；iOS 整包更新应配置 `storeUrl` 并跳转应用商店。公网更新地址必须使用 HTTPS，HTTP 仅允许本机或局域网调试地址。

请求自动附加 `Authorization: Bearer <token>`。登录接口可直接返回 `{ token, user }`，也可放在 `data` 字段中；列表接口可直接返回数组，也可使用对应的 `fields`、`tasks`、`devices` 或 `items` 字段。

## 运行

项目未包含已安装依赖。安装依赖后可执行：

```bash
npm run dev:h5
npm test
npm run build:h5
npm run build:app
```

也可以在 HBuilderX 中打开 `APP` 目录，运行到浏览器或 App 基座。

## localhost 说明

- H5 在同一台电脑浏览器中运行时，`http://localhost:3100` 指向本机后端。
- Android 模拟器中，`localhost` 指向模拟器自身。Android Studio 默认模拟器通常需要改为 `http://10.0.2.2:3100/api`。
- iOS 模拟器通常可以访问电脑的 `localhost`，具体取决于模拟器和网络配置。
- 真机中，`localhost` 指向手机自身，必须把 API 地址改为电脑在同一局域网内的 IP，例如 `http://192.168.1.20:3100/api`，并确保后端监听 `0.0.0.0`、系统防火墙放行 3100 端口。
- H5 跨域访问需要后端允许当前前端来源；App 端还需确认 Android 明文 HTTP 和平台网络安全策略。生产环境应使用 HTTPS。

`npm run build:app` 生成 App 运行资源，不等同于已签名 APK/IPA。可在 HBuilderX 5.15 中使用真机运行或配置平台证书后打包安装包。
