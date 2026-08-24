/**
 * 社区优秀案例展示数据源。
 * 维护方式：新增条目时补充一个对象，封面图上传到自己的图床后填直链 URL。
 * 排序：页面按 `date` 降序展示，最新在前。
 */

export interface CommunityShowcaseItem {
  /** 稳定唯一 id，用于去重与锚点，建议用 kebab-case。 */
  id: string
  /** 中英文标题；en 缺省时回退到 zh。 */
  title: { zh: string; en?: string }
  /** 中英文简介；en 缺省时回退到 zh。 */
  description: { zh: string; en?: string }
  /** 封面图直链（由作者图床提供，建议 16:9）。 */
  cover: string
  /** 作品地址，点击卡片后在新标签页打开。 */
  url: string
  /** 分类标签，如 数字孪生 / 智慧城市 / 三维地图。 */
  tags: string[]
  /** 作者署名（可选）。 */
  author?: string
  /** 收录日期 YYYY-MM-DD，页面按此降序。 */
  date: string
}

export const communityShowcase: CommunityShowcaseItem[] = [
  {
    id: "three-player-controller-3dtiles",
    title: {
      zh: "Google 实景 3D Tiles 第三人称漫游",
      en: "Photorealistic 3D Tiles Third-Person Explorer",
    },
    description: {
      zh: "基于 Tellux 与 Google Photorealistic 3D Tiles 的第三人称漫游 demo，支持 WASD 行走、跳跃、冲刺与飞行切换。",
      en: "Third-person exploration demo built with Tellux and Google Photorealistic 3D Tiles — walk, jump, sprint, and toggle fly mode with WASD.",
    },
    cover: "https://picture.cyanfish.site/20260824205429102.png",
    url: "https://hh-hang.github.io/three-player-controller/3dtilesScene.html",
    tags: ["3D Tiles", "Google", "漫游"],
    author: "hh-hang",
    date: "2026-08-24",
  },
]
