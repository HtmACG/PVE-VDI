# 安装与登录

本文介绍如何获取 PVE VDI、完成首次登录，并说明证书校验相关选项。

## 获取程序

Windows 安装包与便携版位于项目的 `release/` 目录：

| 文件 | 说明 |
| --- | --- |
| `PVE-VDI-1.7.0-x64.exe` | NSIS 安装包 |
| `PVE-VDI-Portable-1.7.0-x64.exe` | 便携版，无需安装 |

两个产物均未使用商业代码签名证书，Windows SmartScreen 可能提示“未知发布者”，确认来源可信后选择继续运行即可。

::: warning 二级盘启动问题
Chromium 子进程与 NSIS 安装器在部分 Windows 盘符环境下无法直接启动。若遇到启动失败，请把安装包或 `win-unpacked` 目录复制到系统盘后再运行。
:::

## 首次登录

登录页默认不包含真实 PVE 地址、账户或密码。首次启动时需要手动填写以下信息：

1. **PVE API 地址**：Proxmox VE 的 API 入口，例如 `https://pve.example.com:8006`；
2. **用户名**：PVE 的 `用户@领域` 格式，例如 `root@pam`；
3. **密码**：对应用户的登录密码。

<figure class="shot">

![登录页](/screenshots/login.png)

<figcaption>登录页：填写 PVE 地址、用户名与密码，默认允许自签名证书</figcaption>
</figure>

<figure class="shot">

![登录失败提示](/screenshots/login-error.png)

<figcaption>账号或密码错误时，登录页直接展示 PVE 返回的原始错误，不建立会话</figcaption>
</figure>

## 自签名证书选项

PVE 默认使用自签名证书，登录页默认启用 **允许自签名证书**，此时主进程会跳过对 PVE TLS 证书的严格链校验。

若已在 PVE 部署受信任证书，可以关闭该选项进行严格 TLS 校验：

- 关闭后，PVE 证书必须被当前 Windows 系统信任；
- 证书不受信任或主机名不匹配时，登录会直接失败。

::: tip 安全建议
生产环境建议为 PVE 部署受信任证书并关闭“允许自签名证书”，以获得完整的 TLS 身份校验。
:::

## 登录成功后

进入主界面后，默认展示总览看板，包含集群与节点信息、资源水位与存储池。你可以：

- 在 [集群与节点](./dashboard) 中查看实时资源；
- 打开 [虚拟机管理](./virtual-machines) 查看工作负载；
- 通过 [外观与设置](./appearance) 调整主题与字体。

## 从源码运行

如果你希望从源码启动而不是使用打包产物，请先准备 Node.js >= 22.12 与 pnpm 10，然后参考 [开发指南](../developer/development)。
