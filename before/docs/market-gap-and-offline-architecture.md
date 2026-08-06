# 市场功能差距与离线架构

## 1. 调研口径

本次对标资料复核时间为 2026-08-04。选择成熟平台的目的不是复制页面，而是识别农业生产系统已经被验证的数据闭环。厂商披露的客户收益只能作为产品假设，不作为本项目的收益承诺。

| 产品 | 已验证优势 | 对本项目的启示 |
| --- | --- | --- |
| farmOS | Asset-Log-Quantity 通用模型、地图、任务、库存和开放 API | 计划与实绩应共享农事记录模型，未来日期记录可直接成为待办 |
| LiteFarm | 作物计划自动生成任务、收支归集、有机认证导出和天气提醒 | 小型农场需要低学习成本的“计划-任务-成本-报表”闭环 |
| AgriWebb | 畜群、轮牧、离线记录、照片/GPS 任务和审计合规 | 现场异常必须有责任人、处置、复查和可审计结果，不能止于确认 |
| Climate FieldView | 农机采集、田间巡查点、卫星影像、变量处方和投入产出对比 | 地块需升级为多季、多图层 GIS 底座，巡查问题要绑定位置和照片 |
| John Deere Operations Center | 作业计划下发、设备遥测、远程诊断、进度和合作方授权 | 首页应优先显示故障、逾期和数据缺口，而不是静态指标 |
| Cropwise | 遥感、NDVI 分区、天气/病害模型、开放 API 和农艺 AI | 模型应展示依据与适用范围，并先生成待人工确认的任务草稿 |

公开采用情况显示这些能力已跨区域落地：LiteFarm 官网披露 10,000+ 用户、7,500+ 农场和 160+ 国家；AgriWebb 官网披露 17,000+ 生产者；Cropwise 2025 年官方披露覆盖 70+ 百万公顷和 30+ 国家。采用规模证明产品成熟度，但不能直接证明某一功能会在本项目产生同等收益。

主要公开资料：

- farmOS：https://farmos.org/ 和 https://docs.farmos.org/guide/
- LiteFarm：https://www.litefarm.org/the-app 和 https://github.com/LiteFarmOrg/LiteFarm
- AgriWebb：https://www.agriwebb.com/solutions/
- Climate FieldView：https://climate.com/fieldview/
- John Deere Operations Center：https://www.deere.ca/en/technology-products/precision-ag-technology/data-management/operations-center/
- Cropwise Open Platform：https://open-platform.cropwise.com/

## 2. 功能基准

### 2.1 高价值且适合近期实现

| 能力 | 最小可用范围 | 标杆交互 |
| --- | --- | --- |
| 农场空间台账 | 组织、农场、地块、种植区和设施层级；GeoJSON 导入导出 | farmOS/Cropwise 从地图地块进入当季任务、投入和观察 |
| 生产周期与农事日志 | 作物、品种、季节、播种、投入、巡田和收获；计划与实绩共用模型 | farmOS 未来日期加待办状态即成为计划 |
| 任务协同 | 负责人、截止时间、优先级、状态、位置、备注和验收 | LiteFarm 将未分派和逾期任务作为首页关注项 |
| 巡田问题闭环 | 地块、类别、风险、负责人、处理结果、复查和关闭 | FieldView 固定巡田点；AgriWebb 照片/GPS 任务 |
| 投入品与库存 | 采购、领用、退料、盘点、批次、有效期和地块成本归集 | 施用记录保存时自动扣库存，不要求二次维护 |
| 收获销售与基础利润 | 收获数量、收入、费用和作物季归属 | LiteFarm 从净利润下钻到作物收入与费用类别 |
| 天气风险提醒 | 逐小时雨量、风、湿度及霜冻/高温/降雨阈值 | 天气卡先给行动信号，再展开逐小时数据 |
| 角色分享与审计 | 农场主、管理员、农艺师、工人、只读及操作历史 | Deere 按组织/地块授权合作方，而非共享全部数据 |
| 报表与数据携带 | 作业、投入、收获、库存和问题 PDF/CSV；GeoJSON/KML | LiteFarm 允许选择记录与附件后生成认证材料包 |

### 2.2 高价值但实现复杂

