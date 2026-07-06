# Attention

本文件是 CodeStable 技能启动必读的项目注意事项入口。所有 CodeStable 子技能开始工作前必须读取它。

## 报告语言

CodeStable 所有落盘产出的正文用**中文**：plan / design、plan review / design-review、code review、QA、验收、issue（report / analysis / fix-note）、refactor、roadmap、goal、沉淀（compound）等所有人读报告都用中文表达。机器状态（YAML / JSON / `state.yaml` / frontmatter 字段）保持机读格式不翻译。如需改默认语言，改这一节。

## 项目简介

**Netcatty** — Electron + React 桌面应用（SSH 管理、终端、SFTP 浏览器），双运行时：主进程 `electron/`（CommonJS `.cjs`）+ 渲染进程（TypeScript/ESM）。更完整的架构与 AI harness 细节见仓库根目录 `AGENTS.md` / `CLAUDE.md`。

## 项目碎片知识

<!-- cs-note managed: 用 cs-note 维护，新条目按下面分节追加 -->

### 编译与构建

- `npm install` — 安装依赖
- `npm run build` — 构建 renderer
- `npm run pack` / `pack:mac` / `pack:win` / `pack:linux` — 打包当前或指定平台
- `npm run generate:capability-tools` — 从 capability catalog 生成 `cattyToolSpecs.json` / `globalAgentToolSpecs.json`；**CI 会校验 JSON 漂移**，改 catalog 后须重新生成

### 运行与本地起服务

- `npm run dev` — **先跑 lint**，再并发启动 Vite + Electron

### 测试

- `npm test` — 跑全部测试
- `node --test --import tsx path/to/file.test.ts` — 单文件测试（domain 助手、hook、bridge 旁 `*.test.cjs` 等）
- `npm run lint` / `npm run lint:fix` — ESLint

### 命令与脚本陷阱

- 改 `electron/capabilities/catalog/` 或 `toolSurfaces.cjs` 后必须 `npm run generate:capability-tools`，否则 CI 失败
- AI turn 停止**只能**走 `stopAgentTurn()`（UI、`/stop`、MCP）；**禁止**在 hook 里加平行 abort 路径
- Catty compaction：`prepareTurnContext` / `compactCattyMessages`（pre-turn + 413）；step 级只用 `prepareStepContext`，不做 LLM summarize

### 路径与目录约定

**三层架构（严格遵守边界）**

| 层 | 目录 | 约束 |
|----|------|------|
| Domain | `domain/` | 纯逻辑，无副作用 |
| Application | `application/state/` | React hook 持有状态与持久化边界（`useVaultState` / `useSessionState` / `useSettingsState`） |
| Infrastructure | `infrastructure/` | 外部边界：`persistence/`、`services/`、`config/` |
| UI | `components/`、`App.tsx` | 仅展示与视图胶水；**业务逻辑不进组件** |

**主进程**

- 入口 `electron/main.cjs` → `main/registerBridges.cjs`
- `electron/bridges/` — 每域一个 `.cjs` bridge，IPC 经 `ipcMain`；测试与 bridge 同目录 `*.test.cjs`
- `electron/preload.cjs` — 经 `contextBridge` 暴露 `window.electron`（生成面在 `preload/api.cjs`）
- `electron/cli/netcatty-tool-cli.cjs` — **内部集成面**，非公开 API

**IPC**

- 渲染进程只调 `window.electron.*`（preload API）→ IPC → bridge；**组件内禁止直接 `ipcRenderer`**

**存储与临时文件**

- 所有 localStorage 读写经 `infrastructure/persistence/localStorageAdapter.ts`；键名集中在 `infrastructure/config/storageKeys.ts`，禁止散落 `localStorage` 调用
- 临时文件必须用 `tempDirBridge.getTempFilePath(fileName)`，**禁止**直接 `os.tmpdir()`

**路径别名**

- `@/` → 仓库根（`vite.config.ts`、`tsconfig.json`）

**Aside 侧栏面板（VaultView 子页）**

- 统一用 `components/ui/aside-panel.tsx`（`AsidePanel` / `AsidePanelContent` / `AsidePanelFooter`）
- `title` 已传时**不要**在 `AsidePanel` 内再套 `AsidePanelHeader`（会重复 header）
- `absolute right-0 top-0 bottom-0`，父容器须 `relative`；在区块根渲染，**不要**放进可滚动子容器

**扩展新能力时的落点**

1. 纯逻辑 → `domain/`
2. 有状态行为 → `application/state/` hook
3. 外部集成 → `infrastructure/services/` 或 `persistence/` adapter
4. UI → 只消费 hook 输出/回调，不绕过 state hook 做持久化

**AI Agent Harness**（`infrastructure/ai/harness/`）

- Turn 编排：`AgentRuntime`；`useAIChatStreaming` 只管 UI，委托 `runTurn` / `stopTurn`
- Capability 单一事实源：`electron/capabilities/catalog/` + `electron/capabilities/codegen/toolSurfaces.cjs`
- Agent kind：`sidebar`（Catty 侧栏，含 `harness.*` 本地工具）vs `global`（共享 RPC，无 sidebar-only harness）
- `harness.*` 在 renderer 本地执行（`executeLocalCattyCapability`），**不上 MCP/CLI**
- Vault bridge **永不**返回 `password` / `privateKey`
- 大工具输出走 `ToolOutputStore` + `tool_output_read`；同 chat session 跨 turn 保留，删 session 时清空

### 环境变量与凭证

- 一方集成路径（CLI、本地 TCP bridge）由 Netcatty launcher 提供环境，例如 `NETCATTY_TOOL_CLI_DISCOVERY_FILE`
- Vault / 密钥相关 bridge 不得向 agent 泄露密码或私钥明文

### 其他

**写操作审批策略**

- Confirm 模式：SFTP 写/传输、`portforward_start`、`host_notes_set` 须用户批准
- Observer 模式：阻断一切写操作

**测试与 schema**

- 优先为 domain 助手（如 `workspace.ts`、`host.ts`）和 application hook 写单测
- 改 storage key 或 schema 须提供迁移或向后兼容

**编码规约**

- Domain 保持纯函数；副作用只在 application/infrastructure
- 组件禁止直接 `fetch`/网络调用，先加 service adapter
- 组件保持 dumb；prop 过多时在 hook 里派生 view model
- 除非已有文件内容要求，否则保持 **ASCII-only**

**Review 边界**

- `electron/cli/*`、`netcatty-tool-cli`、CLI discovery 文件、本地 TCP bridge 视为**内部集成面**；默认不按公开 API / 第三方兼容 / 手动启动场景审查，除非任务明确要求
