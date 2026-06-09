import { defineConfig } from 'vitepress'
import type { ConfigEnv } from 'vite'

export default ({ command }: ConfigEnv) => defineConfig({
  title: 'Tellux',
  description: 'Three.js GIS viewer for terrain, imagery, 3D Tiles, atmosphere, clouds, and post-processing.',
  base: '/docs/',
  outDir: '../examples/public/docs',
  cleanUrls: true,
  lastUpdated: true,
  lang: 'zh-CN',
  themeConfig: {
    logo: { text: 'T' },
    siteTitle: 'Tellux',
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/viewer' },
      { text: '能力参考', link: '/capabilities/3d-tiles-renderer' },
      {
        text: 'Sandcastle',
        link:
          command === 'serve'
            ? 'http://127.0.0.1:5173/sandcastle.html'
            : '../../sandcastle.html'
      }
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: 'Viewer 基础', link: '/guide/viewer' },
          { text: '地形与影像', link: '/guide/terrain-and-imagery' },
          { text: '3D Tiles', link: '/guide/3d-tiles' }
        ]
      },
      {
        text: 'API 文档',
        items: [
          { text: 'Viewer', link: '/api/viewer' },
          { text: '类型入口', link: '/api/types' }
        ]
      },
      {
        text: '能力参考',
        items: [
          { text: '3D Tiles Renderer', link: '/capabilities/3d-tiles-renderer' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Bro-B/tellux' }
    ],
    search: {
      provider: 'local'
    },
    outline: {
      label: '本页目录',
      level: [2, 3]
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
})