| 能力 | 复杂点 | 参考平台 |
| --- | --- | --- |
| 真正离线优先 | 本地数据库、附件队列、增量同步、权限撤销和冲突解决 | AgriWebb、FieldView Drive |
| 机械与作业遥测 | 多厂牌协议、轨迹去重、弱网、异常数据和机手隐私 | Deere JDLink、FieldView |
| 遥感与长势分区 | 云量、影像频率、作物基线、区域适配和误报解释 | FieldView、Cropwise |
| 可变投入处方 | 农艺约束、机具格式、法规和责任风险 | FieldView、Cropwise |
| 病害和产量模型 | 本地训练/验证、置信区间、模型版本和数据漂移 | Cropwise |
| 传感器自动告警 | 协议、时序数据、断连、校准、告警抑制和维护责任 | farmOS Sensor |
| 开放 API 与连接器 | 统一标识、单位目录、幂等、授权、版本和数据血缘 | farmOS JSON:API、Cropwise Open Platform |
| 农艺 AI 助手 | 来源、地块上下文、法规、可解释性和人工确认 | Cropwise AI |

遥感、变量处方、农机无线下发和 AI 识病属于高价值但高责任能力。在没有本地样本、硬件协议和农艺验证前，不应只做一个看似完整但无法验收的界面。

## 3. 本轮已落地

| 对标闭环 | 本轮实现 | 验收结果 |
| --- | --- | --- |
| AgriWebb/FieldView 现场问题处置 | 巡田问题支持类别、风险、地块、发现人、负责人、处理、复查、退回和关闭 | API 四阶段流转和 Vue 生产构建通过 |
| LiteFarm 的库存成本底座 | 采购入库、生产领用、退料、盘点调整；余额与流水同事务写入，支持地块归属 | 冒烟测试库存由 1260 变为 1272，流水为 +12 |
| Deere 的异常关注入口 | 顶部通知聚合设备告警、逾期任务、未关闭问题和低库存；服务状态来自 `/health` | 渲染器构建通过，30 秒健康轮询 |
| 可审计的问题反馈 | Electron 单例纠错窗口按需打开；工单含编号、类别、优先级、位置、期望和解决说明 | 冒烟测试生成 `CR-2026-0001` 并完成解决 |
| 真实任务统计 | 近七日任务趋势按任务创建和完成时间聚合 | NestJS 构建通过 |
| 农业经营主数据 | 经营主体、农场、地块三级归属，停用主体前校验启用农场，跨层级错绑被拒绝 | 未知农场返回 `404`，错绑合同和文书返回 `409` |
| 计划到实绩闭环 | 种植季、生产计划、农事实绩采用受控状态机，登记实绩自动完成关联计划 | 端到端冒烟验证通过 |
| 采收销售追溯 | 采收自动生成批次号和追溯码，质检合格后方可销售，限制超售并记录收款交付 | 重复质检、超售和状态回退均返回 `409` |
| 合同与合规档案 | 土地、采购、销售、保险、检测等合同文书，支持到期风险和 Electron 受控附件 | Vue/Nest 构建及附件 IPC 语法检查通过 |
| 数据可靠性 | 版本化迁移、不可变审计日志、`PRAGMA integrity_check` 和 `VACUUM INTO` 本地备份 | 完整性为 `ok`，冒烟备份 90,112 字节 |

## 4. 当前差距

| 能力域 | 当前状态 | 缺少的关键能力 | 优先级 |
| --- | --- | --- | --- |
| 离线运行 | Electron、本地 API、SQLite/WAL、完整性检查和手动备份可离线运行 | 自动备份、恢复演练、数据库加密和无人值守服务 | P0 |
| 移动同步 | 服务端支持任务幂等回放和目标服务器校验 | APP outbox、增量游标、版本冲突页和照片断点续传 | P0 |
| 本地 Wi-Fi | API 监听局域网并显示地址 | APP 运行时配对、二维码、mDNS、一次性配对码和局域网 TLS | P0 |
| 蓝牙 | Electron 支持扫描、授权和 BLE GATT 连接 | 厂商 UUID、数据帧解析、设备注册和断线重连 | P0，依赖硬件协议 |
| GIS | 仅保存文字位置 | 地块边界、种植季、巡田点、轨迹、遥感图层和处方区 | P0 |
| 追溯 | 已有种植季、计划实绩、采收质检、销售去向和追溯码 | 采购批次、任务领料自动扣减、仓储库位和召回闭环 | P0 |
| 问题闭环 | 支持巡田问题处理、复查和关闭 | 照片、地图点位、超时升级和效果评价 | P0 |
| 告警闭环 | 可查看、确认并从通知入口定位 | 告警转问题/任务、处置、复查和关闭 | P0 |
| 权限安全 | 随机安装凭据由 Windows 安全存储保护，关键业务写入不可变审计日志 | 用户表、密码哈希、RBAC、设备独立凭证和密钥轮换 | P0 |
| 经营核算 | 库存流水可关联地块 | 作物季的人工、农资、设备、燃油、外包成本和利润 | P1 |
| 开放集成 | REST API 和 HTTP 终端 | Webhook、MQTT、Modbus、CAN/ISOBUS、GeoJSON 和农机格式 | P1 |
| 智能分析 | 基础统计和阈值告警 | 长势异常、病虫识别、产量预测、灌溉建议及模型评估 | P2 |

