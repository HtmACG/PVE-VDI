import { defineConfig } from 'vitepress'

// 部署到 GitHub Pages 项目站点（https://<user>.github.io/PVE-VDI/）时，
// 在构建环境设置 DOCS_BASE=/PVE-VDI/；自定义域名或根路径部署保持默认 '/'。
const base = process.env.DOCS_BASE || '/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'PVE VDI',
  titleTemplate: 'Proxmox VE 虚拟桌面运维控制台',
  description:
    '基于 Electron 的 Proxmox VE 桌面控制台，用于集群与节点监控、QEMU / LXC 工作负载管理、内置远程控制台与虚拟机创建。',
  base,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['link', { rel: 'alternate icon', href: `${base}favicon.ico` }],
    ['meta', { name: 'author', content: 'PVE VDI contributors' }]
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      {
        text: '指南',
        items: [
          { text: '产品简介', link: '/guide/introduction' },
          { text: '安装与登录', link: '/guide/getting-started' },
          { text: '虚拟机管理', link: '/guide/virtual-machines' },
          { text: '内置控制台', link: '/guide/console' },
          { text: 'SSH 终端', link: '/guide/ssh' },
          { text: 'AI 运维助手', link: '/guide/ai' },
          { text: '存储管理', link: '/guide/storage' },
          { text: '备份与还原', link: '/guide/backup' },
          { text: '访问控制', link: '/guide/access' }
        ]
      },
      {
        text: '开发',
        items: [
          { text: '技术架构', link: '/developer/architecture' },
          { text: '开发指南', link: '/developer/development' },
          { text: '测试', link: '/developer/testing' },
          { text: '安全与边界', link: '/developer/security' }
        ]
      },
      { text: '更新日志', link: '/developer/changelog' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '快速开始',
          collapsed: false,
          items: [
            { text: '产品简介', link: '/guide/introduction' },
            { text: '安装与登录', link: '/guide/getting-started' }
          ]
        },
        {
          text: '功能指南',
          collapsed: false,
          items: [
            { text: '集群与节点', link: '/guide/dashboard' },
            { text: '虚拟机管理', link: '/guide/virtual-machines' },
            { text: '内置控制台', link: '/guide/console' },
          { text: 'SSH 终端', link: '/guide/ssh' },
            { text: '节点设置', link: '/guide/node-settings' },
            { text: '镜像与磁盘', link: '/guide/images' },
            { text: '存储管理', link: '/guide/storage' },
            { text: '备份与还原', link: '/guide/backup' },
            { text: '创建虚拟机', link: '/guide/create-vm' },
            { text: '外观与设置', link: '/guide/appearance' }
          ]
        },
        {
          text: '集群运维',
          collapsed: false,
          items: [
            { text: '防火墙与高可用', link: '/guide/firewall-ha' },
            { text: 'SDN 网络', link: '/guide/sdn' },
            { text: '集群成员与磁盘初始化', link: '/guide/cluster-members' },
            { text: '访问控制', link: '/guide/access' },
            { text: '任务与节点运维', link: '/guide/tasks-node-ops' }
          ]
        }
      ],
      '/developer/': [
        {
          text: '开发者',
          collapsed: false,
          items: [
            { text: '技术架构', link: '/developer/architecture' },
            { text: '开发指南', link: '/developer/development' },
            { text: '测试', link: '/developer/testing' },
            { text: '安全与边界', link: '/developer/security' },
            { text: '更新日志', link: '/developer/changelog' }
          ]
        }
      ]
    },

    outline: {
      level: [2, 3],
      label: '本页目录'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清除查询条件',
            backButtonTitle: '返回',
            noResultsText: '没有找到相关结果',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/HtmACG/PVE-VDI' }
    ],

    editLink: {
      pattern: 'https://github.com/HtmACG/PVE-VDI/edit/main/docs/:path',
      text: '在 GitHub 编辑此页'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',

    footer: {
      message: '基于 GNU GPL-3.0-only 协议开源',
      copyright: 'Copyright © 2026 PVE VDI contributors'
    }
  }
})
