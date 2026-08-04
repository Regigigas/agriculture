# 丰域农业管理平台

基于 Vite、Vue 3、TypeScript、Pinia、Vue Router、Naive UI、Lucide 和 ECharts 的农业生产管理后台。

## 启动

```bash
npm install
npm run dev
```

默认 API 地址为 `http://localhost:3100/api`。如需修改，复制 `.env.example` 为 `.env`，设置：

```env
VITE_API_BASE_URL=http://localhost:3100/api
```

演示账号：`admin` / `admin123`。登录凭据由 `POST /auth/login` 校验，前端不会绕过接口进行本地认证。

## 接口约定

请求支持接口直接返回业务数据，或返回 `{ "data": ... }` 包装；失败响应优先显示 `message` 或 `error`。登录成功响应需包含 `token`，可选包含 `user`。后续请求自动携带 `Authorization: Bearer <token>`。

## 构建

```bash
npm run build
```

生产构建会将 Vue 核心、Naive UI、ECharts、Lucide 和其他第三方依赖拆分为独立的本地 `vendor-*` 文件。入口 HTML 由 Vite 自动写入依赖和模块预加载关系，不依赖外部 CDN，部署时必须完整发布 `dist` 目录。
