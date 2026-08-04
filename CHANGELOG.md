# Changelog

## 1.0.0-beta.1 - 2026-08-04

- 将完整管理前端作为 Electron Windows 桌面应用交付，保留 SQLite/WAL 离线能力。
- 新增 Electron outbox、云端单调游标、事件幂等、实体 revision 和双向增量同步。
- 新增同步冲突记录，以及采用本机或云端版本的人工处理流程。
- 将云端地址与令牌接入 Windows 安全存储，附件路径保持本机私有。
- 新增线上同步持久化 API、端到端同步验收脚本和 GitHub Windows 预发行工作流。
