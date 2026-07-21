import type * as THREE from 'three'
import type { HighlightTarget, Picked3DTilesFeature } from '../types'
import type { HighlightSettings } from '../scene/HighlightSettings'
import { OutlineHighlighter } from './OutlineHighlighter'
import { OverlayHighlighter } from './OverlayHighlighter'

type ResolvedHighlightTarget =
  | { kind: 'object'; object: THREE.Object3D; raw: HighlightTarget }
  | { kind: 'tilesFeature'; feature: Picked3DTilesFeature; raw: HighlightTarget }

function isObject3D(value: unknown): value is THREE.Object3D {
  return Boolean(value && typeof value === 'object' && (value as THREE.Object3D).isObject3D)
}

function isTilesFeature(value: unknown): value is Picked3DTilesFeature {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'layerId' in value &&
      'object' in value &&
      'featureId' in value &&
      'cartographic' in value
  )
}

export function resolveHighlightTarget(
  target: HighlightTarget
): ResolvedHighlightTarget | null {
  if (isObject3D(target)) {
    return { kind: 'object', object: target, raw: target }
  }
  if (isTilesFeature(target)) {
    return { kind: 'tilesFeature', feature: target, raw: target }
  }
  if (typeof target === 'object' && target !== null && 'type' in target) {
    if (target.type === 'object') {
      return { kind: 'object', object: target.object, raw: target }
    }
    if (target.type === 'tilesFeature') {
      return { kind: 'tilesFeature', feature: target.feature, raw: target }
    }
  }
  return null
}

function featureKey(feature: Picked3DTilesFeature) {
  return `${feature.layerId}:${feature.object.uuid}:${feature.featureId ?? 'object'}`
}

export interface HighlightManagerOptions {
  scene: THREE.Scene
  camera: THREE.Camera
  settings: HighlightSettings
  webglOutlineAvailable: boolean
}

/**
 * 统一高亮门面：按目标类型路由到描边或叠加几何。
 *
 * Unified highlight facade that routes targets to outline or overlay highlighters.
 */
export class HighlightManager {
  private readonly outline: OutlineHighlighter
  private readonly selectOverlay: OverlayHighlighter
  private readonly hoverOverlay: OverlayHighlighter
  private selected: ResolvedHighlightTarget | null = null
  private hovered: ResolvedHighlightTarget | null = null

  constructor(private readonly options: HighlightManagerOptions) {
    const { settings } = options
    this.outline = new OutlineHighlighter(
      options.scene,
      options.camera,
      {
        enabled: settings.outline.enabled,
        color: settings.outline.color,
        hiddenColor: settings.outline.hiddenColor,
        edgeStrength: settings.outline.edgeStrength,
        xray: settings.outline.xray
      },
      options.webglOutlineAvailable
    )
    this.selectOverlay = new OverlayHighlighter(
      options.scene,
      settings.overlay.color,
      settings.overlay.opacity
    )
    this.hoverOverlay = new OverlayHighlighter(
      options.scene,
      settings.overlay.hoverColor,
      settings.overlay.hoverOpacity
    )
    this.syncStyleFromSettings()
  }

  /** 供 PostProcessingManager 挂接的 OutlineEffect；WebGPU 下为 `null`。 */
  get outlineEffect() {
    return this.outline.effect
  }

  /**
   * 设置当前选中高亮（单选，替换）。
   *
   * Sets the current selection highlight (single-select, replaces).
   */
  set(target: HighlightTarget) {
    const resolved = resolveHighlightTarget(target)
    if (!resolved) {
      this.clear()
      return
    }
    this.selected = resolved
    this.applySelect()
    if (
      this.hovered?.kind === 'tilesFeature' &&
      resolved.kind === 'tilesFeature' &&
      featureKey(this.hovered.feature) === featureKey(resolved.feature)
    ) {
      this.hovered = null
      this.applyHover()
    } else if (
      this.hovered?.kind === 'object' &&
      resolved.kind === 'object' &&
      this.hovered.object === resolved.object
    ) {
      this.hovered = null
      this.applyHover()
    }
  }

