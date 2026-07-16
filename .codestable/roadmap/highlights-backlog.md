# 真亮点 Backlog（fork 差异化）

> 按优先级逐个实现。状态：`todo` | `doing` | `done` | `skip` | `doc`（仅文档/叙事，无需开发）

来源：2026-07-06 讨论「值得做的真亮点」+ 后续实现与取舍。

---

## 总表（全部条目）

### P0 — 运维闭环 / 导入治理

| 状态 | 项 | 说明 |
|------|-----|------|
| done | **批量运维：Vault 多选 → 工作区** | 默认广播；4 台自动 2×2；错峰挂载 |
| done | **批量运维：批量命令 + 结果汇总** | Vault / Compose 栏入口；`execCommand` 并行 + 按机汇总 |
| skip | ~~FinalShell 再导入合并凭证~~ | 不做；现有单次导入已够用 |
| skip | ~~FinalShell 导入预览（diff / 解密结果）~~ | 不做（与合并一并放弃） |
| done | README「上游核心能力」 | `README.zh-CN.md` 上游 vs fork 对照 |

### P1 — 主机管理 / 导入扩展

| 状态 | 项 | 说明 |
|------|-----|------|
| skip | ~~IP 分组可配置~~ | 不做；维持前三段默认 |
| skip | ~~批量连通性检测~~ | 不做 |
| skip | ~~导入预览~~（通用） | 2026-07-10 决定：导入/导出类亮点一律不做；现有 FinalShell 导入够用 |
| skip | ~~更多导入源~~ | 同上；不扩展 Navicat/ansible/网段生成 |
| skip | ~~FinalShell description → host notes~~ | 同上；不继续抠导入细节 |

### P2 — 导出与工具链对称

| 状态 | 项 | 说明 |
|------|-----|------|
| skip | ~~导出 ssh_config~~ | 2026-07-10 决定：导入/导出类不做 |
| skip | ~~导出 Ansible inventory~~ | 同上 |
| skip | ~~Webhook / 简单 API~~ | 与导出/集成对称一并放弃；偏企业且非当前重点 |

### P3 — 工作台效率

| 状态 | 项 | 说明 |
|------|-----|------|
| done | **运维首页 / 智能入口** | Vault「首页」视图；Pin/Recent/网段/继续会话；新用户默认首页 |
| done | **会话与布局恢复** | 上游/现码已完整：默认开启、断开占位、手动重连、pagehide 落盘；见 `docs/session-restore.md`。2026-07-10 核验 54 测通过，**不重做**；不做自动重连 |
| done | **主机备注强化** | 列表/树/运维首页展示 `Host.notes` 纯文本摘要；domain `summarizeHostNotes`；见 `2026-07-10-host-notes-visibility` |

### P4 — AI 差异化（上游能力之上）

| 状态 | 项 | 说明 |
|------|-----|------|
| todo | **分组/标签级 Agent 任务** | 对一组主机执行审批下的批量 Agent 操作 |
| todo | **自然语言网段运维** | 如「172.168.5 网段哪些不通」— 与 IP 分组联动 |

### doc — 叙事亮点（README / 宣传，不必新开发）

| 状态 | 项 | 说明 |
|------|-----|------|
| done | 上游核心能力文档化 | 见 README「上游核心能力」 |
| doc | **四合一叙事** | 主机库 + 终端 + 文件 + AI 同一上下文 |
| doc | **能力目录叙事** | UI / AI / MCP / CLI 一套 capability catalog |
| doc | **机海运维叙事** | 导入、分组、树形、批量 — 对准 FinalShell 用户群 |
| doc | **复杂网络叙事** | 跳板、端口转发、连接复用一条链 |
| doc | **可审批 AI 运维** | 写操作确认模式 |

### 已有优势（代码已有，宣传用，不必重做）

| 能力 | 说明 |
|------|------|
| 托管 `ssh_config` | 与系统 SSH 配置协同 |
| 跳板链 `hostChain` | 多级跳转可视化 |
| 分组默认配置 | 组级继承认证/终端行为 |
| 连接日志 | 连过谁、何时、结果 |
| Snippets + 连接脚本 | 登录后自动执行 |
| 端口转发 + AI 上下文 | 隧道与会话、Catty 联动 |
| ZMODEM / 串口 YModem | 设备场景 |
| 内置编辑器 + SFTP 标签 | 远程改文件少切工具 |
| MCP / CLI 能力面 | 与 Catty 共用 catalog |
| safeStorage 加密 | 凭据字段加密 |
| FinalShell 导入 + IPv4 树分组 | 本 fork 已实现 |

---

## 状态汇总（2026-07-10）

| 状态 | 数量 | 说明 |
|------|------|------|
| **todo** | **2** | P4 分组 Agent、自然语言网段 |
| done | 7+ | 批量运维×2、运维首页、会话恢复、主机备注可见性、README 等 |
| skip | 10 | 含导入/导出类 + 更早 skip |
| doc | 5 | 叙事条目 |

**决策（2026-07-10）：导入/导出类亮点全部不做**（通用导入预览、更多导入源、FinalShell 备注映射、ssh_config/Ansible 导出、Webhook）。

**决策（2026-07-10）：会话与布局恢复已存在，不重做。** 用户偏好（恢复后手动重连、正常退出与崩溃均恢复）与现实现一致；现码会话类型范围比「仅 SSH」更宽（含 local/serial 等占位），**不收窄为 SSH-only**。

**当前优先：**

1. 分组/标签级 Agent 任务、自然语言网段运维（P4）

---

## 附录：批量运维实现备忘

### 4 窗口

支持，无硬上限。4 台开工作区 → 自动 2×2；瓶颈在 WebGL / 性能。

### 关键文件

- `domain/workspace.ts` — 布局树、`buildWorkspaceRootFromSessionIds`
- `application/state/useSessionState.ts` — `createWorkspaceWithHosts`、错峰挂载
- `components/VaultView.tsx` — 多选「连接 / 工作区 / 批量命令」
- `components/batch/BatchExecDialog.tsx` — 批量命令 UI
- `components/terminal/useTerminalEffects.ts` — 多窗格握手期 refit 推迟
