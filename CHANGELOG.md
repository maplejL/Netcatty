# Changelog

## [0.1.3] - 2026-07-21

本 fork 第四版。开发主线仍为 `feature/ops_ai_enhancements`（**不合并到 `main`**）。

### 本 fork 修复 / 增强

#### 终端体验
- Ctrl+C 中断时始终滚到底（不受「按键滚动」开关影响）
- 会话恢复默认带回终端 CWD（OSC 7 + `cd` 注入）
- 工作标签可放在顶部 / 左侧 / 右侧（外观设置）

#### AI / 外部 Agent
- Cursor：模型旁 **Fast** 开关 + **推理程度**（effort）芯片；`send({ model })` 带上选中参数
- 修复 Cursor 未传 `fast` 时默认走 Fast 变体（显式 `fast=false`，避免用量变成 `*-low-fast`）
- Codex：Fast → `minimal`；推理程度 `low/medium/high/xhigh`（slash 编码）
- CodeBuddy / WorkBuddy：Fast → 关闭思考；思考档位 `adaptive` / `enabled`

### 构建
- 快速正式包（仅 NSIS）：`npm run pack:win-x64:release`
- 完整包（NSIS + portable + zip）：`npm run pack:win-x64:release:full`
- 打完并上传更新资产：`npm run release:win-x64`（可选 `-Full` 脚本：`release:win-x64:full`）
- 本地热更 asar：`npm run pack:asar`

---

## [0.1.2] - 2026-07-21

本 fork 第三版。开发主线仍为 `feature/ops_ai_enhancements`（**不合并到 `main`**）。

### 本 fork 修复 / 增强

#### 日常效率
- 断开连接 / Ctrl+D 后保留终端标签（可回看滚动缓冲、再连）
- SFTP 路径可插入终端（中键 / 右键，带 shell 安全引号）
- SFTP 追随终端 CWD：多会话同主机时路径绑定更准确

#### 终端体验
- 多行粘贴可确认并编辑（设置项默认开启）
- 补全菜单避开当前输入行，不再挡住光标

#### SFTP / 编辑器
- 远程文件「编辑」打开为独立顶层编辑器标签
- 编辑器标签右键「与当前编辑器对照」左右分栏
- Vault 多选主机 → 批量 SFTP 上传同一批本地文件

#### AI / Cursor
- Cursor turn 失败时展示更具体诊断（缺 Key、code/status 等）
- Cursor SDK 调用 `run.wait()`，并避免 System32 作为本地 cwd
- 更新检测与发布源指向本 fork（maplejL/Netcatty）

### 构建
- 快速正式包（仅 NSIS）：`npm run pack:win-x64:release`
- 完整包（NSIS + portable + zip）：`npm run pack:win-x64:release:full`
- 打完并上传更新资产：`npm run release:win-x64`（可选 `-Full` 脚本：`release:win-x64:full`）
- 本地热更 asar：`npm run pack:asar`

---

## [0.1.1] - 2026-07-17

本 fork 第二版。开发主线仍为 `feature/ops_ai_enhancements`（**不合并到 `main`**）。  
相对 [0.1.0] 主要包含：上游低冲突 cherry-pick 一批稳定性/终端/SSH 修复，以及本 fork 的 AI 视觉、侧栏白屏、MCP exec 等修复。

### 本 fork 修复 / 增强

#### AI 视觉与侧栏稳定性
- 聊天贴图优先走模型视觉能力，禁止为看图去远端装 OCR / 拉 base64
- 上下文压缩保留 `image/*` 像素，避免「附件被省略」后模型看不见图
- OpenAI 兼容网关：在请求出网前把 `image_url.url` 裸 base64 规范为 `data:image/...;base64,...`（修复 400 invalid-argument）
- AI 侧栏错误改为软 Retry（不再 `location.reload` 整页刷新）
- 持久化/加载时剥离大图 base64，避免 localStorage 膨胀导致白屏卡死
- session/message 规范化更严，脏数据不易打崩侧栏

