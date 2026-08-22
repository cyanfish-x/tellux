import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { ThreeRendererWithEffects } from '../effects'
import type { ViewerOptions, ViewerRendererOptions, ViewerRendererType } from '../types'

export type TelluxWebGLRenderer = ThreeRendererWithEffects
export type TelluxWebGPURenderer = WebGPURenderer
export type TelluxRenderer = TelluxWebGLRenderer | TelluxWebGPURenderer

export interface TelluxRendererAdapter {
  readonly type: ViewerRendererType
  readonly renderer: TelluxRenderer
  readonly supportsWebGLEffects: boolean
  readonly ready: Promise<void>
  hasInitialized(): boolean
  setPixelRatio(value: number): void
  getSize(target: THREE.Vector2): THREE.Vector2
  setSize(width: number, height: number, updateStyle?: boolean): void
  getRenderTarget(): ReturnType<TelluxRenderer['getRenderTarget']>
  setRenderTarget(renderTarget: ReturnType<TelluxRenderer['getRenderTarget']>): void
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void
  setRenderDelegate(delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null): void
  render(scene: THREE.Object3D, camera: THREE.Camera): void
  setAnimationLoop(callback: ((time: DOMHighResTimeStamp) => void) | null): void
  dispose(): void
}

export function createRendererAdapter(options: ViewerOptions): TelluxRendererAdapter {
  const rendererOptions = options.renderer
  const type = rendererOptions?.type ?? 'webgl'
  return type === 'webgpu'
    ? new WebGPURendererAdapter(options)
    : new WebGLRendererAdapter(options)
}

class WebGLRendererAdapter implements TelluxRendererAdapter {
  readonly type = 'webgl' as const
  readonly supportsWebGLEffects = true
  readonly renderer: TelluxWebGLRenderer
  readonly ready = Promise.resolve()

  constructor(options: ViewerOptions) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: options.renderer?.transparent ?? options.transparent ?? false,
      antialias: options.renderer?.antialias,
      outputBufferType: THREE.HalfFloatType
    }) as TelluxWebGLRenderer
  }

  hasInitialized() {
    return true
  }

  setPixelRatio(value: number) {
    this.renderer.setPixelRatio(value)
  }

  getSize(target: THREE.Vector2) {
    return this.renderer.getSize(target)
  }

  setSize(width: number, height: number, updateStyle?: boolean) {
    this.renderer.setSize(width, height, updateStyle)
  }

  getRenderTarget() {
    return this.renderer.getRenderTarget()
  }

  setRenderTarget(renderTarget: ReturnType<TelluxWebGLRenderer['getRenderTarget']>) {
    this.renderer.setRenderTarget(renderTarget)
  }

  clear(color?: boolean, depth?: boolean, stencil?: boolean) {
    this.renderer.clear(color, depth, stencil)
  }

  setRenderDelegate(_delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null) {}

  render(scene: THREE.Object3D, camera: THREE.Camera) {
    this.renderer.render(scene, camera)
  }

  setAnimationLoop(callback: ((time: DOMHighResTimeStamp) => void) | null) {
    this.renderer.setAnimationLoop(callback)
  }

  dispose() {
    this.renderer.dispose()
  }
}

class WebGPURendererAdapter implements TelluxRendererAdapter {
  readonly type = 'webgpu' as const
  readonly supportsWebGLEffects = false
  readonly renderer: TelluxWebGPURenderer
  readonly ready: Promise<void>
  private animationLoop: ((time: DOMHighResTimeStamp) => void) | null = null
  private renderDelegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null = null
  private initialized = false
  private disposed = false

  constructor(options: ViewerOptions = {}) {
    const rendererOptions: ViewerRendererOptions = options.renderer ?? {}
    this.renderer = new WebGPURenderer({
      alpha: rendererOptions.transparent ?? options.transparent ?? false,
      antialias: rendererOptions.antialias,
      samples: rendererOptions.samples,
      forceWebGL: rendererOptions.forceWebGL
    })
    // Earth-scale ECEF transforms lose visible precision when the GPU multiplies
    // separate 32-bit model and view matrices. Three.js computes their combined
    // model-view and normal-view matrices with CPU 64-bit precision in this mode.
    this.renderer.highPrecision = true
    this.ready = this.renderer.init().then(() => {
      if (this.disposed) return
      this.initialized = true
    })
  }

  hasInitialized() {
    return this.initialized
  }

  setPixelRatio(value: number) {
    this.renderer.setPixelRatio(value)
  }

  getSize(target: THREE.Vector2) {
    return this.renderer.getSize(target)
  }

  setSize(width: number, height: number, updateStyle?: boolean) {
    this.renderer.setSize(width, height, updateStyle)
  }

  getRenderTarget() {
    return this.renderer.getRenderTarget()
  }

  setRenderTarget(renderTarget: ReturnType<TelluxWebGPURenderer['getRenderTarget']>) {
    this.renderer.setRenderTarget(renderTarget)
  }

  clear(color?: boolean, depth?: boolean, stencil?: boolean) {
    this.renderer.clear(color, depth, stencil)
  }

  setRenderDelegate(delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null) {
    this.renderDelegate = delegate
  }

  render(scene: THREE.Object3D, camera: THREE.Camera) {
    if (!this.initialized) return
    if (this.renderDelegate) {
      this.renderDelegate(scene, camera)
      return
    }
    this.renderer.render(scene, camera)
  }

  setAnimationLoop(callback: ((time: DOMHighResTimeStamp) => void) | null) {
    this.animationLoop = callback
    if (this.disposed) return

    void this.ready
      .then(() => {
        if (this.disposed) return
        void this.renderer.setAnimationLoop(this.animationLoop)
      })
      .catch(() => undefined)
  }

  dispose() {
    this.disposed = true
    this.initialized = false
    this.animationLoop = null
    this.renderDelegate = null
    this.renderer.dispose()
  }
}
