/**
 * leva 面板折叠：group 与整面板收起/展开（带高度过渡）。
 *
 * Fold/unfold helpers for leva panels and folders (height transitions).
 *
 * Sandcastle 会剥离 import，需在 runner 中注入同名全局参数。
 */

const FOLDER_TRANSITION_MS = 240

/**
 * 为 `.leva-folder` 提供收起/展开高度过渡。
 * Animates open/close for `.leva-folder` elements.
 */
export function setupLevaFolderTransitions(root: ParentNode = document) {
  root.querySelectorAll<HTMLDetailsElement>('.leva-folder').forEach((folder) => {
    const summary = folder.querySelector(':scope > .leva-folder__summary')
    const collapse = folder.querySelector<HTMLElement>(
      ':scope > .leva-folder__collapse'
    )
    if (!(summary instanceof HTMLElement) || !collapse) return

    syncCollapseHeight(collapse, folder.open)

    summary.addEventListener('click', (event) => {
      event.preventDefault()
      if (folder.dataset.levaAnimating === '1') return

      if (folder.open) {
        animateCollapse(folder, collapse, false)
      } else {
        animateCollapse(folder, collapse, true)
      }
    })
  })
}

/**
 * 整面板收起为仅标题栏。
 * Collapses a `.leva-panel` down to its chrome/title bar.
 */
export function setupLevaPanelCollapse(
  panel: HTMLElement,
  toggle: HTMLButtonElement
) {
  const collapse = panel.querySelector<HTMLElement>(':scope > .leva-panel__collapse')
  if (!collapse) return

  const setExpanded = (expanded: boolean) => {
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    toggle.title = expanded ? '收起面板' : '展开面板'
    toggle.setAttribute('aria-label', expanded ? '收起面板' : '展开面板')
    panel.classList.toggle('leva-panel--collapsed', !expanded)
  }

  setExpanded(true)
  syncCollapseHeight(collapse, true)

  toggle.addEventListener('click', () => {
    if (panel.dataset.levaAnimating === '1') return
    const nextOpen = panel.classList.contains('leva-panel--collapsed')
    animatePanelCollapse(panel, collapse, nextOpen, setExpanded)
  })
}

function animateCollapse(
  folder: HTMLDetailsElement,
  collapse: HTMLElement,
  open: boolean
) {
  folder.dataset.levaAnimating = '1'

  if (open) {
    folder.open = true
    runHeightTransition(collapse, true, () => {
      delete folder.dataset.levaAnimating
    })
    return
  }

  runHeightTransition(collapse, false, () => {
    folder.open = false
    delete folder.dataset.levaAnimating
  })
}

function animatePanelCollapse(
  panel: HTMLElement,
  collapse: HTMLElement,
  open: boolean,
  setExpanded: (expanded: boolean) => void
) {
  panel.dataset.levaAnimating = '1'
  setExpanded(open)
  runHeightTransition(collapse, open, () => {
    delete panel.dataset.levaAnimating
  })
}

function syncCollapseHeight(collapse: HTMLElement, open: boolean) {
  collapse.style.overflow = 'hidden'
  collapse.style.height = open ? 'auto' : '0px'
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
    collapse.style.transition = `height ${FOLDER_TRANSITION_MS}ms ease`
    collapse.style.height = `${target}px`
  } else {
    const current =
      collapse.style.height === 'auto' || !collapse.style.height
        ? collapse.scrollHeight
        : collapse.getBoundingClientRect().height
    collapse.style.height = `${current}px`
    void collapse.offsetHeight
    collapse.style.transition = `height ${FOLDER_TRANSITION_MS}ms ease`
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
  const timer = window.setTimeout(finish, FOLDER_TRANSITION_MS + 80)
}
