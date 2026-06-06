import * as THREE from 'three'
import { EffectMaterial, EffectPass, NormalPass } from 'postprocessing'

export type ThreeEffectPass = THREE.Effect & {
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
    private readonly getCamera: () => THREE.PerspectiveCamera
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

      const passWithDepth = this.pass as EffectPass & {
        setDepthTexture?: (texture: THREE.Texture) => void
      }
      if (readBuffer.depthTexture && passWithDepth.setDepthTexture) {
        passWithDepth.setDepthTexture(readBuffer.depthTexture)
      }

      this.isInitialized = true
    }

    const passWithMaterial = this.pass as EffectPass & {
      fullscreenMaterial?: EffectMaterial
    }
    if (passWithMaterial.fullscreenMaterial instanceof EffectMaterial) {
      passWithMaterial.fullscreenMaterial.adoptCameraSettings(this.getCamera())
    }

    this.pass.render(webglRenderer, readBuffer, writeBuffer, this.resolveDeltaTime(deltaTime))
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
