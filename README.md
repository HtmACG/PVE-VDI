# PVE VDI

基于 Electron 的 Proxmox VE 桌面控制台。用于观察集群与节点状态、管理 QEMU / LXC 工作负载、查看虚拟机完整运行信息，并通过表单或模板克隆创建新虚拟机。

界面采用 shadcn/ui 设计语言与 Radix 原语，全局 **0px 圆角**。信息层级以数据为主：放大的资源指标、克制的分隔线与等宽数字，状态只用文字表达，不使用多余的指示色块。登录页带主题插画，界面字体与强调色可在设置中自定义。

> 为避免泄露内部环境，公开仓库不包含真实集群截图、服务器地址、虚拟机名称、IP、证书指纹或本地路径。截图请仅保存在本地，并保持在 `.gitignore` 之外。

## 功能

### 集群与节点

- 集群 Quorum、节点数量、集群配置与 HA 状态
- 节点 CPU / 内存 / 根磁盘水位、负载、运行时间、CPU 型号、KSM、SSL 指纹
- 服务器资源看板每 2 秒独立刷新，不等待完整集群刷新；1 小时 RRD 曲线会实时追加当前采样
- 节点 1 小时 RRD 遥测曲线，来自 PVE 原生 `rrddata`
- 存储池容量、类型、共享属性与可用空间
- 最近任务与任务日志

### 节点设置

- 从节点卡片进入独立设置页，左侧按“系统 / 更新 / 防火墙 / 磁盘”分组，结构与 PVE 节点设置一致
- **网络**：读取物理网卡、网桥、VLAN、Bond；创建、编辑、删除接口；写入待应用配置后可应用或还原，应用前有中断提示
- DNS 搜索域与三组上游服务器编辑
- 节点时区、描述编辑；证书、APT 存储库、防火墙参数与日志、系统日志查看
- 证书只展示主体、签发者、有效期、指纹和 SAN，不返回私钥或 PEM；存储库与防火墙规则只读
- LVM、LVM-Thin、目录存储与 ZFS 容量查看

### 虚拟机

- 搜索、按运行状态 / 节点 / 标签过滤，展示工作负载的实时状态
- 每台虚拟机显示操作系统图标：Windows、Ubuntu、Debian、Arch Linux、Alpine、Fedora、Rocky、openSUSE、Kali、通用 Linux 等
- OS 识别优先使用 PVE 配置中的 `ostype`，QEMU Linux 会再通过 Guest Agent 的 `get-osinfo` 补充发行版信息，并以名称 / 描述作为回退
- CPU、内存、磁盘、网络 I/O、运行时长、标签、模板标记
- 电源操作：启动、ACPI 关机、强制停止、重启、重置、挂起、恢复
- 破坏性操作二次确认；操作下发后自动刷新列表与详情
- 详情面板包含：
  - 运行状态、QMP 状态、HA、Guest Agent、PID、压力指标
  - 1 小时 CPU / 内存遥测
  - 完整硬件配置、磁盘与 CD-ROM、原始配置数据
  - 虚拟网卡、VLAN、防火墙、Guest Agent 报告的 IP 地址
  - 快照链、最近任务日志
- **内置控制台**：
  - QEMU 虚拟机使用 **noVNC**，支持 Ctrl+Alt+Del、剪贴板双向读写、适应窗口、全屏与重连
  - LXC 容器和节点 Shell 使用 **xterm.js**，支持流式输出、终端尺寸同步、复制选区与 30 秒心跳
  - noVNC 与 xterm.js 均在**独立原生窗口**中打开，可单独移动、最小化、最大化或关闭；窗口使用自定义标题栏
  - 控制台通过主进程建立回环 WebSocket 桥，Renderer 不直接连接 PVE TLS，也不持久化控制台票据；关闭窗口会结束对应控制台会话

### 界面与外观

- 登录页使用独立插画，支持深色 / 浅色主题与自定义强调色
- 界面字体：Inter、Windows 系统字体、JetBrains Mono 或自定义 CSS `font-family`
- 强调色：工业橙、信号蓝、青绿、紫罗兰、玫红、琥珀六种预设，也支持输入任意 `#RRGGBB`
- 字体与强调色会持久化到本地设置，并在新打开的控制台窗口中应用
- 配色只调整强调色，不改动状态色和资源预警色，避免降低可读性

### 创建虚拟机

- 空白创建：节点、VMID、名称、OS 类型、CPU、内存、磁盘、存储、ISO、网桥、VLAN、Guest Agent、随机启动
- 从模板完整克隆或链接克隆，选择目标存储，克隆后启动
- 创建过程等待 PVE 任务完成，任务失败时返回 PVE 原始错误
- 新建完成后自动打开虚拟机详情

