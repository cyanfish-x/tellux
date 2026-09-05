import type * as THREE from 'three'
import type { OutlineEffect } from 'postprocessing'
import type {
  HighlightTarget,
  HismPickResult,
  Picked3DTilesFeature,
  ViewerPickResult
} from '../types'
import type { HighlightSettings } from '../scene/HighlightSettings'
import {
  resolveColor as defaultResolveColor,
  type ResolveColor
} from '../entities/invertToneMapping'
import { OutlineHighlighter } from './OutlineHighlighter'
import { OverlayHighlighter } from './OverlayHighlighter'
import {
  HismInstanceHighlighter,
  hismPickKey,
  type ResolveHismInstanceParts
} from './HismInstanceHighlighter'

type ResolvedHighlightTarget =
  | { kind: 'object'; object: THREE.Object3D; raw: HighlightTarget }
  | { kind: 'tilesFeature'; feature: Picked3DTilesFeature; raw: HighlightTarget }
  | { kind: 'hismInstance'; pick: HismPickResult; raw: HighlightTarget }

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

function isHismPickResult(value: unknown): value is HismPickResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'layerId' in value &&
      'clusterKey' in value &&
      'archetypeIndex' in value &&
      'instanceId' in value &&
      'partIndex' in value &&
      !('cartographic' in value) &&
      !('object' in value) &&
      !('type' in value)
  )
}

