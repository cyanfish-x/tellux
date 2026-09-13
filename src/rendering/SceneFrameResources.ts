import type * as THREE from 'three'

/** 本帧借用的不透明资源。 Borrowed opaque resources for the current frame. */
export interface SceneDepthResources {
  readonly target: THREE.WebGLRenderTarget
  readonly depth: THREE.DepthTexture
  readonly width: number
  readonly height: number
}

/** 深度由不透明阶段发布，不随后处理颜色交换而改变。 Depth is published by the opaque stage, independently of color swaps. */
export class SceneFrameResources {
  private active = false
  private resources: SceneDepthResources | null = null

  begin() {
    if (this.active) throw new Error('Tellux: scene frame is already active')
    this.active = true
    this.resources = null
  }

  publish(target: THREE.WebGLRenderTarget) {
    if (!this.active || !target.depthTexture) throw new Error('Tellux: opaque stage requires an active frame and scene depth')
    this.resources = { target, depth: target.depthTexture, width: target.width, height: target.height }
  }

  require(consumer: string): SceneDepthResources {
    const resources = this.resources
    if (!this.active || !resources || resources.target.depthTexture !== resources.depth
      || resources.target.width !== resources.width || resources.target.height !== resources.height) {
      throw new Error(`Tellux: ${consumer} requires valid current-frame scene depth`)
    }
    return resources
  }

  end() {
    this.resources = null
    this.active = false
  }
}
