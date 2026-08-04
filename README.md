# 丰域农业管理系统

面向规模化农场的多端农业生产管理项目。系统借鉴参考养老项目的驾驶舱、任务闭环、物联网告警与移动作业模式，并按农业场景实现地块档案、作物生产、农资库存和田间环境监测。

## 项目结构

```text
agriculture/
├─ after/     NestJS REST API
├─ before/    Vue 3 + Pinia + Naive UI 管理端
├─ terminal/  C++17 物联网数据采集终端
└─ APP/       uni-app + Pinia 巡田移动端
```

## 核心功能

- 农业驾驶舱：地块面积、任务、设备、告警、作物占比和近七日趋势
- 生产任务：新建农事任务、责任人分配、进度筛选和完工闭环
- 农田档案：面积、位置、作物、生产状态、墒情和种植周期
- 设备监控：环境遥测、在线状态、维护状态和告警确认
- 农资库存：肥料、植保和灌溉耗材台账及低库存提示
- 移动巡田：任务处理、地块状态、异常设备和个人工作台
- C++ 终端：跨平台模拟采集温湿度、墒情和光照并持续上报

## 快速启动

环境要求：Node.js 20+、npm 10+。C++ 终端需要 CMake 3.16+ 和支持 C++17 的编译器。

```bash
cd after
npm install
npm run start:dev
```

另开终端启动管理端：

```bash
cd before
npm install
npm run dev
```

默认地址：

- 后端 API：`http://localhost:3100/api`
- 管理端：`http://localhost:5173`
- 健康检查：`http://localhost:3100/api/health`

演示账号：`admin` / `admin123`。

## 巡田 APP

`APP` 可使用 HBuilderX 5.15 直接打开并运行，也可使用 CLI：

```bash
cd APP
npm install
npm run dev:h5
```

真机不能使用电脑的 `localhost`，请通过 `VITE_API_BASE_URL` 配置电脑局域网地址。具体说明见 `APP/README.md`。

## C++ 采集终端

```bash
cmake -S terminal -B terminal/build
cmake --build terminal/build --config Release
terminal/build/agri_terminal --once
```

Windows 多配置生成器的可执行文件通常位于 `terminal/build/Release/`。默认设备 `DEV-001` 已在后端注册；终端每 5 秒上报一次，也可通过 `--host`、`--port`、`--device`、`--interval` 和 `--once` 调整。

## 数据说明

当前后端使用进程内演示数据，便于无需数据库直接联调；重启服务后新增地块、任务状态和告警确认会恢复。生产部署时应将 `AgricultureService` 的内存集合替换为持久化仓储，并接入正式身份认证、审计日志和 HTTPS 设备密钥管理。
