# 开发指南

本文介绍如何在本地运行、构建 PVE VDI，以及如何开发本网站文档。

## 环境要求

- Node.js **>= 22.12**；
- pnpm **10**（项目锁定 10.33.4）；
- Windows 环境用于生成 Windows 安装包。

如果本机没有全局安装 pnpm，可以通过 Node 自带的 corepack 直接调用：

```bash
corepack pnpm --version
```

## 安装依赖

```bash
pnpm install
```

## 启动开发环境

```bash
pnpm dev
```

`pnpm dev` 会在 Windows 二级盘环境下自动准备系统盘 Electron runtime，避免从工作区盘启动 Chromium 失败。

## 构建

构建前端与主进程产物：

```bash
pnpm build
```

该命令会先执行 `typecheck`，再通过 electron-vite 完成构建。

## 生成 Windows 安装包

```bash
pnpm package:win
```

产物输出到 `release/`，包含 NSIS 安装包与便携版。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动应用开发环境 |
| `pnpm build` | 类型检查并构建主进程与渲染进程 |
| `pnpm start` | 预览构建产物 |
| `pnpm typecheck` | 仅执行 TypeScript 类型检查 |
| `pnpm package:win` | 生成 Windows 安装包与便携版 |
| `pnpm docs:dev` | 启动文档站点本地开发服务器 |
| `pnpm docs:build` | 构建文档静态产物 |
| `pnpm docs:preview` | 本地预览文档构建产物 |

## 文档站点开发

文档源码位于 `docs/`，基于 VitePress 1.6：

```bash
pnpm docs:dev
```

文档构建产物输出到 `docs/.vitepress/dist/`。部署到 GitHub Pages 等子路径环境时，通过 `DOCS_BASE` 环境变量指定基础路径：

```bash
DOCS_BASE=/PVE-VDI/ pnpm docs:build
```

## 代码约定

- 共享类型与 IPC 通道统一放在 `src/shared/`，主进程与渲染进程都从这里引用；
- 界面基础组件放在 `components/ui/`，业务视图放在 `components/views/`；
- 全局保持 0px 圆角，不引入额外的状态色块。

## 下一步

- 提交前运行冒烟测试：[测试](./testing)
- 检查是否符合安全约束：[安全与边界](./security)
