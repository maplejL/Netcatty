<p align="center">
  <img src="public/icon.png" alt="Netcatty" width="128" height="128">
</p>

<h1 align="center">Netcatty</h1>

<p align="center">
  <strong>定制维护版 · AI 驱动的 SSH 客户端、SFTP 与终端工作台</strong>
</p>

<p align="center">
  基于 <a href="https://github.com/binaricat/Netcatty">binaricat/Netcatty</a> 定制：完整继承上游 SSH 工作台能力，并针对日常运维增强 Vault 导入、IP 分组、批量操作与外部 AI Agent 集成。
</p>

<p align="center">
  <a href="#"><img alt="仓库" src="https://img.shields.io/badge/GitHub-本仓库-8B5CF6?style=for-the-badge&logo=github"></a>
  &nbsp;
  <a href="#"><img alt="平台" src="https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge&logo=electron"></a>
  &nbsp;
  <a href="LICENSE"><img alt="协议" src="https://img.shields.io/badge/协议-GPL--3.0-green?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="#快速开始">
    <img src="https://img.shields.io/badge/开始使用-克隆与构建-success?style=for-the-badge&logo=electron" alt="开始使用">
  </a>
</p>

---

## 关于本仓库

| 项目 | 说明 |
|------|------|
| **本仓库** | 当前 GitHub 页面（顶部 **Code** 可复制克隆地址） |
| **上游项目** | [github.com/binaricat/Netcatty](https://github.com/binaricat/Netcatty) · [netcatty.app](https://netcatty.app) |
| **协议** | GPL-3.0（继承上游，修改部分同样开源） |
| **发行方式** | 本仓库**不跟随上游自动发版**；Windows x64 安装包见 [Releases](https://github.com/maplejL/Netcatty/releases)（当前 `v0.1.6`） |

上游 Netcatty 是功能完整的 SSH 工作台（官网 [netcatty.app](https://netcatty.app)）。**本仓库不删减上游能力**，仅在下方「本 fork 增强」一节叠加运维向功能。

| | 上游 Netcatty | 本 fork |
|---|---------------|---------|
| SSH / SFTP / 分屏 / Catty AI | ✅ 完整继承 | ✅ |
| 系统面板 GPU/NPU、系统 SSH Agent、External MCP、MoshCatty | ✅ 本版同步至上游 v1.1.79 | ✅ |
| 复制/分屏继承 CWD | ✅ 上游能力 | ✅ 补齐消费路径 |
| FinalShell 导入、IPv4 树分组 | — | ✅ |
| 运维首页、多选工作区 / 批量命令 | — | ✅ |
| 主机备注列表摘要、会话/布局恢复 | 部分上游能力 | ✅ 列表可见 + 恢复完善 |
| WorkBuddy 等外部 Agent、同会话切换 Agent | — | ✅ |
| 外部 Agent 模型列表与真实可用同步 | — | ✅ |
| 命令历史浮层、终端命令计时调试 | — | ✅ |
| SFTP 追随 / 定位终端目录 | 有基础能力 | ✅ 链路、sudo 提权跟随与 loading 加固 |
| Coding CLI 历史与运行阶段 | — | ✅ |
| 长时间 `tail` 输出性能默认策略 | 上游有流控 | ✅ 进一步默认收紧 |
| WebGL 多窗格乱码防护 | 上游有恢复 | ✅ atlas 隔离 + 丢失重建 |

---

## 本版更新（v0.1.6）

完整列表见 [CHANGELOG.md](./CHANGELOG.md) 与 [GitHub Release](https://github.com/maplejL/Netcatty/releases/tag/v0.1.6)。下一版发版时**整节替换**为本版要点。

本版干净同步上游至 **v1.1.79**，并补齐半成品 pick，避免白屏 / 终端无法加载。

- **系统**：System 面板 GPU/NPU（含昇腾 910B、PVE CT ZFS/bind 磁盘）
- **SSH**：系统 SSH Agent、可配置超时、MFA/EDR/Duo 提示
- **SFTP**：Connected 选择器展示当前终端主机并可复用会话；隐藏列、冲突框、递归删除
- **AI**：一键测试 Provider；External MCP（Codex / Claude / Cursor / Grok）
- **终端**：复制/分屏继承 CWD；恢复后跑启动命令；全屏应用右键菜单与备用屏幕补全
- **Mosh**：MoshCatty 纯二进制（无 Cygwin）
- **片段 / 设置**：查找替换、居中弹窗、批量删除；可搜索字体与本机 CJK 字体

---

## 上游核心能力

以下能力来自 [binaricat/Netcatty](https://github.com/binaricat/Netcatty)，本维护版同步保留。需要官方预编译安装包请前往 [上游 Releases](https://github.com/binaricat/Netcatty/releases)。

### Vault 与主机管理

- 网格 / 列表 / 树形三种视图，分组、标签、搜索与拖拽整理
- 组级默认（认证、端口、跳转等可继承到组内主机）
- 批量导入：PuTTY、MobaXterm、CSV、SecureCRT、`ssh_config` 等
- 密钥链（Keychain）、片段（Snippets）、已知主机（Known Hosts）管理
- 凭证经系统 `safeStorage` 加密落盘

### 终端与工作区

- 多标签 + **Workspace**：分屏终端（水平 / 垂直拆分）、Focus 模式侧栏
- **广播（Broadcast）**：同一工作区内，键盘输入可同步到其余窗格
- 底部 Compose 栏：向焦点窗或广播范围内的会话发送命令
- 支持 SSH、本地 Shell、Telnet、Mosh（**MoshCatty** 纯 Rust 客户端）、串口等（视环境与配置而定）
- 系统 SSH Agent、可配置连接超时、MFA / EDR / Duo 交互提示
- 复制标签 / 分屏可继承当前 CWD；会话恢复后可执行主机启动命令
- 跳板链（`hostChain`）、受管 `ssh_config`、连接复用
- 端口转发（本地 / 远程 / 动态）、连接日志与脚本录制
- 输出流控与写合并（高吞吐时限流），关键词高亮、会话日志可选
- 系统面板可看 GPU / NPU 占用（含昇腾 910B）、PVE CT 磁盘挂载

### SFTP 与编辑器

- 双窗格 SFTP 浏览、拖拽传输、传输队列
- Connected 选择器展示当前终端主机，并可复用已有 SSH 会话
- 可隐藏列、传输冲突确认、递归删除
- 内置 Monaco 编辑器，可在外部编辑远程文件
- 可追随终端当前目录、一键定位到终端 CWD（本 fork 强化，见下文）

### AI（Catty 与外部 Agent）

- 侧边栏对话式 **Catty**，理解当前终端会话与主机上下文
- **Capability 工具目录**：终端、SFTP、Vault、端口转发等可通过工具调用
- 外部 Agent（SDK / CLI）集成面：MCP stdio、CLI / RPC（见 `AGENTS.md`）
- **External MCP**：Codex / Claude / Cursor / Grok；写操作可在侧栏未打开时审批
- 设置里可一键测试 Provider 连通
- 写操作（SFTP 写入、端口转发启动等）支持确认模式审批

### 体验与其它

- 主题 / 终端配色 / 字体 / 高亮规则自定义（字体选择器可搜索，支持本机 CJK 字体）
- 片段查找替换、居中添加/编辑、批量删除
- 可配置全局快捷键（含终端相关动作）
- 可选 GitHub Gist 同步配置
- 系统托盘：关闭到托盘、快捷恢复主窗口
- 跨平台：macOS、Windows、Linux（Electron）

---

## 本 fork 增强功能

在继承上述能力之外，本仓库针对 **FinalShell 迁移**、**多机批量运维**、**外部 AI Agent**、**终端效率 / 可观测** 与 **高吞吐稳定性** 做了增量（上游暂无或本仓库默认策略不同）。

### FinalShell 主机导入

在 **Vault → 导入** 中选择 **FinalShell**，可多选 `*_connect_config.json`：

- 自动解析主机、端口、用户名
- 通过主进程解密 FinalShell 保存的密码（`window.netcatty.finalshell`）
- 若存在私钥，可一并选择 `config.json` 导入 Keychain
- 导入时按 **IPv4 前三段** 自动写入分组（如 `172.168.5.142` → 分组 `172.168.5`）

### IPv4 树形分组

在 **Vault → 树形视图** 中：

- 已有 `group` 的主机仍按原分组展示
- **无分组**且主机名为 IPv4 的条目，按前三段（如 `10.0.88`）归入虚拟文件夹
- 非 IP 名称的主机（如「腾讯云轻量」）仍显示在未分组区域

### 批量运维

面向「一次操作多台机器」的轻量能力（非 Ansible 级编排）：

| 能力 | 入口 | 说明 |
|------|------|------|
| **运维首页** | Vault 视图 → **首页**（新用户默认） | 继续会话、置顶/最近、按网段一键工作区或批量命令 |
| **工作区打开** | Vault 多选 → **工作区**；运维首页网段 → **开工作区** | ≥2 台收入同一 Workspace 分屏，默认开启广播 |
| **单机直连** | 同上入口仅选 **1 台** | **不建工作区**，与普通「连接」一致，打开独立会话标签 |
| **四宫格布局** | 一次选 4 台主机开工作区 | 自动 2×2 分屏；更多窗格可继续拆分 |
| **批量命令** | Vault 多选 → **批量命令**；或工作区 Compose 栏终端图标 | 并行 `execCommand`，按主机汇总 stdout / 退出码 |
| **错峰连接** | 多选连接 / 开工作区 | 终端挂载错峰，减轻多 WebGL 窗格同时启动的压力 |
| **失焦 WebGL** | 工作区非焦点窗格 | 可挂起 WebGL，降低多窗格 GPU 压力 |

**批量命令 v1 限制：** 仅 SSH 直连主机；暂不支持跳板链（`hostChain`）。

### 主机备注与会话恢复

| 能力 | 说明 |
|------|------|
| **主机备注摘要** | Vault 列表 / 树形 / 运维首页卡片展示备注纯文本摘要（Markdown 去噪），便于扫一眼识别用途 |
| **会话与布局恢复** | 重启后可恢复工作区与会话布局（本 fork 已打通并验收相关路径） |

### AI 与外部 Agent（本 fork）

| 能力 | 说明 |
|------|------|
| **WorkBuddy** | 可作为托管外部 Agent 使用；自动解析桌面版内嵌 CLI 路径，SDK 默认走 skills 集成（避免 MCP 冷启动超时） |
| **CodeBuddy 族路径** | 改进 CLI / SDK 可执行文件发现与环境注入（含 `CODEBUDDY_CODE_PATH`）；CLI 短暂不可用时更稳妥的错误分类与重试 |
| **模型列表同步** | 打开侧栏时强制刷新 SDK 模型目录；按模型 ID 去重；刷新中显示「正在刷新列表…」；空列表不写缓存，避免假列表 |
| **同会话切换 Agent** | 同一 scope 下切换 Agent 时**保留消息历史**，清除 `externalSessionId`，下一轮按 Netcatty 消息回放，避免误续旧 CLI 会话 |
| **跨 Agent 历史清洗** | 回放前剥离易冲突的 tool-call 标记文本，降低换 Agent 后上下文污染 |
| **侧栏打开稳定性** | 打包环境下 AI 面板与终端层协同加载；draft/session 结构规范化，避免附件/消息字段异常导致侧栏崩溃或卡死 |
| **Coding CLI 工作目录历史** | 记住本机 Claude / Codex / Grok 等工作目录，支持 resume / continue / 新开；扫描应用内会话与外部进程（如 Windows Terminal 里的 grok） |
| **运行阶段** | 标签页与 Focus 侧栏显示 idle / running / waiting / completed / failed |
| **Cursor 连续对话** | 下一轮前清掉残留 run，避免 `AgentBusyError` |
| **Vault Notes CLI** | tool CLI 可 `list` / `get` / `create` / `update` 应用内笔记；不要写远端 `NOTES.md` |
| **External MCP** | Codex / Claude / Cursor / Grok；本版随上游同步，写操作审批不依赖先打开 Catty 侧栏 |

设置中可配置多个外部 Agent（Claude Code、Codex、Copilot、Cursor、CodeBuddy、WorkBuddy、OpenCode 等，以当前版本托管列表为准）。

### 终端效率：命令历史与计时调试

| 能力 | 入口 | 说明 |
|------|------|------|
| **命令历史浮层** | 可配置快捷键（默认 `Ctrl+Shift+H` / macOS `⌘+Shift+H`；支持录制为单独 `Alt` 等修饰键） | FinalShell 风格浮层：搜索过滤、↑↓ 选择；**Enter / 双击只填入终端，不自动执行**；Esc 关闭 |
| **快捷键冲突检测** | 设置 → 快捷键 | 录制或重置绑定时检测占用并提示，避免两个动作抢同一组合键 |
| **命令计时调试** | 设置 → 系统 → Terminal Command Timing（默认关） | 记录命令输入 → 发往后端 → 首包输出 → 首帧渲染 → 结束等关键节点，便于分析「敲回车后卡一下」；面板支持按主机/IP 筛选与关键字搜索 |

### SFTP 与终端目录联动

| 能力 | 说明 |
|------|------|
| **复制/分屏继承 CWD** | 复制标签或分屏时带上当前目录（本版补齐消费路径，避免半成品 pick 导致终端无法加载） |
| **追随终端目录** | 打开追随后，随终端 `cd` / OSC 7 同步 SFTP 路径；路径比较做规范化，减少误跳 `/root` 或「目录变了但面板不动」 |
| **sudo 后提权跟随** | 交互式 `sudo -i` / `su` 后侧栏 SFTP 自动提权并跟随 elevated cwd（`/proc/<pid>/cwd`）；卡住的 `readdir` / 打开通道会超时重建 |
| **定位到当前目录** | 工具栏一键跳转；优先新鲜后端探测，过程中显示 loading |
| **会话绑定** | SFTP 与对应终端会话正确关联（含用户名等维度），避免多标签下取错 CWD |

### 主窗口默认行为

| 行为 | 说明 |
|------|------|
| **启动最大化** | 默认以最大化打开主窗口 |
| **窗口化尺寸** | 从最大化还原时，默认约为当前显示器工作区 **75%**，并**水平 + 垂直居中**，避免宽高超出屏幕 |

### 终端高吞吐与默认性能

长时间 `tail -f` 或超大文件输出时，整窗卡顿多来自 xterm 全量解析 + 大 scrollback + 关键词高亮。本 fork 默认策略：

| 策略 | 说明 |
|------|------|
| **默认 scrollback 3000 行** | 新配置默认更保守（仍可在设置中调大；`0` 表示无限制时有内部上限） |
| **输出压力下跳过高亮** | 大输出 / 长行 / 后台时硬跳过关键词扫描，安静后补扫可见区域 |
| **写队列 flood 让出主线程** | 洪峰时更小 drain、强制 yield，减轻 UI 卡死 |
| **旁路减负** | flood 时跳过连接日志捕获；Activity 标记先做廉价判断再过滤 |

已保存的个人设置不会被覆盖：若本地 scrollback 仍很大，请到 **设置 → 终端** 自行调低。

### WebGL 稳定性（多窗格乱码）

多窗格 / 广播 / 切焦点时若出现整屏「花屏」乱码（含本地连接日志也变乱），通常是 **WebGL 字形纹理图集损坏**，而非 SSH 编码错误。本 fork：

| 策略 | 说明 |
|------|------|
| **atlas 隔离补丁** | 安装与打包时对 `@xterm/addon-webgl` 打补丁，禁止多终端共享同一纹理图集 |
| **失焦挂起 WebGL** | 工作区非焦点窗格回退 DOM，减少多上下文争用 |
| **context loss 重建** | GPU 上下文丢失后自动重建渲染器并强制重绘 |
| **前台恢复清图集** | 窗口重新可见 / 获焦时清 atlas 并同步刷新 |

临时规避：设置 → 终端 → 渲染改为 **DOM**。`npm run pack:asar` 会在打包前再次应用 atlas 隔离补丁。

### 诊断日志与滚轮速度

| 能力 | 入口 | 说明 |
|------|------|------|
| **诊断 TRACE 日志** | 设置 → 系统 | 应用级日志写入 userData，可设保留天数（默认 7 天） |
| **滚轮滚动速度** | 设置 → 终端 → 行为 | 默认 0.5x，高流量远端输出更好读（可调 0.2–3） |

### Windows 托盘

- 右键托盘使用**原生菜单**（打开主窗口、会话、端口转发、退出等），避免自定义 `app://` 面板在部分环境下被系统当成外部链接
- 文本资源通过 `app://` 提供时声明 UTF-8，减轻中文 Windows 乱码

### 其他导入格式（继承上游）

PuTTY、MobaXterm、CSV、SecureCRT、`ssh_config` 等与上游一致。

---

## 快速了解 Netcatty

**Netcatty** 是一款跨平台 SSH 客户端和终端管理器，适合需要同时维护多台服务器的开发者与运维人员。

- 现代化替代 PuTTY、Termius、SecureCRT 等工具
- 双窗格 SFTP（可追随终端目录）、内置编辑器、拖拽传输
- 分屏终端、多标签工作区、Vault 多视图与运维首页、主机备注摘要
- 命令历史浮层、可配置快捷键
- 内置 Catty，并可接入 WorkBuddy / Cursor 等外部 Agent（模型列表与真实可用同步）

更完整的能力列表见上文 **[上游核心能力](#上游核心能力)** 与 **[本 fork 增强功能](#本-fork-增强功能)**。

---

## 快速开始

### 环境要求

- **Node.js 22+**（见 `package.json` 的 `engines`）
- npm
- Windows 10+ / macOS / Linux
- Windows 打包原生模块时可能需要 Visual Studio Build Tools（见下方说明）

### 克隆与开发

```bash
# 在 GitHub 仓库页点击 Code，复制 HTTPS 地址后执行
git clone <仓库地址>
cd Netcatty

npm install
npm run dev
```

`npm run dev` 会先执行 lint，再启动 Vite + Electron。

### 生产构建

```bash
npm run build
```

若 `prebuild` / `copy-monaco` 在个别环境异常，可先手动同步 Monaco 资源后再构建：

```powershell
# PowerShell 示例
Copy-Item -Recurse -Force node_modules\monaco-editor\min\vs public\monaco\vs
npx vite build
```

### 打包

```bash
# 当前平台安装包
npm run pack

# 本 fork Windows x64 正式包（NSIS）；上传到 GitHub Release
npm run pack:win-x64:release
npm run release:win-x64

# 仅输出目录（便携版，不生成 NSIS）
npm run build
npx electron-builder --config electron-builder.config.cjs --config.npmRebuild=false --win --x64 --dir --publish=never
```

**Windows 便携目录：** `release/win-unpacked/`，直接运行其中的 `Netcatty.exe`。可将整个目录复制到任意路径使用。

#### 增量更新已安装目录的 `app.asar`（Windows）

若本机已有解压版安装目录（例如 `D:\work\Netcatty`），可在改完代码后只同步应用内容，无需整包重打：

```powershell
# 完整流程：vite build + 打包并部署 app.asar
npm run pack:asar

# 已手动 build 时跳过构建
npm run pack:asar -- -SkipBuild

# 指定安装根目录（默认见 scripts/pack-app-asar.ps1）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pack-app-asar.ps1 -InstallPath "D:\work\Netcatty"
```

说明：

- 部署前会备份原 `resources\app.asar` 为 `app.asar.bak`
- 打包脚本会**再次应用** WebGL atlas 隔离补丁，避免增量部署后多窗格乱码回潮
- **需完全退出再启动** Netcatty 后新代码才会生效
- 这是内测/本地热更路径：只换业务 asar，**不**升级 Electron 壳与原生模块；正式发版仍建议 `npm run pack`

**常见打包注意：**

- 网络不稳定时可设 `ELECTRON_BUILDER_OFFLINE=true` 使用已缓存的 Electron
- `node-pty` 重编译失败时可加 `--config.npmRebuild=false`，使用预编译二进制
- Node 22 下部分脚本解密测试需 `NODE_OPTIONS=--openssl-legacy-provider`；Electron 运行时一般不需要

### Vault 多选与批量运维

1. 在 **Vault** 中多选主机（或从 **运维首页** 按网段选机）
2. 底部操作栏 / 首页按钮可选：
   - **连接**：每台主机独立标签页
   - **工作区**：≥2 台时同一 Workspace 分屏（4 台时 2×2），默认开启广播；**仅 1 台则直接连接**
   - **批量命令**：输入一条命令，查看各机输出与退出码
3. 列表中可直接看到主机备注摘要；备注可在主机详情中编辑

### 命令历史与终端调试

1. 打开终端后按快捷键呼出**命令历史浮层**（默认 `Ctrl+Shift+H`，可在 **设置 → 快捷键** 修改）
2. 输入关键字过滤，↑↓ 选择后 **Enter 或双击** 将命令填入终端（不会自动执行）
3. 若需分析输入延迟：打开 **设置 → 系统 → Terminal Command Timing**，执行命令后在面板中按 IP / 关键字查看轨迹

### FinalShell 导入步骤

1. 在 FinalShell 中导出或复制 `conn/*_connect_config.json`（有私钥时一并准备 `config.json`）
2. 打开 Netcatty → **Vault** → **导入** → 选择 **FinalShell**
3. 多选 json 文件后确认
4. 若主机已存在且无密码，需先删除旧条目再导入（重复导入会跳过已有主机）
5. 在树形视图下按 IP 段查看分组；连接前可在主机详情中确认密码已填入

### 外部 Agent 快速验证

1. 安装 WorkBuddy / CodeBuddy / Cursor 等桌面或 CLI（路径可自动发现，也可在设置中手动指定）
2. 打开任意终端侧栏 **AI**，在 Agent 列表中选择对应外部 Agent
3. 打开模型选择时应注意「正在刷新列表…」；列表应与 CLI/SDK 实际可用模型一致且无大量重复
4. 发送一条消息确认 CLI 可启动；切换回 Catty 时同一会话消息应仍在
5. 长时间 `tail` 大日志时，若仍卡顿：在 **设置 → 终端** 调低 scrollback、必要时关闭关键词高亮；多窗格乱码时可改用 DOM 渲染

---

## 技术栈

| 分类 | 技术 |
|------|------|
| 桌面壳 | Electron |
| 前端 | React、TypeScript、Vite |
| 终端 | xterm.js |
| 样式 | Tailwind CSS |
| SSH/SFTP | ssh2、ssh2-sftp-client |
| PTY | node-pty |

架构与开发约定见仓库根目录 [AGENTS.md](AGENTS.md)、[CLAUDE.md](CLAUDE.md)。

---

## 参与贡献

1. Fork 本仓库
2. 创建功能分支（如 `feature/xxx`）
3. 提交并推送后发起 Pull Request

功能分支示例：`feature/ops_ai_enhancements`。

---

## 上游与致谢

- 原版 **Netcatty** 由 [binaricat](https://github.com/binaricat) 开发维护，官网：[netcatty.app](https://netcatty.app)
- 需要官方预编译安装包请前往 [binaricat/Netcatty Releases](https://github.com/binaricat/Netcatty/releases)
- 感谢上游贡献者与开源社区

---

## 开源协议

本项目基于 **GPL-3.0** 发布。使用、修改与分发请遵守 [LICENSE](LICENSE)；基于本仓库的衍生作品亦需以相同协议开源。

---

<p align="center">
  本仓库为上游 Netcatty 的定制维护分支<br/>
  上游项目：<a href="https://github.com/binaricat/Netcatty">binaricat/Netcatty</a>
</p>
