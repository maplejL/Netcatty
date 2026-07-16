---
doc_type: feature-design
feature: 2026-07-10-host-notes-visibility
requirement:
status: approved
summary: 在 Vault 列表/卡片与运维首页直接展示主机备注摘要，并继续复用 HostDetails 备注编辑入口
tags: [vault, host-notes, ops-home]
---

# 主机备注强化（可见性）

## 0. 术语约定

| 术语 | 定义 | 防冲突结论 |
|------|------|------------|
| **主机备注** (`Host.notes`) | 主机实体上的可选 Markdown 文本字段，存硬件/项目/角色等非秘密说明 | 已有字段；本 feature 不新增 schema |
| **Vault Notes / 笔记** (`notes` 导航、`NotesManager`) | Vault 侧栏独立笔记系统（可关联主机，但是另一套实体） | **不是**本 feature 范围；不把两套笔记合并 |
| **备注摘要** (`notesExcerpt`) | 从 `Host.notes` 抽取的纯文本短摘要，供列表/卡片/运维首页展示 | 新增 domain 辅助名；避免与 AI `notesSummary`（笔记条数文案）混淆 |
| **备注指示器** (`HostNotesIndicator`) | 有备注时显示小图标 + Hover 预览 | 已有组件；本 feature 扩展其旁的可见摘要，不替换 |

术语 grep：`Host.notes` / `HostNotesIndicator` / `HostNotesEditor` 已存在；`notesExcerpt` 代码库中未见冲突。

## 1. 决策与约束

### 需求摘要

| 项 | 内容 |
|----|------|
| **做什么** | 让有 `Host.notes` 的主机在 **Vault 网格/列表/树** 与 **运维首页** 的置顶/最近磁贴上，除图标外还能看到一行纯文本摘要；详情面板继续用现有 `HostNotesEditor` 编辑 |
| **为谁** | 机海运维用户：扫一眼主机卡就能想起「这是哪台」 |
| **成功标准** | ① 有备注的主机在上述入口可见摘要；② 无备注时布局不留空白行；③ 摘要不渲染 Markdown 控件（纯文本）；④ 点编辑仍进 HostDetails 备注区 |
| **明确不做** | 不合并 Vault Notes；不改 AI 上下文 / 终端标题；不自动从 FinalShell description 导入；不新增持久化字段；不做备注全文搜索 UI 重构（搜索已能匹配 `notes`） |

### 现状（证据）

- 编辑：`components/host/HostNotesEditor.tsx` + `HostDetailsPanel` 开关式备注区
- 列表：`HostNotesIndicator` 仅图标 + Hover 预览（`VaultHostListSection` / `HostTreeView`）
- 运维首页：`VaultOpsHome` 的 `HostQuickTile` **完全不展示** notes
- 搜索：`useVaultHostCollections` 已用 `host.notes` 参与匹配

### 挂载点清单

| 挂载位置 | 文件 / key | 动作 |
|----------|------------|------|
| Domain 摘要 helper | `domain/hostNotes.ts`（新建） | 新增 |
| Domain 单测 | `domain/hostNotes.test.ts`（新建） | 新增 |
| 列表指示器旁摘要 | `components/host/HostNotesIndicator.tsx` 或新建 `HostNotesSummary.tsx` | 修改/新增 |
| Vault 主机卡/列表 | `components/vault/VaultHostListSection.tsx` | 修改（4 处 notes 展示） |
| 树形主机行 | `components/HostTreeView.tsx` | 修改 |
| 运维首页磁贴 | `components/vault/VaultOpsHome.tsx` | 修改 `HostQuickTile` |
| i18n（如需 aria/空态） | `application/i18n/locales/*/vault.ts` | 按需追加 |
| 文档 backlog | `.codestable/roadmap/highlights-backlog.md` | 完成后标 done |

卸载：删除 domain helper + 回退上述组件展示即可；**不改** `Host` schema / storage key。

### 复杂度档位

本 feature 走 **项目内部工具** 默认档位，无偏离：

L2 + functions/modules + reasonable + team + active + logged + testable。

### 关键决策

| 决策 | 选择 | 理由 | 被拒方案 |
|------|------|------|----------|
| 数据源 | 仅 `Host.notes` | 已有编辑与存储 | 新建 notes 表 / 同步 Vault Notes |
| 展示形态 | 纯文本一行截断 + 保留图标 Hover 全文 | 列表扫读快；Markdown 在窄卡里难控 | 卡片内嵌 Markdown 渲染 |
| 摘要算法 | domain 纯函数：去 Markdown 标记 → 折叠空白 → 截断 | 可单测；UI 不散落 trim 逻辑 | 各组件各自 `slice` |
| 截断长度 | 默认 **48 字符**（中英文按 code unit 计，末尾 `…`） | 网格副标题一行够用 | 多行展开 / 无限长 |
| 运维首页 | 磁贴副标题区：`user@host` 下增加摘要行（有 notes 时） | 对齐用户选定的 vault_and_ops 范围 | 只做列表不做首页 |
| 详情编辑 | **不改** 现有编辑器与开关默认逻辑 | 已有预览/编辑；强化重点是可见性 | 强制默认展开备注区 |

### 主流程概述

