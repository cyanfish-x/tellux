import { defineConfig } from 'vitepress'
import type { ConfigEnv } from 'vite'

export default ({ command }: ConfigEnv) => defineConfig({
  title: 'Tellux',
  description: 'An open-source 3D Earth Engine built on Three.js for digital globes, digital twins, 3D maps, and modern web applications.',
  // 开发用相对 base（本地预览）。
  // 构建时按部署目标区分：
  //   - GitHub Pages（仓库名 tellux 作为前缀）：DEPLOY_TARGET=ghpages → /tellux/docs/
  //   - 自部署站点（docs 与 examples 主站同级）：→ /docs/
  // 用 DEPLOY_TARGET（不带 / 的标志值）区分，而不是直接传 base：
  // Windows + Git Bash 的 MSYS2 会把 "/tellux/docs/" 这种以 / 开头的值
  // 改写成绝对路径（如 D:/Program Files/Git/tellux/docs/）。
  // command 只有 serve/build 两个值，无法区分两种部署，故必须额外信号。
  base:
    command === 'serve'
      ? '/'
      : process.env.DEPLOY_TARGET === 'ghpages'
        ? '/tellux/docs/'
        : '/docs/',
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
          { text: '相机控制', link: '/guide/camera' },
          { text: '交互与拾取', link: '/guide/interaction' },
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
