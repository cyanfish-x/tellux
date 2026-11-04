import * as THREE from 'three'
import { EffectMaterial, EffectPass, NormalPass } from 'postprocessing'
import type { SceneFrameResources } from './rendering/SceneFrameResources'

export type ThreeEffectPass = THREE.Effect & {
  enabled?: boolean
  needsSwap?: boolean
  isRenderPass?: boolean
  dispose: () => void
  recompile?: () => void
  setDeltaTime?: (deltaTime: number) => void
}

export interface ThreeRendererWithEffects extends THREE.WebGLRenderer {
  setEffects: (effects: THREE.Effect[] | null) => void
}

export class EffectPassAdapter implements ThreeEffectPass {
  enabled = true
  needsSwap: boolean
  private isInitialized = false
  private deltaTime = 0

  constructor(
    private readonly pass: EffectPass | NormalPass,
    private readonly getCamera: () => THREE.PerspectiveCamera,
    private readonly frame?: SceneFrameResources
  ) {
    this.needsSwap = this.pass.needsSwap !== false
  }

  render(
    webglRenderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number
  ) {
    if (!this.isInitialized) {
      this.pass.initialize(webglRenderer, false, THREE.HalfFloatType)
      this.pass.setSize(readBuffer.width, readBuffer.height)
      this.isInitialized = true
    }

    // postprocessing 的 pass 为 autoClear=false 的 composer 环境设计（EffectComposer
    // 全局关 autoClear，需要清屏的 pass 自带 ClearPass）。这里若保留 three 默认的
    // autoClear=true，任何向 targetA 写色的全屏 pass（SMAA / dithering / 大气，取决于
    // swap 奇偶性）都会先把 targetA 的**深度**清成 1.0——后合成阶段采样场景深度的
    // symbol 锚点遮挡会静默失效（永远判定"未遮挡"）。
    //
    // postprocessing passes are designed for autoClear=false composer environments
    // (EffectComposer disables it globally; passes that need clearing own a ClearPass).
    // With three's default autoClear=true, any fullscreen pass writing into targetA
    // (SMAA / dithering / atmosphere, depending on swap parity) would first clear
    // targetA's *depth* to 1.0 — silently breaking the post-composite symbol anchor
    // occlusion that samples scene depth after the chain finishes.
    const previousAutoClear = webglRenderer.autoClear
    webglRenderer.autoClear = false
    try {
      // Bind the authoritative opaque depth each draw, independently of color ping-pong.
      if (this.frame) this.pass.setDepthTexture(this.frame.require('effect adapter').depth)

      const passWithMaterial = this.pass as EffectPass & {
        fullscreenMaterial?: EffectMaterial
      }
      if (passWithMaterial.fullscreenMaterial instanceof EffectMaterial) {
        passWithMaterial.fullscreenMaterial.adoptCameraSettings(this.getCamera())
      }

      this.pass.render(webglRenderer, readBuffer, writeBuffer, this.resolveDeltaTime(deltaTime))
    } finally {
      webglRenderer.autoClear = previousAutoClear
      // postprocessing accepts null at runtime; its declaration omits this unbind case.
      if (this.frame) this.pass.setDepthTexture(null!)
    }
  }

  setDeltaTime(deltaTime: number) {
    this.deltaTime = toFiniteDeltaTime(deltaTime)
  }

  setSize(width: number, height: number) {
    if (this.isInitialized) {
      this.pass.setSize(width, height)
    }
  }

  recompile() {
    const pass = this.pass as EffectPass & {
      recompile?: () => void
    }
    pass.recompile?.()
  }

  dispose() {
    this.pass.dispose()
  }

  private resolveDeltaTime(deltaTime?: number) {
    return deltaTime === undefined ? this.deltaTime : toFiniteDeltaTime(deltaTime)
  }
}

function toFiniteDeltaTime(deltaTime: number) {
  return Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0
}
