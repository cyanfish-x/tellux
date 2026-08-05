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
    id: "test-entry",
    title: { zh: "测试案例：智慧城市数字孪生", en: "Test case: Smart city digital twin" },
    description: {
      zh: "这是一个用于验证展示页效果的测试条目，正式收录前会被替换。",
      en: "A test entry to verify the showcase page; will be replaced before publishing.",
    },
    cover: "https://picture.cyanfish.site/202607211408198.png",
    url: "https://example.com",
    tags: ["测试", "数字孪生"],
    author: "Tellux",
    date: "2026-08-05",
  },
]
