import { onLocaleChange, pickLocalized, t } from "./i18n"
import {
  communityShowcase,
  type CommunityShowcaseItem,
} from "./showcase-data"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function pickTitle(item: CommunityShowcaseItem): string {
  return pickLocalized({ zh: item.title.zh, en: item.title.en ?? item.title.zh })
}

function pickDescription(item: CommunityShowcaseItem): string {
  return pickLocalized({
    zh: item.description.zh,
    en: item.description.en ?? item.description.zh,
  })
}

function formatMeta(item: CommunityShowcaseItem): string {
  return item.author
    ? `${escapeHtml(item.author)} · ${escapeHtml(item.date)}`
    : escapeHtml(item.date)
}

function createCard(item: CommunityShowcaseItem): HTMLElement {
  const title = pickTitle(item)
  const description = pickDescription(item)

  const card = document.createElement("a")
  card.className = "portal-community__card"
  card.href = item.url
  card.target = "_blank"
  card.rel = "noopener"
  card.setAttribute("aria-label", `${title}（${t("portal.community.open")}）`)

  card.innerHTML = `
    <img
      src="${escapeHtml(item.cover)}"
      alt="${escapeHtml(title)}"
      loading="lazy"
      decoding="async"
    />
    <span class="portal-community__cover-fallback" aria-hidden="true">${escapeHtml(
      title.charAt(0)
    )}</span>
    <span class="portal-community__tags">
      ${item.tags
        .map((tag) => `<span class="portal-community__tag">${escapeHtml(tag)}</span>`)
        .join("")}
    </span>
    <span class="portal-community__body">
      <span class="portal-community__title">${escapeHtml(title)}</span>
      <span class="portal-community__desc">${escapeHtml(description)}</span>
      <span class="portal-community__meta">${formatMeta(item)}</span>
    </span>
  `

  card.querySelector("img")?.addEventListener("error", () => {
    card.classList.add("is-broken")
  })

  return card
}

/** 按 date 降序排序（最新在前）。 */
function sortShowcase(items: CommunityShowcaseItem[]): CommunityShowcaseItem[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))
}

/** 关键词 + 标签过滤：关键词匹配标题 / 描述，标签需全部命中。 */
function filterShowcase(
  items: CommunityShowcaseItem[],
  query: string,
  tags: readonly string[]
): CommunityShowcaseItem[] {
  const normalized = query.trim().toLowerCase()
  return items.filter((item) => {
    if (tags.length > 0 && !tags.every((tag) => item.tags.includes(tag))) {
      return false
    }
    if (!normalized) return true
    const title = pickTitle(item).toLowerCase()
    const description = pickDescription(item).toLowerCase()
    return title.includes(normalized) || description.includes(normalized)
  })
}

/**
 * 首页精选条：展示最新 3 条 + 「查看全部」入口，空数据时隐藏整块。
 * 语言切换时自动重渲染。
 * Homepage featured strip: latest 3 items + "view all" entry, hidden when empty.
 */
export function mountFeaturedStrip(): void {
  const section = document.querySelector<HTMLElement>("[data-featured]")
  const grid = document.querySelector<HTMLElement>("[data-featured-grid]")
  if (!section || !grid) return

  const render = () => {
    const featured = sortShowcase(communityShowcase).slice(0, 3)
    section.hidden = featured.length === 0
    if (featured.length === 0) {
      grid.replaceChildren()
      return
    }
    grid.replaceChildren(...featured.map(createCard))
  }

  render()
  onLocaleChange(render)
}

/**
 * gallery 页：全量渲染 + 关键词搜索 + 标签筛选。
 * Gallery page: full grid with keyword search and tag filtering.
 */
export function mountGallery(): void {
  const root = document.querySelector<HTMLElement>("[data-gallery]")
  const grid = document.querySelector<HTMLElement>("[data-gallery-grid]")
  const searchInput = document.querySelector<HTMLInputElement>("[data-gallery-search]")
  const tagsBar = document.querySelector<HTMLElement>("[data-gallery-tags]")
  const countLabel = document.querySelector<HTMLElement>("[data-gallery-count]")
  const emptyResult = document.querySelector<HTMLElement>("[data-gallery-empty]")
  const emptyAll = document.querySelector<HTMLElement>("[data-gallery-empty-all]")
  if (!root || !grid) return

  let query = ""
  let selectedTags: string[] = []

  const allTags = () => {
    const set = new Set<string>()
    for (const item of communityShowcase) {
      for (const tag of item.tags) set.add(tag)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  const renderTags = () => {
    if (!tagsBar) return
    const tags = allTags()
    tagsBar.replaceChildren(
      ...tags.map((tag) => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "gallery-tag"
        button.dataset.tag = tag
        button.setAttribute("aria-pressed", String(selectedTags.includes(tag)))
        button.textContent = tag
        if (selectedTags.includes(tag)) button.classList.add("is-active")
        button.addEventListener("click", () => {
          selectedTags = selectedTags.includes(tag)
            ? selectedTags.filter((t) => t !== tag)
            : [...selectedTags, tag]
          render()
        })
        return button
      })
    )
  }

  const render = () => {
    if (searchInput && searchInput.value !== query) {
      query = searchInput.value
    }
    const filtered = filterShowcase(
      sortShowcase(communityShowcase),
      query,
      selectedTags
    )

    const total = communityShowcase.length
    if (countLabel) {
      countLabel.textContent = filtered.length === total
        ? t("gallery.count.all", { total })
        : t("gallery.count.filtered", { shown: filtered.length, total })
    }

    grid.replaceChildren(...filtered.map(createCard))

    if (emptyAll) emptyAll.hidden = total > 0
    if (emptyResult) {
      emptyResult.hidden = total === 0 || filtered.length > 0
    }
    grid.hidden = filtered.length === 0
  }

  searchInput?.addEventListener("input", render)
  renderTags()
  render()
  onLocaleChange(render)
}
