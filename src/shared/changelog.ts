export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.0',
    date: '2026-11-06',
    items: [
      '界面切换为 Windows 10 风格中性灰与 Windows 蓝，默认系统字体，保持全局 0px 圆角',
      '节点设置改为主分组 + 子导航的双侧边栏布局，移除嵌套设置卡片',
      '网络接口增加可视化端口卡片，并支持在设置中切换卡片 / 列表；图标使用 lucide',
      '未适配操作系统图标时使用 Proxmox VE 官方标识',
      '空状态与连接错误使用 Vue 3 生态 Element Plus 的官方空状态 SVG 插图',
      '图表改用 Recharts，进度条改用 Radix Progress，OS 图标改用 simple-icons / react-icons',
      'GitHub 更新检查改用 semver 与标准 fetch',
      '新增开发者信息、GitHub 更新检查和更新日志',
      '独立控制台窗口标题栏与边框细节调整'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-11-06',
    items: [
      '新增节点设置页：网络、DNS、时间、证书、存储库、防火墙和磁盘',
      '网络接口支持创建、编辑、删除、应用与还原待应用配置',
      '独立 noVNC / xterm.js 控制台窗口标题栏收敛',
      '登录页和启动页减少装饰与营销式文案'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-11-05',
    items: [
      'noVNC 与 xterm.js 改为独立原生窗口',
      '登录页加入插画',
      '新增界面字体与强调色自定义并持久化'
    ]
  }
]