  /**
   * 清除选中高亮。
   *
   * Clears the selection highlight.
   */
  clear() {
    this.selected = null
    this.applySelect()
  }

  /**
   * 设置悬停高亮；传入 `null` 清除。
   *
   * Sets the hover highlight; pass `null` to clear.
   */
  setHover(target: HighlightTarget | null) {
    if (target === null) {
      this.hovered = null
      this.applyHover()
      return
    }
    const resolved = resolveHighlightTarget(target)
    if (!resolved) {
      this.hovered = null
      this.applyHover()
      return
    }
    if (
      this.selected?.kind === 'tilesFeature' &&
      resolved.kind === 'tilesFeature' &&
      featureKey(this.selected.feature) === featureKey(resolved.feature)
    ) {
      this.hovered = resolved
      this.hoverOverlay.clear()
      this.outline.clearHover()
      return
    }
    if (
      this.selected?.kind === 'object' &&
      resolved.kind === 'object' &&
      this.selected.object === resolved.object
    ) {
      this.hovered = resolved
      this.hoverOverlay.clear()
      this.outline.clearHover()
      return
    }
    this.hovered = resolved
    this.applyHover()
  }

  /**
   * 当前选中目标；无选中时为 `null`。
   *
   * Current selection target, or `null`.
   */
  get() {
    return this.selected?.raw ?? null
  }

  /**
   * 当前悬停目标；无悬停时为 `null`。
   *
   * Current hover target, or `null`.
   */
  getHover() {
    return this.hovered?.raw ?? null
  }

  /**
   * 从 `scene.highlight` 同步样式到两个 highlighter。
   *
   * Syncs styles from `scene.highlight` into both highlighters.
   */
  syncStyleFromSettings() {
    const { settings } = this.options
    this.outline.setStyle({
      enabled: settings.outline.enabled,
      color: settings.outline.color,
      hiddenColor: settings.outline.hiddenColor,
      edgeStrength: settings.outline.edgeStrength,
      xray: settings.outline.xray
    })
    this.selectOverlay.enabled = settings.overlay.enabled
    this.hoverOverlay.enabled = settings.overlay.enabled
    this.selectOverlay.setStyle(settings.overlay.color, settings.overlay.opacity)
    this.hoverOverlay.setStyle(
      settings.overlay.hoverColor,
      settings.overlay.hoverOpacity
    )
    if (!settings.overlay.enabled) {
      this.selectOverlay.clear()
      this.hoverOverlay.clear()
    } else {
      this.applySelect()
      this.applyHover()
    }
  }

  dispose() {
    this.clear()
    this.hovered = null
    this.applyHover()
    this.outline.dispose()
    this.selectOverlay.dispose()
    this.hoverOverlay.dispose()
  }

  private applySelect() {
    this.outline.clearSelect()
    this.selectOverlay.clear()
    if (!this.selected) return

    if (this.selected.kind === 'object') {
      this.outline.setSelect(this.selected.object)
      return
    }
    if (this.options.settings.overlay.enabled) {
      this.selectOverlay.show(this.selected.feature)
    }
  }

  private applyHover() {
    this.outline.clearHover()
    this.hoverOverlay.clear()
    if (!this.hovered) return

    if (
      this.selected?.kind === 'tilesFeature' &&
      this.hovered.kind === 'tilesFeature' &&
      featureKey(this.selected.feature) === featureKey(this.hovered.feature)
    ) {
      return
    }
    if (
      this.selected?.kind === 'object' &&
      this.hovered.kind === 'object' &&
      this.selected.object === this.hovered.object
    ) {
      return
    }

    if (this.hovered.kind === 'object') {
      this.outline.setHover(this.hovered.object)
      return
    }
    if (this.options.settings.overlay.enabled) {
      this.hoverOverlay.show(this.hovered.feature)
    }
  }
}
