<p align="center">
  <img src="public/icon.png" alt="Netcatty" width="128" height="128">
</p>

<h1 align="center">Netcatty</h1>

<p align="center">
  <strong>定制维护版 · AI 驱动的 SSH 客户端、SFTP 与终端工作台</strong>
</p>

<p align="center">
  基于 <a href="https://github.com/binaricat/Netcatty">binaricat/Netcatty</a> 定制，在保留原版能力的基础上增强 Vault 导入与主机组织方式。
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
| **发行方式** | 本仓库**不跟随上游自动发版**；请自行克隆、构建或打包（见下文） |

上游 Netcatty 是功能完整的 SSH 工作台。本维护版在同步上游能力的同时，针对日常运维场景增加了以下能力。

---

## 本版增强功能

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

### 其他导入格式（继承上游）

PuTTY、MobaXterm、CSV、SecureCRT、`ssh_config` 等格式与上游一致。

---

## Netcatty 是什么

**Netcatty** 是一款跨平台 SSH 客户端和终端管理器，适合需要同时维护多台服务器的开发者与运维人员。

- 现代化替代 PuTTY、Termius、SecureCRT 等工具
- 双窗格 SFTP、内置编辑器、拖拽传输
- 分屏终端、多标签工作区、Vault 多视图（网格 / 列表 / 树形）
- 内置 Catty AI Agent（继承上游）
- 支持 SSH、本地终端、Telnet、Mosh、串口等（视环境而定）

---

## 功能概览

### Vault

- 网格 / 列表 / 树形三种视图
- 分组、标签、搜索、拖拽整理
- 多格式批量导入（含 FinalShell）

### 终端与 SFTP

- 水平 / 垂直分屏
- SFTP 双窗格浏览与传输
- 主题与终端高亮自定义

### AI（Catty Agent）

继承上游内置 AI 助手，可通过对话执行运维任务、跨主机编排操作。界面与能力以当前分支代码为准。

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

# 仅输出目录（便携版，不生成 NSIS）
npm run build
npx electron-builder --config electron-builder.config.cjs --config.npmRebuild=false --win --x64 --dir --publish=never
```

**Windows 便携目录：** `release/win-unpacked/`，直接运行其中的 `Netcatty.exe`。可将整个目录复制到任意路径使用。

**常见打包注意：**

- 网络不稳定时可设 `ELECTRON_BUILDER_OFFLINE=true` 使用已缓存的 Electron
- `node-pty` 重编译失败时可加 `--config.npmRebuild=false`，使用预编译二进制
- Node 22 下部分脚本解密测试需 `NODE_OPTIONS=--openssl-legacy-provider`；Electron 运行时一般不需要

### FinalShell 导入步骤

1. 在 FinalShell 中导出或复制 `conn/*_connect_config.json`（有私钥时一并准备 `config.json`）
2. 打开 Netcatty → **Vault** → **导入** → 选择 **FinalShell**
3. 多选 json 文件后确认
4. 若主机已存在且无密码，需先删除旧条目再导入（重复导入会跳过已有主机）
5. 在树形视图下按 IP 段查看分组；连接前可在主机详情中确认密码已填入

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

功能分支示例：`feature/finalshell_import_support`。

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
