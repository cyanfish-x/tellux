import { defineConfig } from 'vitepress'
import type { ConfigEnv } from 'vite'

// pnpm dev 会通过 scripts/dev.mjs 注入实际 examples origin；单独 docs:dev 时回落到 5173。
const examplesOrigin = (process.env.TELLUX_EXAMPLES_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '')

export default ({ command }: ConfigEnv) => defineConfig({
  title: 'Tellux',
  description: 'An open-source 3D Earth engine for the web, for building digital globes, digital twins, 3D maps, and other geospatial 3D apps on real geographic coordinates and physical scale.',
  // 开发用相对 base（本地预览）；构建后 docs 与 examples 主站同级。
  base: command === 'serve' ? '/' : '/docs/',
  outDir: process.env.DOCS_OUT_DIR || '../examples/public/docs',
  cleanUrls: true,
  lastUpdated: true,
  lang: 'zh-CN',
  // docs 构建进 examples/public/docs；Markdown 里用 ../../xxx.html 跳到示例站根。
  // 这些页面不在 VitePress 源树内，死链检查会误报，需显式忽略。
  ignoreDeadLinks: [
    (url: string) => /(?:^|\/)\.\.\/\.\.\//.test(url)
  ],
  // 主题 token 在仓库根 theme/，开发服务器需要放行 docs/ 以外的文件。
  vite: {
    server: {
      fs: {
        allow: ['..']
      }
    }
  },
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
        ? `${examplesOrigin}/`
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
            ? `${examplesOrigin}/sandcastle.html`
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
          { text: '从 0.2 迁移到 0.3', link: '/guide/migration-0.3' },
          { text: 'Viewer 基础', link: '/guide/viewer' },
          { text: '相机控制', link: '/guide/camera' },
          { text: '交互与拾取', link: '/guide/interaction' },
          { text: '高亮', link: '/guide/highlight' },
          { text: '地形与影像', link: '/guide/terrain-and-imagery' },
          { text: '3D Tiles', link: '/guide/3d-tiles' },
          { text: '实体绘制', link: '/guide/entities' },
          { text: '坐标系与自定义对象', link: '/guide/coordinate-system' },
          { text: 'HISM 大规模实例化', link: '/guide/hism' },
          { text: '光照模式与参数', link: '/guide/lighting' },
          { text: '大气、云与后处理', link: '/guide/atmosphere-and-effects' },
          { text: '数据源', link: '/guide/data-sources' },
          { text: '能力边界与已知限制', link: '/guide/limitations' }
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
