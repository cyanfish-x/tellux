import { defineConfig } from 'vitepress'
import type { ConfigEnv } from 'vite'

export default ({ command }: ConfigEnv) => defineConfig({
  title: 'Tellux',
  description: 'Three.js GIS viewer for terrain, imagery, 3D Tiles, atmosphere, clouds, and post-processing.',
  // 开发用相对 base（本地预览），构建用 /tellux/docs/（GitHub Pages 仓库名前缀）。
  // 不通过 process.env 传 base，避免 Windows + Git Bash 的 MSYS2 路径转换把
  // "/tellux/docs/" 错误改写成 "D:/Program Files/Git/tellux/docs/"。
  base: command === 'serve' ? '/' : '/tellux/docs/',
  outDir: process.env.DOCS_OUT_DIR || '../examples/public/docs',
  cleanUrls: true,
  lastUpdated: true,
  lang: 'zh-CN',
  themeConfig: {
    logo: { text: 'T' },
    // logoLink / Sandcastle 指向示例主站（与文档站同源但属不同子站）。
    // 必须带 target：VitePress 的全局 click 拦截器只对「同源 + treatAsHtml」
    // 的 <a> 做 SPA 拦截，但对「带 target 属性」的链接一律放行（router.js
    // 中 `link.hasAttribute('target')` 即 return）。否则点击会被劫持成
    // 文档站内部路由，取不到对应 markdown 就渲染 404，表现为「点了没跳走，
    // 反而在文档页显示 404」。target="_self" 仍为当前页跳转，符合预期。
    logoLink:
      command === 'serve'
        ? 'http://127.0.0.1:5173/'
        : { link: '../../index.html', target: '_self', rel: 'noopener' },
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
            : '../../sandcastle.html',
        // nav 项的 target/rel 与 link 平级（link 始终是 string）。
        // 不能像 logoLink 那样把 link 写成对象 —— NavItemWithLink.link 类型
        // 只接受 string，写成对象会导致 SSR 阶段 normalizeLink 收到对象而崩。
        ...(command === 'serve'
          ? {}
          : { target: '_self', rel: 'noopener' })
      }
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: 'Viewer 基础', link: '/guide/viewer' },
          { text: '光照模式与参数', link: '/guide/lighting' },
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
      { icon: 'github', link: 'https://github.com/cyanfish-x/tellux' }
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