## 技术架构

- **Electron 44**：主进程持有 PVE 会话与 TLS 连接
- **electron-vite 6 + Vite 8 + React 19 + TypeScript 5.9**
- **Tailwind CSS 4** + **Radix UI** 原语，自研 shadcn 风格组件层
- **noVNC 1.7**：QEMU RFB 控制台
- **xterm.js 6 + FitAddon**：LXC / 节点 Shell 终端
- **ws**：主进程内的回环 WebSocket 控制台桥
- 主进程使用 Node `https` 直接访问 PVE API，不依赖浏览器 CORS
- Renderer 开启 `contextIsolation`、禁用 Node.js，只通过 preload 暴露的白名单 IPC 调用主进程
- 会话票据仅保存在主进程内存；密码默认不落盘
- 可选“记住凭据”使用 Electron `safeStorage`（Windows DPAPI）加密保存

```text
src/
  main/
    index.ts              Electron 主进程、窗口与安全策略
    ipc.ts                类型化 IPC 处理器
    settings.ts           本地设置、字体 / 强调色与 DPAPI 凭据
    console-host.ts       127.0.0.1 回环 WebSocket 控制台桥
    console-windows.ts    独立控制台窗口与窗口级会话清理
    pve/client.ts         PVE API 客户端（ticket + CSRF）
    pve/os.ts             VM 操作系统识别与 Guest Agent 补充
    pve/service.ts        集群 / VM / 控制台会话与实时资源采样
  preload/index.ts        最小化 DesktopApi 桥
  renderer/               React 界面
    src/components/ui/    shadcn 风格基础组件
    src/components/console/ noVNC / xterm.js 控制台视图与窗口入口
    src/components/os-icon.tsx 操作系统图标
    src/lib/appearance.ts 字体 / 强调色运行时应用
    src/hooks/            仪表盘与 2 秒实时资源采样
    src/components/views/ 总览 / 虚拟机 / 节点 / 集群 / 任务 / 设置
  shared/
    appearance.ts         字体预设、强调色校验与对比色计算
    types.ts / ipc.ts     共享类型与 IPC 通道
```

## 运行

### 直接使用

Windows 安装包与便携版位于 `release/`：

- `PVE-VDI-1.4.0-x64.exe`：NSIS 安装包
- `PVE-VDI-Portable-1.4.0-x64.exe`：便携版

两个产物均未使用商业代码签名证书，Windows SmartScreen 可能提示“未知发布者”。

登录页默认不包含真实 PVE 地址、账户或密码。首次启动时请在登录页手动填写 PVE API 地址、用户名与密码。

PVE 默认使用自签名证书，登录页默认启用“允许自签名证书”。若已在 PVE 部署受信任证书，可关闭该选项进行严格 TLS 校验。

> Chromium 子进程与 NSIS 安装器在部分 Windows 盘符环境下无法直接启动。若遇到启动失败，请把安装包或 `win-unpacked` 目录复制到系统盘后再运行。`pnpm dev` 已内置处理：会自动把 Electron runtime 放到系统盘。

### 开发

要求 Node.js >= 22.12，pnpm 10。

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会在 Windows 二级盘环境下自动准备系统盘 Electron runtime，避免从工作区盘启动 Chromium 失败。

构建前端与主进程：

```bash
pnpm build
```

生成 Windows 安装包与便携版：

```bash
pnpm package:win
```

### UI 冒烟测试

测试会连接真实 PVE、登录、打开详情/创建向导/任务日志并截图，不执行任何写操作。会验证资源更新时间戳持续推进，并输出识别到的操作系统图标。需要先 `pnpm build`，并通过环境变量提供测试环境信息；不要把测试环境写入源码。

```powershell
$env:PVE_SERVER_URL = 'https://pve.example.com:8006'
$env:PVE_USERNAME = 'your-username'
$env:PVE_PASSWORD = 'your-password'
pnpm test:ui
```

截图输出到本地 `screenshots/`，该目录已被 `.gitignore` 排除。

### 控制台测试

单独验证 noVNC 与 xterm.js 的独立窗口。会连接 `PVE_CONSOLE_VM_NAME` 指定的测试虚拟机，并打开节点 Shell 执行 `echo PVE_VDI_XTERM_OK`；测试会确认控制台以独立窗口打开。需要先 `pnpm build`。

```powershell
$env:PVE_SERVER_URL = 'https://pve.example.com:8006'
$env:PVE_USERNAME = 'your-username'
$env:PVE_PASSWORD = 'your-password'
$env:PVE_CONSOLE_VM_NAME = 'your-test-vm'
pnpm test:console
```

