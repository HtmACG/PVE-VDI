# 镜像与磁盘

镜像页面按节点管理 ISO 安装介质，虚拟机硬件页则提供磁盘与 CD-ROM 的查看和操作。

## 镜像页面

镜像页按节点列出启用了 ISO 内容类型的存储以及其中的镜像文件，可以集中管理各节点的安装介质。

<figure class="shot">

![镜像页面](/screenshots/images.png)

<figcaption>镜像页面：按节点列出 ISO 镜像、占用空间与存储信息</figcaption>
</figure>

## 上传本地镜像

支持上传本地 ISO / IMG 文件：

- 上传使用主进程流式 multipart 处理；
- 不会在内存中加载整个镜像文件，大文件上传不会撑爆渲染进程内存。

## 从 URL 导入

支持直接从 HTTP(S) URL 导入镜像，并提供以下选项：

- 填写 SHA-1 / SHA-256 等校验值，导入后核对文件完整性；
- 自签名 HTTPS 证书开关，用于内网源证书不受信任的场景。

<figure class="shot">

![从 URL 导入 ISO](/screenshots/url-import.png)

<figcaption>从 URL 导入 ISO：支持校验算法与自签名 HTTPS 证书开关</figcaption>
</figure>

## 删除镜像

不再需要的 ISO 可以直接从存储中删除，删除前会有确认提示。

## 虚拟机磁盘与 CD-ROM

虚拟机详情的“硬件”页展示磁盘容量、格式与 CD-ROM 标记，并提供：

- 添加磁盘；
- 磁盘扩容；
- 移除磁盘（可选删除底层数据卷）。

磁盘操作的完整约束与状态校验见 [虚拟机管理](./virtual-machines#磁盘管理)。

## 相关页面

- 用镜像安装新系统：[创建虚拟机](./create-vm)
- 节点上的存储池容量：[集群与节点](./dashboard)
