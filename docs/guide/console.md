# 内置控制台

PVE VDI 内置两类控制台，分别对应图形界面与终端场景，均在独立原生窗口中打开。

## 两类控制台

| 对象 | 控制台技术 | 能力 |
| --- | --- | --- |
| QEMU 虚拟机 | noVNC | 图形桌面、剪贴板、全屏 |
| LXC 容器 | xterm.js | 流式终端输出 |
| 节点 Shell | xterm.js | 节点命令行 |

## noVNC 图形控制台

QEMU 虚拟机通过 noVNC 1.7 提供 RFB 图形控制台，支持：

- 发送 **Ctrl+Alt+Del**；
- 剪贴板双向读写；
- 适应窗口缩放；
- 全屏显示；
- 断线重连。

## xterm.js 终端

LXC 容器与节点 Shell 使用 xterm.js 6 及 FitAddon，支持：

- 流式输出与终端尺寸同步；
- 复制选区文本；
- 30 秒心跳保活。

<figure class="shot">

![节点 Shell 终端](/screenshots/console-xterm.png)

<figcaption>xterm.js 节点 Shell 在独立原生窗口中打开，支持流式输出与终端尺寸同步</figcaption>
</figure>

## 独立窗口

noVNC 与 xterm.js 均在独立原生窗口中打开，可以单独移动、最小化、最大化或关闭，窗口使用自定义标题栏。

控制台工具栏位于标题栏“已连接”状态旁，采用无边框、无底色的图标按钮。

## 连接与安全机制

控制台连接由主进程统一桥接：

- 主进程建立 **127.0.0.1 回环 WebSocket 桥**，渲染进程不直接连接 PVE TLS；
- 回环路径使用随机短期令牌，PVE 控制台票据不会作为 URL 暴露给渲染进程；
- 不持久化控制台票据；
- 关闭窗口会立即结束对应的控制台会话。

## 当前限制

- QEMU 串口（`serial0`）终端暂未单独暴露；
- 一个控制台窗口对应一个会话，多会话需打开多个窗口。

## 相关页面

- 控制台的安全设计细节：[安全与边界](../developer/security)
- 控制台连接的目标对象：[虚拟机管理](./virtual-machines)
