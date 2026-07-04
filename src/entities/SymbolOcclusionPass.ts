import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'

const SYMBOL_OCCLUSION_KEY = 'telluxSymbolOcclusion'

export interface SymbolOcclusionController {
  setDepthTexture(texture: THREE.Texture | null, texelSize?: THREE.Vector2 | null): void
  setEnabled(enabled: boolean): void
}

interface VisibilityState {
  object: THREE.Object3D
  visible: boolean
}

interface MaterialDepthState {
  material: THREE.Material
  depthTest: boolean
}

/**
 * Symbol occlusion pass. Symbols are hidden during the main scene render, then
 * drawn here against the scene depth texture. Each quad samples depth at its
 * anchor projection, so occlusion is all-or-nothing for the whole icon/text.
 */
export class SymbolOcclusionPass implements ThreeEffectPass {
  enabled = true
  needsSwap = false

  private readonly fullscreenScene = new THREE.Scene()
  private readonly fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly copyMaterial: THREE.ShaderMaterial
  private readonly copyMesh: THREE.Mesh
  private readonly hiddenSymbols: VisibilityState[] = []
  private readonly hiddenNonSymbols: VisibilityState[] = []
  private readonly materialDepthStates: MaterialDepthState[] = []
  private readonly depthTexelSize = new THREE.Vector2(1, 1)

  constructor(
    private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'TelluxSymbolOcclusionBlit',
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `
    })
    this.copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial)
    this.copyMesh.frustumCulled = false
    this.fullscreenScene.add(this.copyMesh)
  }

  beginFrame() {
    this.restoreHiddenSymbols()
    this.root.traverse((object) => {
      if (!object.visible || !getSymbolOcclusionController(object)) return
      this.hiddenSymbols.push({ object, visible: object.visible })
      object.visible = false
    })
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    this.restoreHiddenSymbols()

    const depthOnRead = readBuffer.depthTexture ?? null
    const depth = depthOnRead ?? writeBuffer.depthTexture ?? null
    if (!depth || !this.hasRenderableSymbols()) {
      this.disableSymbolOcclusion()
      this.needsSwap = false
      return
    }

    const target = depthOnRead ? writeBuffer : readBuffer
    const previousRenderTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear

    this.depthTexelSize.set(1 / Math.max(1, target.width), 1 / Math.max(1, target.height))
    this.configureSymbolRender(depth)
    try {
      renderer.autoClear = false
      renderer.setRenderTarget(target)
      if (depthOnRead) {
        this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture
        renderer.render(this.fullscreenScene, this.fullscreenCamera)
      }
      renderer.render(this.root, this.camera)
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.autoClear = previousAutoClear
      this.restoreNonSymbolVisibility()
      this.restoreMaterialDepthTests()
      this.disableSymbolOcclusion()
    }

    this.needsSwap = depthOnRead !== null
  }

  setSize(_width: number, _height: number) {}

  dispose() {
    this.restoreHiddenSymbols()
    this.restoreNonSymbolVisibility()
    this.restoreMaterialDepthTests()
    this.disableSymbolOcclusion()
    this.copyMesh.geometry.dispose()
    this.copyMaterial.dispose()
  }

  private configureSymbolRender(depth: THREE.Texture) {
    this.root.traverse((object) => {
      const controller = getSymbolOcclusionController(object)
      if (controller) {
        controller.setDepthTexture(depth, this.depthTexelSize)
        controller.setEnabled(true)
        this.disableMaterialDepthTest(object)
        return
      }

      if (!object.visible || !isRenderable(object)) return
      this.hiddenNonSymbols.push({ object, visible: object.visible })
      object.visible = false
    })
  }

  private disableSymbolOcclusion() {
    this.root.traverse((object) => {
      const controller = getSymbolOcclusionController(object)
      if (!controller) return
      controller.setEnabled(false)
      controller.setDepthTexture(null, null)
    })
  }

  private disableMaterialDepthTest(object: THREE.Object3D) {
    const material = (object as THREE.Object3D & { material?: unknown }).material
    forEachMaterial(material, (item) => {
      this.materialDepthStates.push({ material: item, depthTest: item.depthTest })
      item.depthTest = false
    })
  }

  private restoreHiddenSymbols() {
    this.hiddenSymbols.forEach(({ object, visible }) => {
      object.visible = visible
    })
    this.hiddenSymbols.length = 0
  }

  private restoreNonSymbolVisibility() {
    this.hiddenNonSymbols.forEach(({ object, visible }) => {
      object.visible = visible
    })
    this.hiddenNonSymbols.length = 0
  }

  private restoreMaterialDepthTests() {
    this.materialDepthStates.forEach(({ material, depthTest }) => {
      material.depthTest = depthTest
    })
    this.materialDepthStates.length = 0
  }

  private hasRenderableSymbols() {
    let hasRenderable = false
    this.root.traverseVisible((object) => {
      if (getSymbolOcclusionController(object)) {
        hasRenderable = true
      }
    })
    return hasRenderable
  }
}

export function setSymbolOcclusionController(
  object: THREE.Object3D,
  controller: SymbolOcclusionController
) {
  object.userData[SYMBOL_OCCLUSION_KEY] = controller
}

function getSymbolOcclusionController(object: THREE.Object3D): SymbolOcclusionController | null {
  return object.userData[SYMBOL_OCCLUSION_KEY] ?? null
}

export function isSymbolOcclusionObject(object: THREE.Object3D): boolean {
  return getSymbolOcclusionController(object) !== null
}

function isRenderable(object: THREE.Object3D): boolean {
  return Boolean((object as THREE.Object3D & { material?: unknown }).material)
}

function forEachMaterial(material: unknown, callback: (material: THREE.Material) => void) {
  if (Array.isArray(material)) {
    material.forEach((item) => {
      if (item instanceof THREE.Material) callback(item)
    })
    return
  }
  if (material instanceof THREE.Material) callback(material)
}
