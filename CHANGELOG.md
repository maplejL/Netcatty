# Changelog

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
