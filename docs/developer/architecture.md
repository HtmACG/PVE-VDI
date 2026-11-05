# 技术架构

PVE VDI 是一个标准的 Electron 三进程模型应用，主进程负责所有与 PVE 的通信，渲染进程只负责界面呈现。

## 技术栈

| 层 | 技术选型 |
| --- | --- |
| 桌面框架 | Electron 44 |
| 构建工具 | electron-vite 6、Vite 8 |
| 界面框架 | React 19、TypeScript 5.9 |
| 样式体系 | Tailwind CSS 4、Radix UI 原语、shadcn/ui 风格组件 |
| 数据可视化 | Recharts、Radix Progress |
| 图标 | lucide-react、simple-icons、react-icons |
| 控制台 | noVNC 1.7、xterm.js 6 + FitAddon |
| 网络通信 | Node `https`、`ws` |
| 版本比较 | semver |

## 进程模型

```text
┌──────────────────────────────────────────────────────┐
│  Renderer（React 界面）                              │
│  contextIsolation 开启，Node.js 禁用                 │
│  只通过 preload 暴露的白名单 IPC 调用主进程          │
└───────────────▲──────────────────────┬───────────────┘
                │ 类型化 IPC（DesktopApi）│
┌───────────────┴──────────────────────▼───────────────┐
│  Main（Node 主进程）                                 │
│  持有 PVE 会话、TLS 连接、票据与本地设置             │
│  127.0.0.1 回环 WebSocket 控制台桥                   │
└───────────────────────────────▲──────────────────────┘
                                │ https / WSS
                     ┌──────────┴──────────┐
                     │   Proxmox VE API    │
                     └─────────────────────┘
```

- 主进程使用 Node `https` 直接访问 PVE API，不依赖浏览器 CORS；
- 渲染进程无法直接读取密码、ticket 或 CSRF token；
- 控制台 WebSocket 仅监听回环地址，由主进程桥接到 PVE。

## 目录结构

```text
src/
  main/
    index.ts              Electron 主进程、窗口与安全策略
    ipc.ts                类型化 IPC 处理器
    settings.ts           本地设置、字体 / 强调色与 DPAPI 凭据
    console-host.ts       127.0.0.1 回环 WebSocket 控制台桥
    console-windows.ts    独立控制台窗口与窗口级会话清理
    pve/client.ts         PVE API 客户端（ticket + CSRF + 流式上传）
    pve/os.ts             VM 操作系统识别与 Guest Agent 补充
    pve/node-hardware.ts  一次性 termproxy 会话读取 DMI / CPU / 传感器
    pve/service.ts        集群 / VM / 控制台会话与实时资源采样
  preload/index.ts        最小化 DesktopApi 桥
  renderer/               React 界面
    src/components/ui/      shadcn 风格基础组件
    src/components/console/ noVNC / xterm.js 控制台视图与窗口入口
    src/components/os-icon.tsx 操作系统图标
    src/lib/appearance.ts  字体 / 强调色运行时应用
    src/hooks/             仪表盘与 2 秒实时资源采样
    src/components/views/  总览 / 虚拟机 / 节点 / 镜像 / 集群 / 任务 / 设置
  shared/
    appearance.ts         字体预设、强调色校验与对比色计算
    types.ts / ipc.ts     共享类型与 IPC 通道
```

## 实时数据机制

- 资源看板在渲染进程通过 hooks 每 2 秒采样一次，独立于完整集群刷新；
- RRD 曲线数据来自 PVE 原生 `rrddata`，采样点实时追加；
- 镜像上传走主进程流式 multipart，避免大文件占用内存。

## 相关文档

- 本地开发与构建：[开发指南](./development)
- 安全设计细节：[安全与边界](./security)