function isViewerPickResult(value: unknown): value is ViewerPickResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      'distance' in value &&
      typeof (value as { distance: unknown }).distance === 'number'
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
  if (isHismPickResult(target)) {
    return { kind: 'hismInstance', pick: target, raw: target }
  }
  if (isViewerPickResult(target)) {
    if (target.type === 'entity') return null
    if (target.type === 'tilesFeature') {
      return { kind: 'tilesFeature', feature: target.feature, raw: target }
    }
    if (target.type === 'hismInstance') {
      return { kind: 'hismInstance', pick: target.instance, raw: target }
    }
    return { kind: 'object', object: target.object.object, raw: target }
  }
  if (typeof target === 'object' && target !== null && 'type' in target) {
    if (target.type === 'object') {
      return { kind: 'object', object: target.object, raw: target }
    }
    if (target.type === 'tilesFeature') {
      return { kind: 'tilesFeature', feature: target.feature, raw: target }
    }
    if (target.type === 'hismInstance') {
      return { kind: 'hismInstance', pick: target.pick, raw: target }
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
  /** 当前 Viewer 的高亮颜色解析函数。Highlight color resolver for the current Viewer. */
  resolveColor?: ResolveColor
  resolveHismInstanceParts?: ResolveHismInstanceParts
  hideHismPickMarker?: () => void
}

const highlightHost = new WeakMap<
  HighlightManager,
  {
    syncStyleFromSettings: () => void
    update: () => void
    readonly outlineEffect: OutlineEffect | null
  }
>()

export function syncHighlightStyleFromSettings(manager: HighlightManager) {
  highlightHost.get(manager)?.syncStyleFromSettings()
}

export function updateHighlightManager(manager: HighlightManager) {
  highlightHost.get(manager)?.update()
}

export function getHighlightOutlineEffect(manager: HighlightManager) {
  return highlightHost.get(manager)?.outlineEffect ?? null
}

/**
 * 统一高亮门面：按目标类型路由到描边或叠加几何，并承载 `outline` / `overlay` 样式。
 *
 * Unified highlight facade that routes targets to outline or overlay
 * highlighters and owns `outline` / `overlay` style.
 */
export class HighlightManager {
  private readonly outlineHighlighter: OutlineHighlighter
  private readonly selectOverlay: OverlayHighlighter
  private readonly hoverOverlay: OverlayHighlighter
  private readonly selectHism: HismInstanceHighlighter | null
  private readonly hoverHism: HismInstanceHighlighter | null
  private selected: ResolvedHighlightTarget | null = null
  private hovered: ResolvedHighlightTarget | null = null

  constructor(private readonly options: HighlightManagerOptions) {
    const { settings } = options
    const resolveColor = options.resolveColor ?? defaultResolveColor
    this.outlineHighlighter = new OutlineHighlighter(
      options.scene,
      options.camera,
      {
        enabled: settings.outline.enabled,
        color: settings.outline.color,
        hiddenColor: settings.outline.hiddenColor,
        edgeStrength: settings.outline.edgeStrength,
        xray: settings.outline.xray
      },
      options.webglOutlineAvailable,
      resolveColor
    )
    this.selectOverlay = new OverlayHighlighter(
      options.scene,
      settings.overlay.color,
      settings.overlay.opacity,
      resolveColor
    )
    this.hoverOverlay = new OverlayHighlighter(
      options.scene,
      settings.overlay.hoverColor,
      settings.overlay.hoverOpacity,
      resolveColor
    )
    if (options.resolveHismInstanceParts) {
      this.selectHism = new HismInstanceHighlighter(
        options.scene,
        options.resolveHismInstanceParts
      )
      this.hoverHism = new HismInstanceHighlighter(
        options.scene,
        options.resolveHismInstanceParts
      )
    } else {
      this.selectHism = null
      this.hoverHism = null
    }
    const self = this
    highlightHost.set(this, {
      syncStyleFromSettings: () => self.#syncStyleFromSettings(),
      update: () => self.#update(),
      get outlineEffect() {
        return self.outlineHighlighter.effect
      }
    })
    this.#syncStyleFromSettings()
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
    } else if (
      this.hovered?.kind === 'hismInstance' &&
      resolved.kind === 'hismInstance' &&
      hismPickKey(this.hovered.pick) === hismPickKey(resolved.pick)
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
      this.hoverHism?.clear()
      this.outlineHighlighter.clearHover()
      return
    }
    if (
      this.selected?.kind === 'object' &&
      resolved.kind === 'object' &&
      this.selected.object === resolved.object
    ) {
      this.hovered = resolved
      this.hoverOverlay.clear()
      this.hoverHism?.clear()
      this.outlineHighlighter.clearHover()
      return
    }
    if (
      this.selected?.kind === 'hismInstance' &&
      resolved.kind === 'hismInstance' &&
      hismPickKey(this.selected.pick) === hismPickKey(resolved.pick)
    ) {
      this.hovered = resolved
      this.hoverOverlay.clear()
      this.hoverHism?.clear()
      this.outlineHighlighter.clearHover()
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
   * 描边高亮样式。
   *
   * Outline highlight style.
   */
  get outline() {
    return this.options.settings.outline
  }

  /**
   * 叠加高亮样式。
   *
   * Overlay highlight style.
   */
  get overlay() {
    return this.options.settings.overlay
  }

  /**
   * 从 highlighter 样式同步到内部描边 / 叠加实现。
   *
   * Syncs highlighter styles into the outline and overlay implementations.
   */
  #syncStyleFromSettings() {
    const { settings } = this.options
    this.outlineHighlighter.setStyle({
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

  /**
   * 每帧同步 HISM proxy（LOD / 矩阵）；在 hismManager.update 之后调用。
   *
   * Per-frame HISM proxy sync (LOD / matrices); call after hismManager.update.
   */
  #update() {
    const selectChanged = this.selectHism?.update() ?? false
    const hoverChanged = this.hoverHism?.update() ?? false
    if (selectChanged || hoverChanged) {
      this.syncOutlineFromHismProxies()
    }
  }

  dispose() {
    this.clear()
    this.hovered = null
    this.applyHover()
    this.outlineHighlighter.dispose()
    this.selectOverlay.dispose()
    this.hoverOverlay.dispose()
    this.selectHism?.dispose()
    this.hoverHism?.dispose()
  }

  private applySelect() {
    this.outlineHighlighter.clearSelect()
    this.selectOverlay.clear()
    this.selectHism?.clear()
    if (!this.selected) return

    if (this.selected.kind === 'object') {
      this.outlineHighlighter.setSelect(this.selected.object)
      return
    }
    if (this.selected.kind === 'hismInstance') {
      this.options.hideHismPickMarker?.()
      if (!this.selectHism?.set(this.selected.pick)) {
        this.selected = null
        return
      }
      this.outlineHighlighter.setSelect(this.selectHism.getOutlineRoot())
      return
    }
    if (this.options.settings.overlay.enabled) {
      this.selectOverlay.show(this.selected.feature)
    }
  }

  private applyHover() {
    this.outlineHighlighter.clearHover()
    this.hoverOverlay.clear()
    this.hoverHism?.clear()
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
    if (
      this.selected?.kind === 'hismInstance' &&
      this.hovered.kind === 'hismInstance' &&
      hismPickKey(this.selected.pick) === hismPickKey(this.hovered.pick)
    ) {
      return
    }

    if (this.hovered.kind === 'object') {
      this.outlineHighlighter.setHover(this.hovered.object)
      return
    }
    if (this.hovered.kind === 'hismInstance') {
      if (!this.hoverHism?.set(this.hovered.pick)) {
        this.hovered = null
        return
      }
      this.outlineHighlighter.setHover(this.hoverHism.getOutlineRoot())
      return
    }
    if (this.options.settings.overlay.enabled) {
      this.hoverOverlay.show(this.hovered.feature)
    }
  }

  private syncOutlineFromHismProxies() {
    if (this.selected?.kind === 'hismInstance' && this.selectHism) {
      if (this.selectHism.currentPick) {
        this.outlineHighlighter.setSelect(this.selectHism.getOutlineRoot())
      } else {
        this.selected = null
        this.outlineHighlighter.clearSelect()
      }
    }
    if (this.hovered?.kind === 'hismInstance' && this.hoverHism) {
      if (this.hoverHism.currentPick) {
        this.outlineHighlighter.setHover(this.hoverHism.getOutlineRoot())
      } else {
        this.hovered = null
        this.outlineHighlighter.clearHover()
      }
    }
  }
}
