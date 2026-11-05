# 虚拟机管理

虚拟机页面集中管理 QEMU 虚拟机与 LXC 容器，支持过滤搜索、电源操作、详情查看、关机配置与磁盘管理。

## 列表与过滤

工作负载列表展示实时状态，并支持以下过滤方式：

- 关键字搜索；
- 按运行状态过滤；
- 按节点过滤；
- 按标签过滤。

列表中同时展示 CPU、内存、磁盘、网络 I/O、运行时长、标签与模板标记。

## 操作系统图标识别

系统通过多级回退识别工作负载的操作系统并显示对应品牌图标：

1. 优先使用 PVE 配置中的 `ostype`；
2. QEMU Linux 再通过 Guest Agent 的 `get-osinfo` 补充发行版信息；
3. 以名称 / 描述作为最后回退。

已适配 Windows、Ubuntu、Debian、Arch Linux、Fedora、Rocky、openSUSE、Kali 与通用 Linux 等图标；没有适配图标的系统显示 Proxmox VE 标识，不显示问号。

## 电源操作

支持对 QEMU 与 LXC 执行以下电源操作：

- 启动；
- ACPI 关机；
- 强制停止；
- 重启、重置；
- 挂起、恢复。

::: danger 破坏性操作二次确认
强制停止、重置等破坏性操作会弹出确认对话框。操作下发后列表与详情会自动刷新。
:::

## 详情面板

详情面板包含工作负载的完整运行信息：

- 运行状态、QMP 状态、HA、Guest Agent、PID 与压力指标；
- 1 小时 CPU / 内存遥测；
- 完整硬件配置、磁盘与 CD-ROM、原始配置数据；
- 虚拟网卡、VLAN、防火墙与 Guest Agent 报告的 IP 地址；
- 快照链与最近任务日志。

<figure class="shot">

![虚拟机硬件详情](/screenshots/vm-hardware.png)

<figcaption>虚拟机详情“硬件”页：CPU 拓扑、内存配置、存储设备与完整虚拟机配置</figcaption>
</figure>

## 关机配置

虚拟机关机后，可以修改以下配置：

- CPU 核心 / 插槽；
- 内存与 Balloon；
- CPU 类型、机器类型；
- 固件、显示设备；
- 启动顺序与 Guest Agent 选项。

<figure class="shot">

![编辑虚拟机关机配置](/screenshots/vm-config-dialog.png)

<figcaption>编辑虚拟机关机配置：计算、CPU 与固件、启动与运行选项分组展示</figcaption>
</figure>

## 磁盘管理

关机状态下可以对磁盘执行完整管理：

- 添加 SCSI / Virtio / SATA 磁盘；
- 扩容现有磁盘；
- 移除磁盘，并可选择是否同时删除底层数据卷。

运行状态下磁盘操作会被禁用，并由主进程再次校验状态，避免界面状态过期导致误操作。

<figure class="shot">

![添加磁盘对话框](/screenshots/add-disk-dialog.png)

<figcaption>添加磁盘对话框：选择目标存储、容量与总线类型，仅关机状态可用</figcaption>
</figure>

## 功能边界

- 快照页为只读，本版本未开放快照的创建、回滚与删除；
- 虚拟机删除未在本版本开放；
- 创建向导只创建 QEMU 虚拟机，详见 [创建虚拟机](./create-vm)。

## 相关页面

- 打开图形或终端控制台：[内置控制台](./console)
- 管理 ISO 与安装介质：[镜像与磁盘](./images)
