/**
 * 实验示例页 id（即 `examples/<id>.html` 的文件名）。只在本地开发服务中提供：
 * 生产构建不打包这些 HTML 入口，Sandcastle 列表也不展示；开发时卡片带“实验”角标。
 * 新增实验页只需在此登记。
 *
 * Experimental example page ids (`examples/<id>.html`). Served only by the local dev server:
 * production builds omit their HTML entries and Sandcastle hides them; in dev their cards carry an
 * "Experimental" badge. Register new experimental pages here.
 */
export const EXPERIMENTAL_EXAMPLE_IDS = [
  "rendering-stages",
  "rendering-splat-atmosphere",
  "rendering-cloud-transparency",
  "rendering-medium-integration",
  "rendering-medium-coverage",
  "rendering-refraction-medium",
] as const

const experimentalIds: ReadonlySet<string> = new Set(EXPERIMENTAL_EXAMPLE_IDS)

/** 判断示例页是否为实验示例。 Whether the example page id is experimental. */
export function isExperimentalExample(id: string): boolean {
  return experimentalIds.has(id)
}
