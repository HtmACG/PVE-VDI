---
layout: home

hero:
  name: PVE VDI
  text: Proxmox VE 虚拟桌面运维控制台
  tagline: 基于 Electron 的桌面控制台，集群监控、QEMU / LXC 工作负载管理、noVNC 与 xterm.js 双控制台、虚拟机创建，全部在本地完成。
  image:
    src: /app-icon.png
    alt: PVE VDI 应用图标
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 产品简介
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/HtmACG/PVE-VDI

features:
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none"/><line x1="11" y1="7.5" x2="17" y2="7.5"/><line x1="11" y1="16.5" x2="17" y2="16.5"/></svg>'
    title: 集群与节点监控
    details: Quorum、HA 状态、节点 CPU / 内存 / 根磁盘水位与存储池容量，资源看板每 2 秒独立刷新，并实时追加 1 小时 RRD 遥测曲线。
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="12" y1="16" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/><polyline points="7.5,10 10.5,10 10.5,7.5"/></svg>'
    title: 工作负载全生命周期
    details: QEMU / LXC 搜索过滤、电源操作与二次确认、关机后硬件配置编辑、磁盘添加扩容移除、快照链与任务日志查看。
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><polyline points="7,9 10,12 7,15"/><line x1="13" y1="15" x2="17" y2="15"/></svg>'
    title: 内置双控制台
    details: QEMU 虚拟机使用 noVNC，支持剪贴板与全屏；LXC 容器和节点 Shell 使用 xterm.js，均在独立原生窗口中打开，可单独管理。
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><line x1="12" y1="9" x2="6" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>'
    title: 节点硬件与网络
    details: 通过只读 termproxy 会话读取 DMI、CPU 温度与 SMART 信息；物理网卡、网桥、VLAN、Bond 可视化编辑，支持配置应用与还原。
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none"/></svg>'
    title: 镜像管理
    details: 按节点浏览 ISO 镜像，本地文件流式上传、HTTP(S) URL 校验导入与删除，全程不在内存中加载整个镜像。
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z"/><polyline points="9,12 11,14 15.5,9.5"/></svg>'
    title: 安全本地化
    details: 渲染进程 contextIsolation 隔离，会话票据仅存主进程内存；可选 DPAPI 加密记住凭据，控制台经 127.0.0.1 回环桥接。
---

<div class="vp-doc home-extra">

## 产品预览

<figure class="shot">

![运行概览看板](/screenshots/overview.png)

<figcaption>运行概览看板：节点、资源水位、集群状态与 1 小时遥测曲线，数据每 2 秒刷新</figcaption>
</figure>

更多界面截图与操作说明见 [集群与节点](/guide/dashboard)、[虚拟机管理](/guide/virtual-machines) 与 [内置控制台](/guide/console)。

## 应用图标

<div class="app-icon-grid">

<div class="cell">

![应用图标 512](/app-icon.png)

<span class="meta">icon.png · 512</span>
</div>

<div class="cell">

![应用图标 256](/app-icon-256.png)

<span class="meta">icon-256.png · 256</span>
</div>

<div class="cell">

![品牌标识](/logo.svg)

<span class="meta">logo.svg · 矢量</span>
</div>

</div>

应用图标为深色底配橙色几何窗口的直角设计，与桌面端 0px 圆角语言一致；Windows 安装包另含 `favicon.ico`。

</div>
