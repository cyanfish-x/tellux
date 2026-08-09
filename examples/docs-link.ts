/**
 * 文档链接解析：开发时文档站独立跑在根路径（vitepress，无 /docs base），
 * 端口可能因占用回退，由 VITE_TELLUX_DOCS_ORIGIN 注入实际地址；构建后
 * 使用相对路径 ./docs/。
 *
 * Resolves the docs link: in dev the VitePress docs run on a separate root
 * (no /docs base) with a possibly fallback port injected via
 * VITE_TELLUX_DOCS_ORIGIN; in production it uses the relative ./docs/ path.
 */
export function getDocsUrl(): string {
  const isLocalHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "::1"

  if (isLocalHost && import.meta.env.DEV) {
    const origin = (
      import.meta.env.VITE_TELLUX_DOCS_ORIGIN || "http://127.0.0.1:5174"
    ).replace(/\/$/, "")
    return `${origin}/`
  }

  return new URL("./docs/", window.location.href).toString()
}

/** 将文档链接写入 [data-docs-link] 元素。 */
export function mountDocsLink(): void {
  const docsLink = document.querySelector<HTMLAnchorElement>("[data-docs-link]")
  if (docsLink) docsLink.href = getDocsUrl()
}