#### MCP / 终端执行
- 补全 `closingTerminalSessions` 声明：修复 partial cherry-pick 后 `exec` / `job-start` 报 `is not defined`（SFTP 仍正常）
- SSH：partial cherry-pick 后 `systemAuthAgent is not defined` → 使用已有 `connectOpts.agent`

### 上游 cherry-pick（摘要）
自 v0.1.0 起约 130+ 条低冲突上游提交，包括但不限于：
- 终端：OSC7/CWD、复制选区规范化、重连/休眠取消、脚本 overlay、紧凑工具栏与 speed-dial
- SSH：password-only 主机不回落默认密钥、跳板/严格 agent 相关修复、连接时延测量
- UI：系统管理面板确认框、主题对比度、macOS Dock 图标与侧栏 tooltip
- 脚本：停止/重跑/日志清理与 bastion 发送可靠性
- CI / 打包：Linux glibc 兼容与部分构建脚本修正

> 完整列表见 `git log v0.1.0..v0.1.1`。部分上游能力（如完整 session-close 守卫）仍未全量合入，仅合了可独立落地的补丁。

### 已知限制
- 与 0.1.0 相同的批量命令跳板、WebGL 偶发花屏、外部 Agent 依赖本机 CLI 等限制仍在
- 历史会话中已存的大图预览可能因 base64 剥离而不可再显示（文字记录保留）

### 构建
- 正式安装包：`npm run pack:win-x64`（Windows x64 NSIS / portable / zip）
- 本地热更 asar：`npm run pack:asar`

---

## [0.1.0] - 2026-07-16