1. 用户在 HostDetails 写入 Markdown 备注并保存（现有路径）。
2. Vault 列表/网格/树渲染主机时：`hasNotes` → 显示指示器 + 一行 `notesExcerpt`。
3. 运维首页置顶/最近磁贴：同样显示摘要行。
4. Hover 指示器仍可看 Markdown 预览；点编辑进详情。
5. 无备注：不渲染摘要行与指示器（与现状一致）。

异常 / 边界：

- 仅空白 / 仅 Markdown 装饰符 → 视为无备注摘要，不显示空行。
- 超长备注 → 截断；全文仍在 Hover / 详情。
- 备注含密码提示：沿用现有 help 文案，本 feature 不加扫描器。

## 2. 接口契约

### Domain：`summarizeHostNotes`

```ts
// 来源：domain/hostNotes.ts summarizeHostNotes
// 输入 → 输出
summarizeHostNotes("## 生产\n- 8C16G\n**客户A**")
// → "生产 8C16G 客户A"  （示例：去标记后单行，再按 maxLength 截断）

summarizeHostNotes("   ")
// → null

summarizeHostNotes(undefined)
// → null

summarizeHostNotes(longMarkdown, { maxLength: 48 })
// → "……最多 48 字符………"  （超出时末尾省略号，总展示长度 ≤ maxLength+1 的约定在测试中写死）
```

约束：

- 纯函数，无 I/O。
- **不**删除用户原文；只生成展示用字符串。
- 去标记策略：best-effort（标题 `#`、粗体 `*`/`_`、行内 code、链接 `[text](url)` 取 text、列表前缀）；不追求完整 CommonMark。

### UI：摘要展示

```tsx
// 来源：VaultHostListSection / HostTreeView / VaultOpsHome HostQuickTile
// Props 概念：notes?: string
// 渲染：
// - summarizeHostNotes(notes) 为 null → 不渲染摘要行
// - 否则一行 text-[11px] text-muted-foreground truncate，title=完整摘要（可选）
// HostNotesIndicator 保留在 label 旁
```

### 状态归属

| 状态 | 归属 |
|------|------|
| `Host.notes` 原文 | Vault 主机状态（`useVaultState` / 已有） |
| 摘要字符串 | 渲染时派生，不入 store |

### 关键交互

- 点击主机卡仍连接；点击编辑仍开详情（不变）。
- 指示器 `stopPropagation` 保持，避免 Hover 触发连接。

## 3. 实现提示

### 目标文件状况

- `VaultHostListSection.tsx` 已很长：摘要展示 **复用小组件**，避免再复制 4 段 JSX。
- `VaultOpsHome.tsx` 健康，直接扩展 `HostQuickTile`。
- 新建 `domain/hostNotes.ts`，不往 `opsHome.ts` 塞展示逻辑。

### 改动计划

1. **新建** `domain/hostNotes.ts` + `domain/hostNotes.test.ts` — `summarizeHostNotes`。
2. **新建或扩展** `components/host/HostNotesSummaryLine.tsx`（或等价）— 统一一行摘要 UI。
3. **修改** `VaultHostListSection.tsx` — 网格/列表/置顶/最近等主机行接入摘要。
4. **修改** `HostTreeView.tsx` — 树节点主机行接入。
5. **修改** `VaultOpsHome.tsx` — `HostQuickTile` 接入。
6. **按需** i18n（若 aria-label 需本地化现有英文 `"Host notes"` 可顺手修，非必须）。
7. **更新** `highlights-backlog.md`：主机备注强化 → done。

### 实现风险与约束

- 列表项大量 Markdown 预览已在 Hover：摘要用纯文本，避免每卡挂 Streamdown。
- `VaultHostListSection` 多处重复结构：改漏一处会导致「有的视图有摘要、有的没有」。
- ASCII-only 代码/注释；用户备注内容本身可为中文。

### 推进顺序

1. Domain `summarizeHostNotes` + 单测（空/Markdown/截断）。
2. 共享摘要展示小组件。
3. Vault 列表/网格接入。
4. 树形视图接入。
5. 运维首页磁贴接入。
6. 跑相关单测 + 手测扫一眼三种视图。

每步退出信号：对应测试或 UI 路径可见摘要。

### 测试设计

| 功能点 | 约束 | 方式 | 用例骨架 |
|--------|------|------|----------|
| 摘要抽取 | 去标记 + 折叠空白 | unit `hostNotes.test.ts` | 标题/列表/链接/纯文本 |
| 空备注 | 返回 null | unit | `""` / 空白 / undefined |
| 截断 | maxLength 生效 | unit | 超长字符串末尾 `…` |
| 运维首页展示 | 有 notes 时磁贴多一行 | 组件级或轻量源码/渲染测（可选） | 有/无 notes 两分支 |
| 回归 | 无备注布局不变 | 手测 / 可选 snapshot | 无 notes 主机 |

## 4. 与项目级架构文档的关系

- `.codestable/architecture/` 当前为空；本 feature **无**系统级架构文档变更。
- 名词 `Host.notes` 已在 domain 模型；摘要 helper 属 domain 纯逻辑扩展。
- 跨层纪律：展示派生不写回 `Host`；与 `AGENTS.md` 三层边界一致。

---

## 会话与布局恢复（并行结论，非本 design 实现范围）

代码与文档已具备完整 Session Restore（默认开启、断开占位、手动重连、pagehide 落盘）。  
`docs/session-restore.md` + 54 项相关单测通过。  
**不作为新开发 feature**；仅在 backlog 标 `done`，README 可后续补一句「设置 → 会话恢复」。
