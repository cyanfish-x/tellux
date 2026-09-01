/**
 * 示例页统一控件面板（leva 风格）：整面板折叠 + group 折叠。
 *
 * Shared example control panel (leva-style): panel fold + folder fold.
 *
 * Sandcastle 会剥离 import，需在 runner 中注入 `setupExamplePanels`。
 */

import { t } from "./i18n"

const TRANSITION_MS = 240

/**
 * 扫描并增强页面上所有 `.example-panel`（及兼容旧类名 `.leva-panel`）。
 * Enhances all `.example-panel` / `.leva-panel` roots on the page.
 */
export function setupExamplePanels(root: ParentNode = document) {
  const panels = new Set<HTMLElement>()

  if (root instanceof HTMLElement && root.matches('.example-panel, .leva-panel')) {
    panels.add(root)
  }

  root
    .querySelectorAll<HTMLElement>('.example-panel, .leva-panel')
    .forEach((panel) => panels.add(panel))

  panels.forEach((panel) => {
    const fold = panel.querySelector<HTMLButtonElement>(
      ':scope > .example-panel__chrome > .example-panel__fold, :scope > .leva-panel__chrome > .leva-panel__fold, :scope > .example-panel__chrome > .leva-panel__fold, :scope > .leva-panel__chrome > .example-panel__fold'
    )
    if (fold) setupExamplePanelCollapse(panel, fold)
  })

  setupExampleFolderTransitions(root)
}

/** @deprecated 使用 {@link setupExamplePanels} */
export function setupLevaFolderTransitions(root: ParentNode = document) {
  setupExampleFolderTransitions(root)
}

/** @deprecated 使用 {@link setupExamplePanels} */
export function setupLevaPanelCollapse(
  panel: HTMLElement,
  toggle: HTMLButtonElement
) {
  setupExamplePanelCollapse(panel, toggle)
}

export function setupExampleFolderTransitions(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLDetailsElement>(
      '.example-panel__folder, .leva-folder'
    )
    .forEach((folder) => {
      const summary = folder.querySelector(
        ':scope > .example-panel__folder-summary, :scope > .leva-folder__summary'
      )
      const collapse = folder.querySelector<HTMLElement>(
        ':scope > .example-panel__folder-collapse, :scope > .leva-folder__collapse'
      )
      if (!(summary instanceof HTMLElement) || !collapse) return

      syncCollapseHeight(collapse, folder.open)

      summary.addEventListener('click', (event) => {
        event.preventDefault()
        if (folder.dataset.examplePanelAnimating === '1') return
        animateFolder(folder, collapse, !folder.open)
      })
    })
}

export function setupExamplePanelCollapse(
  panel: HTMLElement,
  toggle: HTMLButtonElement
) {
  const collapse = panel.querySelector<HTMLElement>(
    ':scope > .example-panel__collapse, :scope > .leva-panel__collapse'
  )
  if (!collapse) return

  const setExpanded = (expanded: boolean) => {
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    toggle.title = expanded ? t({ zh: "收起面板", en: "Collapse panel" }) : t({ zh: "展开面板", en: "Expand panel" })
    toggle.setAttribute(
      'aria-label',
      expanded ? t({ zh: "收起面板", en: "Collapse panel" }) : t({ zh: "展开面板", en: "Expand panel" })
    )
    panel.classList.toggle('example-panel--collapsed', !expanded)
    panel.classList.toggle('leva-panel--collapsed', !expanded)
  }

  setExpanded(true)
  syncCollapseHeight(collapse, true)

  toggle.addEventListener('click', () => {
    if (panel.dataset.examplePanelAnimating === '1') return
    const nextOpen = panel.classList.contains('example-panel--collapsed')
      || panel.classList.contains('leva-panel--collapsed')
    panel.dataset.examplePanelAnimating = '1'
    setExpanded(nextOpen)
    runHeightTransition(collapse, nextOpen, () => {
      delete panel.dataset.examplePanelAnimating
    })
  })
}

function animateFolder(
  folder: HTMLDetailsElement,
  collapse: HTMLElement,
  open: boolean
) {
  folder.dataset.examplePanelAnimating = '1'
  if (open) {
    folder.open = true
    runHeightTransition(collapse, true, () => {
      delete folder.dataset.examplePanelAnimating
    })
    return
  }
  runHeightTransition(collapse, false, () => {
    folder.open = false
    delete folder.dataset.examplePanelAnimating
  })
}

function syncCollapseHeight(collapse: HTMLElement, open: boolean) {
  if (open) {
    collapse.style.overflow = ''
    collapse.style.height = 'auto'
    return
  }
  collapse.style.overflow = 'hidden'
  collapse.style.height = '0px'
}

function runHeightTransition(
  collapse: HTMLElement,
  open: boolean,
  onDone: () => void
) {
  const inner = collapse.firstElementChild as HTMLElement | null
  const target = open ? (inner?.scrollHeight ?? 0) : 0

  collapse.style.overflow = 'hidden'
  if (open) {
    collapse.style.height = '0px'
    void collapse.offsetHeight
    collapse.style.transition = `height ${TRANSITION_MS}ms ease`
    collapse.style.height = `${target}px`
  } else {
    const current =
      collapse.style.height === 'auto' || !collapse.style.height
        ? collapse.scrollHeight
        : collapse.getBoundingClientRect().height
    collapse.style.height = `${current}px`
    void collapse.offsetHeight
    collapse.style.transition = `height ${TRANSITION_MS}ms ease`
    collapse.style.height = '0px'
  }

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    collapse.removeEventListener('transitionend', onEnd)
    window.clearTimeout(timer)
    collapse.style.transition = ''
    if (open) {
      collapse.style.height = 'auto'
      collapse.style.overflow = ''
    }
    onDone()
  }

  const onEnd = (event: TransitionEvent) => {
    if (event.target !== collapse || event.propertyName !== 'height') return
    finish()
  }

  collapse.addEventListener('transitionend', onEnd)
  const timer = window.setTimeout(finish, TRANSITION_MS + 80)
}