本仓库基于上游 [binaricat/Netcatty](https://github.com/binaricat/Netcatty) 的 **fork 首发版本**（GPL-3.0）。  
安装包与上游官方 Release **不是同一条发版线**。

### 本 fork 新增 / 增强

#### Vault 与批量运维
- FinalShell 主机导入（密码解密、可选私钥进 Keychain、IPv4 前三段自动分组）
- Vault 树形视图：无分组 IPv4 主机按网段虚拟归类
- 运维首页：继续会话、置顶/最近、按网段开工作区 / 批量命令
- 多选开工作区：≥2 台分屏（4 台 2×2）、默认广播；**仅 1 台则普通连接**
- 批量命令：并行 `execCommand`，按主机汇总输出与退出码（v1 仅 SSH 直连）
- 多机会话错峰挂载；工作区非焦点窗格可挂起 WebGL

#### 主机备注与会话
- Vault 列表 / 树 / 运维首页展示主机备注纯文本摘要（Markdown 去噪）
- 会话与布局恢复相关路径打通

#### AI / 外部 Agent
- WorkBuddy 托管外部 Agent；CodeBuddy 族 CLI 路径发现与 skills 模式
- 同 scope 切换 Agent 保留消息历史，并清洗跨 Agent 回放上下文
- 外部 Agent 模型列表与 SDK/CLI 实际可用同步：强制刷新、按 ID 去重、刷新中 loading、空列表不缓存
- 侧栏打开稳定性：draft/session 规范化，避免附件/消息字段异常导致崩溃

#### 终端效率与可观测
- FinalShell 风格**命令历史浮层**（可配置快捷键；Enter/双击只填入终端，不自动执行）
- 快捷键支持单独修饰键录制，并做冲突检测
- **终端命令计时调试**（设置 → 系统，默认关）：输入→发往后端→首包→首帧→结束，支持按主机/关键字筛选

#### SFTP 与窗口
- SFTP 追随 / 定位终端目录：路径规范化、会话绑定、后端探测、loading 状态
- 主窗口默认最大化；窗口化约为显示器工作区 75% 并居中

#### 性能与稳定性
- 默认 scrollback 3000；大输出时跳过高亮、写队列 flood 让出主线程
- WebGL 多窗格乱码：atlas 隔离补丁、失焦挂起、context loss 重建、前台恢复清图集
- `prebuild` / `pack:asar` 强制应用 atlas 隔离补丁
- Windows 托盘右键原生菜单 + UTF-8，避免「用应用打开链接」与乱码

#### 文档与工程
- 中文 README 维护：上游能力 + 本 fork 增强 + `pack:asar` 增量部署说明
- `package.json` 版本：`0.1.0`

### 已知限制
- 批量命令 v1 不支持跳板链（`hostChain`）
- 多窗格极端场景下 WebGL 仍可能偶发花屏，可改用 DOM 渲染
- 外部 Agent 依赖本机 CLI/API Key 与路径发现

### 构建
- 正式安装包：`npm run pack` / `npm run pack:win-x64`
- 本地热更 asar：`npm run pack:asar`（不升级 Electron 壳与原生模块）

---

## [Unreleased 上游遗留草稿] - 2026-03-11

以下条目来自历史草稿，记录自动更新相关设计，**未作为本 fork 0.1.0 的验收范围**。

### 功能
- 修复自动更新 IPC 事件仅发送到单个窗口的问题，改为广播所有窗口（主窗口 + 设置窗口均可收到）
- 统一手动检查更新与自动更新的状态机，消除三套并行状态
- 手动"检查更新"通过 GitHub API 检测版本，发现更新后异步触发 electron-updater 下载
- 设置窗口中点击"检查更新"后，下载进度可实时反映在 UI 中
- 应用启动后 5 秒自动触发 `electron-updater` 检查更新，无需用户手动点击
- 发现新版本后自动开始下载（`autoDownload=true`）
- 下载完成后弹出持久 toast 通知，用户点击"立即重启"即可安装
- 下载失败时弹出错误 toast，提供"打开 Releases"降级入口
- Settings > System 进度条实时展示自动下载进度，由 `useUpdateCheck` 统一驱动
- Linux deb/rpm/snap 等不支持 electron-updater 的平台自动跳过，保持原有 GitHub API 通知行为

### 设计原理
- `broadcastToAllWindows` 替换 `getSenderWindow` 单点发送，保证所有窗口都能收到 IPC 事件
- `manualCheckStatus` 字段追踪手动检查 UI 状态（idle/checking/available/up-to-date/error），与 `autoDownloadStatus` 在 UI 层按优先级渲染
- `SettingsSystemTab` 不再持有本地 update state，单向接收 `useUpdateCheck` 统一数据
- 将原有两套独立系统（GitHub API 通知 + electron-updater 手动下载）合并为统一状态机：`useUpdateCheck` 作为唯一事实来源，同时驱动 `App.tsx` toast 和 `SettingsSystemTab` 进度条
- 全局持久化 IPC 监听器在 `autoUpdateBridge.init()` 时一次性注册，避免每次手动下载请求重复注册/清理监听器
- `autoInstallOnAppQuit=false`，不做静默安装，由用户主动触发重启

### 接口变更（SettingsSystemTabProps）
- 移除：`autoDownloadStatus`、`downloadPercent`
- 新增：`updateState`（完整 UpdateState）、`checkNow`、`installUpdate`、`openReleasePage`

### 注意事项
- `checkNow` 语义：使用 GitHub API（`performCheck`）检测是否有新版本，若发现更新且 electron-updater 尚未开始下载，则异步触发 `bridge.checkForUpdate()` 启动自动下载流程
- 此功能仅对打包后的应用（Windows NSIS、macOS dmg/zip、Linux AppImage）生效，dev 模式需配合 `forceDevUpdateConfig=true` + `dev-app-update.yml` 测试（见 `.gitignore`）
- `hasUpdate` 旧 toast 在 `autoDownloadStatus !== 'idle'` 时自动抑制，避免与新 toast 重复
