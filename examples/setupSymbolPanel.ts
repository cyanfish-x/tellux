import type { Viewer } from "../src"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { t } from "./i18n"

export type SymbolPanelContext = {
  viewer: Viewer
  poiIds: string[]
  labelIds: string[]
  iconIds: string[]
  multilineId: string
  clearStressSymbols: () => void
  generateStressSymbols: () => Promise<void>
  recolorFirstLabel: () => void
  clearAllSymbols: () => void
  getInitialStatus: () => string
  isStressGenerating: () => boolean
}

export function setupSymbolPanel(context: SymbolPanelContext) {
  let panel: TelluxPanel | undefined

  function setStatus(message: string) {
    panel?.setStatus(message)
  }

  function setPickReadout(message: string) {
    if (panel) panel.controls.status.pick = message
  }

  function setGroupVisible(ids: string[], visible: boolean) {
    ids.forEach((id) => {
      const entity = context.viewer.entities.getById(id)
      if (entity) entity.show = visible
    })
  }

  const symbolSchema = () =>
    ({
      display: {
        $: { label: t({ zh: "显示", en: "Display" }) },
        poi: {
          value: true,
          label: t({ zh: "POI（图标+文字）", en: "POI (icon + text)" }),
        },
        labels: {
          value: true,
          label: t({ zh: "纯文字标签", en: "Text labels" }),
        },
        icons: {
          value: true,
          label: t({ zh: "纯图标", en: "Icons only" }),
        },
        multiline: {
          value: true,
          label: t({ zh: "多行/背景", en: "Multiline / background" }),
        },
      },
      actions: {
        $: { label: t({ zh: "操作", en: "Actions" }) },
        recolor: {
          onClick: () => {
            context.recolorFirstLabel()
            setStatus(
              t({
                zh: "已切换首个文字标签填充色（未重建纹理）。",
                en: "Cycled first label fill color (texture not rebuilt).",
              })
            )
          },
          label: t({ zh: "改色（不重建）", en: "Recolor (no rebuild)" }),
        },
        clear: {
          onClick: () => {
            context.clearAllSymbols()
            setStatus(t({ zh: "已清空所有实体。", en: "All entities cleared." }))
          },
          label: t({ zh: "清空实体", en: "Clear entities" }),
        },
      },
      stress: {
        $: { label: t({ zh: "压测", en: "Stress test" }) },
        hint: {
          type: "hint" as const,
          value: t({
            zh: "输入数量后生成网格散布的 icon+text Symbol，观察 MSDF / 实例化性能。",
            en: "Generate grid-scattered icon+text symbols to stress MSDF / instancing.",
          }),
        },
        count: {
          value: 1000,
          min: 1,
          max: 20000,
          step: 1,
          label: t({ zh: "数量（1–20000）", en: "Count (1–20000)" }),
        },
        generate: {
          onClick: () => {
            void context.generateStressSymbols()
          },
          label: t({ zh: "生成压测", en: "Generate stress" }),
        },
        clearStress: {
          onClick: () => {
            context.clearStressSymbols()
            setStatus(t({ zh: "已清空压测 Symbol。", en: "Stress symbols cleared." }))
          },
          label: t({ zh: "清空压测", en: "Clear stress" }),
        },
      },
      status: {
        $: { label: t({ zh: "状态", en: "Status" }) },
        message: {
          type: "hint" as const,
          value: context.getInitialStatus(),
        },
        pick: {
          type: "hint" as const,
          label: t({ zh: "拾取", en: "Pick" }),
          value: t({ zh: "点击任意实体查看属性", en: "Click an entity to inspect properties" }),
        },
      },
    }) as const

  function bindPanelInteractions(
    currentPanel: TelluxPanel<ReturnType<typeof symbolSchema>>
  ) {
    const { controls } = currentPanel
    const cleanups: Array<() => void> = []

    cleanups.push(
      controls.effect(() => {
        void controls.display.poi
        setGroupVisible(context.poiIds, controls.display.poi)
      })
    )
    cleanups.push(
      controls.effect(() => {
        void controls.display.labels
        setGroupVisible(context.labelIds, controls.display.labels)
      })
    )
    cleanups.push(
      controls.effect(() => {
        void controls.display.icons
        setGroupVisible(context.iconIds, controls.display.icons)
      })
    )
    cleanups.push(
      controls.effect(() => {
        void controls.display.multiline
        setGroupVisible([context.multilineId, "coexist"], controls.display.multiline)
      })
    )

    if (context.isStressGenerating()) {
      currentPanel.setFieldDisabled("stress.generate", true)
      currentPanel.setFieldDisabled("stress.count", true)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }

  panel = createTelluxPanel(symbolSchema, {
    id: "symbol-panel",
    title: () => t({ zh: "图标与文字标签", en: "Icons & labels" }),
    statusPath: "status.message",
    onRebuild: bindPanelInteractions,
  })

  return {
    panel,
    setStatus,
    setPickReadout,
    getStressCount: () => Math.floor(panel!.controls.stress.count),
    setStressControlsDisabled: (disabled: boolean) => {
      if (!panel) return
      panel.setFieldDisabled("stress.generate", disabled)
      panel.setFieldDisabled("stress.count", disabled)
    },
    dispose: () => panel?.dispose(),
  }
}