## 5. 推荐离线架构

```text
Electron 农场桌面端
  ├─ Vue 3 管理界面
  ├─ 纠错中心 BrowserWindow
  ├─ Electron 主进程（进程监管、凭据、窗口与 BLE）
  └─ NestJS 本地 API（0.0.0.0:3100）
       ├─ SQLite/WAL 本地数据库
       ├─ 局域网 REST API
       └─ 遥测历史
            ▲
             └─ 局域网 APP/采集终端
```

Electron 所在电脑是农场局域网的权威节点。互联网断开不影响桌面端和本地 API；同一 Wi-Fi 下的客户端可通过“连接中心”显示的地址对接。SQLite 数据文件位于 Electron 的 `userData/data/agriculture.db`，独立开发服务器默认使用 `before/server/data/agriculture.db`。

## 6. 同步与数据规则

1. 客户端写操作生成全局唯一 `operationId`，服务端记录回执，重复提交不重复执行。
2. 遥测采用追加写，以 `(deviceId, sampleId)` 去重，同时保存 `sampledAt` 和 `receivedAt`。
3. 任务和地块使用 `baseVersion` 做乐观锁，冲突返回 `409` 并进入人工处理。
4. 库存以入库、领用、退料和调整流水求和，不直接同步库存余额。
5. 问题和纠错状态使用受控转换，关闭记录不能被旧客户端静默覆盖。
6. 客户端先推送 outbox，再按单调游标拉取变化，不能用设备时间决定最终顺序。

## 7. 蓝牙边界

当前桌面端使用 Electron Web Bluetooth 完成用户触发的 BLE 扫描、授权和 GATT 连接，适合现场配置或短时读取。正式采集必须取得具体硬件的 Service UUID、Characteristic UUID、字节序、量纲、校验和、分包、重传、设备身份和采样时间协议。

Windows 全天候后台 BLE 网关需要在指定硬件上验证驱动、休眠唤醒和长连接稳定性。大量固定传感器优先使用 Wi-Fi、以太网、LoRa 网关或支持本地缓存的采集终端。

## 8. 后续实施顺序

1. P0 数据可靠性：自动备份/恢复演练、用户与角色、数据库加密、APP 配对和 outbox。
2. P0 生产追溯：投入品批次、任务领料自动扣减、仓储库位、召回和追溯报告导出。
3. P0 空间作业：GeoJSON 地块边界、巡田点、照片附件、轨迹和问题地图。
4. P1 经营核算：人工、农资、设备、外包成本按地块和作物季归集，输出净收益。
5. P1 设备协议：取得指定硬件 GATT/MQTT/Modbus 协议后实现注册、解析、去重和重连。
6. P2 农艺模型：先接天气和遥感影像，再用本地样本验证病害、灌溉和产量模型。

## 9. 上线门槛

- 断公网连续运行 72 小时，桌面、手机和终端核心操作无丢失。
- 强制结束进程和 Windows 重启后，SQLite `integrity_check` 通过。
- APP 离线任务重复同步不产生重复结果，冲突有明确提示。
- Windows 防火墙只允许 Private 网络和 LocalSubnet 访问 API 端口。
- 每日自动备份，并在另一台电脑完成真实恢复验证。
- 扩展多用户身份、设备独立凭证和审计日志。
- 对指定 BLE 设备完成断线、休眠、低电量和异常数据测试。

架构参考：

- Electron 进程模型：https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron Web Bluetooth：https://www.electronjs.org/docs/latest/tutorial/devices
- Electron 安全：https://www.electronjs.org/docs/latest/tutorial/security
- Node SQLite：https://nodejs.org/api/sqlite.html
- SQLite WAL：https://www.sqlite.org/wal.html
- SQLite 备份：https://www.sqlite.org/backup.html
- uni-app BLE：https://uniapp.dcloud.net.cn/api/system/ble.html