### 节点设置测试

只读验证节点设置页：读取网络列表、打开各设置分组、打开添加接口对话框并取消，不写入网络配置。需要先 `pnpm build`。

```powershell
$env:PVE_SERVER_URL = 'https://pve.example.com:8006'
$env:PVE_USERNAME = 'your-username'
$env:PVE_PASSWORD = 'your-password'
pnpm test:node-settings
```

### 外观测试

验证字体预设、自定义字体、强调色预设与自定义 `#RRGGBB` 能即时写入 CSS 变量并持久化。测试结束会恢复原有外观设置。需要先 `pnpm build`。

```powershell
$env:PVE_SERVER_URL = 'https://pve.example.com:8006'
$env:PVE_USERNAME = 'your-username'
$env:PVE_PASSWORD = 'your-password'
pnpm test:appearance
```

### 隐私与仓库卫生

- 源码中的 PVE 地址与用户名默认值为空；真实地址、账户和密码只保存在本机设置中。
- `screenshots/` 与 `docs/screenshots/` 已加入 `.gitignore`，真实环境截图不会进入仓库。
- 测试脚本从环境变量读取服务器地址、账户和测试虚拟机名，禁止把内部环境写回源码。
- 提交前建议检查：`git grep -nE '10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.'`，并确认没有证书指纹、集群名、虚拟机名或本地路径。

## 安全与边界

- PVE 密码只经本地主进程发往目标 PVE API。渲染进程无法读取密码、ticket 或 CSRF token。
- 未勾选“记住凭据”时密码不写入磁盘；勾选后使用 Windows DPAPI 加密，仅当前 Windows 用户可解密。
- 关闭“允许自签名证书”后，PVE 证书必须被系统信任，否则登录失败。
- 控制台 WebSocket 由主进程桥接，仅监听 `127.0.0.1`，路径使用随机短期令牌；PVE 控制台票据不会作为 URL 暴露给渲染进程。
- 快照页为只读；创建、回滚、删除快照和虚拟机删除未在此版本开放。
- 已支持 QEMU 与 LXC 的状态与电源操作；创建向导只创建 QEMU 虚拟机。
- QEMU 控制台使用 noVNC，LXC 与节点控制台使用 xterm.js。QEMU 串口（serial0）终端暂未单独暴露。

## 验证记录

已在真实 PVE 环境完成验证（出于隐私原因，不记录集群地址、节点名或具体工作负载）：

- 登录页插画、深色 / 浅色主题与控制台外观设置
- 登录、集群/节点/存储/任务读取
- 服务器资源看板 2 秒刷新：界面时间戳持续推进
- 操作系统图标识别：Windows、Ubuntu、Debian、Alpine 与通用 Linux
- 虚拟机详情、硬件、网络、快照、任务日志读取
- 创建向导加载节点/存储/网络选项，空名称校验返回“请输入虚拟机名称。”
- noVNC 在独立窗口中连接运行中的 QEMU 虚拟机并完成 RFB 渲染
- xterm.js 在独立窗口中打开节点 Shell，输入并执行 `echo PVE_VDI_XTERM_OK`
- 界面字体预设、自定义字体、强调色预设与自定义颜色即时生效并持久化
- 节点设置页读取网络、DNS、时区、证书、存储库、防火墙与磁盘；打开全部分组及网络编辑对话框无 Renderer 控制台错误
- UI 冒烟测试、独立控制台测试、节点设置测试和外观测试均无 Renderer 控制台错误
- 1.1.0 时期已完成通过界面创建、启动、停止并删除临时 QEMU 虚拟机的完整流程

### 1.2.0 打包验证

- `pnpm build` 与 `pnpm typecheck` 通过
- NSIS 安装包静默安装、启动，并完成 noVNC 和 xterm.js 验证，随后静默卸载
- 便携版自系统盘启动验证
- 打包产物包含 noVNC / xterm.js 动态资源与 `ws` 运行时

### 1.3.0 打包验证

- NSIS 安装包安装、启动，并完成独立 noVNC / xterm.js 验证，随后静默卸载
- 便携版启动验证
- 打包内独立控制台窗口验证

### 1.4.0 打包验证

- `pnpm build` 与 `pnpm typecheck` 通过
- `win-unpacked` 中节点设置页和独立 noVNC / xterm.js 控制台窗口验证通过
- NSIS 安装包与便携版已生成，安装包未使用商业代码签名

## License

Copyright (C) 2026 PVE VDI contributors.

This project is licensed under the **GNU General Public License v3.0 only** (`GPL-3.0-only`). See [LICENSE](LICENSE) for the complete license text.
