# 测试

项目提供四个基于 Playwright 的冒烟测试，全部需要连接真实 PVE 环境，运行前必须先完成构建。

## 前置条件

```bash
pnpm build
```

测试环境信息通过环境变量提供，不要把测试环境写入源码：

```powershell
$env:PVE_SERVER_URL = 'https://pve.example.com:8006'
$env:PVE_USERNAME = 'your-username'
$env:PVE_PASSWORD = 'your-password'
```

## UI 冒烟测试

```powershell
pnpm test:ui
```

验证内容：

- 登录、打开详情 / 创建向导 / 任务日志并截图；
- 资源更新时间戳持续推进；
- 输出识别到的操作系统图标。

测试不执行任何写操作，截图输出到本地 `screenshots/`（已被 `.gitignore` 排除）。

## 控制台测试

```powershell
$env:PVE_CONSOLE_VM_NAME = 'your-test-vm'
pnpm test:console
```

验证 noVNC 与 xterm.js 的独立窗口：

- 连接指定测试虚拟机；
- 打开节点 Shell 执行 `echo PVE_VDI_XTERM_OK`；
- 确认控制台以独立窗口打开。

## 节点设置测试

```powershell
pnpm test:node-settings
```

只读验证节点设置页：

- 读取网络列表并打开各设置分组；
- 打开添加接口对话框后取消，不写入网络配置。

## 外观测试

```powershell
pnpm test:appearance
```

验证字体预设、自定义字体、强调色预设与自定义 `#RRGGBB` 能即时写入 CSS 变量并持久化，测试结束后恢复原有外观设置。

## 注意事项

- 所有测试脚本都从环境变量读取服务器地址、账户和测试虚拟机名；
- 测试不会执行破坏性写操作，但仍建议使用专用测试账号；
- 提交前确认没有把内部环境信息写回源码或截图。

## 相关文档

- 测试覆盖的功能范围：[产品简介](../guide/introduction)
- 仓库卫生与隐私要求：[安全与边界](./security)
