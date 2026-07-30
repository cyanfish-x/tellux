import * as THREE from 'three'
import { OutlineEffect } from 'postprocessing'
import type { ColorInput } from '../types'
import {
  resolveColor as defaultResolveColor,
  type ResolveColor
} from '../entities/invertToneMapping'

export interface OutlineHighlighterStyle {
  enabled: boolean
  color: ColorInput
  hiddenColor: ColorInput
  edgeStrength: number
  xray: boolean
}

/**
 * 整 Object3D 后处理描边高亮，包装 pmndrs `OutlineEffect`。
 *
 * Whole-object post-process outline highlighter wrapping pmndrs `OutlineEffect`.
 */
export class OutlineHighlighter {
  readonly effect: OutlineEffect | null
  private selectObject: THREE.Object3D | null = null
  private hoverObject: THREE.Object3D | null = null
  private style: OutlineHighlighterStyle

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    style: OutlineHighlighterStyle,
    private readonly webglAvailable: boolean,
    private readonly resolveColor: ResolveColor = defaultResolveColor
  ) {
    this.style = { ...style }
    this.effect = webglAvailable
      ? new OutlineEffect(scene, camera, {
          edgeStrength: style.edgeStrength,
          xRay: style.xray,
          pulseSpeed: 0
        })
      : null
    this.applyStyleToEffect()
  }

  setStyle(style: OutlineHighlighterStyle) {
    this.style = { ...style }
    this.applyStyleToEffect()
    this.syncSelection()
  }

  setSelect(object: THREE.Object3D | null) {
    this.selectObject = object
    this.syncSelection()
  }

  setHover(object: THREE.Object3D | null) {
    this.hoverObject = object
    this.syncSelection()
  }

  clearSelect() {
    this.setSelect(null)
  }

  clearHover() {
    this.setHover(null)
  }

  clear() {
    this.selectObject = null
    this.hoverObject = null
    this.syncSelection()
  }

  dispose() {
    this.clear()
    this.effect?.dispose()
  }

  private applyStyleToEffect() {
    if (!this.effect) return
    this.effect.edgeStrength = this.style.edgeStrength
    this.effect.xRay = this.style.xray
    this.effect.visibleEdgeColor.copy(this.resolveColor(this.style.color))
    this.effect.hiddenEdgeColor.copy(this.resolveColor(this.style.hiddenColor))
  }

  private syncSelection() {
    if (!this.effect) return
    this.effect.selection.clear()
    if (!this.style.enabled) return

    const roots: THREE.Object3D[] = []
    if (this.selectObject) roots.push(this.selectObject)
    if (this.hoverObject && this.hoverObject !== this.selectObject) {
      roots.push(this.hoverObject)
    }
    // OutlineEffect 用 selection layer 做 mask：layer 只写在加入 selection 的节点上，
    // 子 Mesh 不会继承。传入 Group/模型根时必须展开为可渲染网格。
    // OutlineEffect enables its selection layer only on objects added to selection;
    // child meshes do not inherit it, so Group/model roots must expand to meshes.
    const objects = collectOutlineMeshes(roots)
    if (objects.length > 0) {
      this.effect.selection.set(objects)
    }
  }
}

/**
 * 收集 OutlineEffect 需要加入 selection 的网格（含 SkinnedMesh / InstancedMesh）。
 *
 * Collects meshes that OutlineEffect must put into selection (incl. skinned / instanced).
 */
function collectOutlineMeshes(roots: THREE.Object3D[]): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh !== true) return
      if (seen.has(child.uuid)) return
      seen.add(child.uuid)
      meshes.push(child)
    })
  }
  return meshes
}
