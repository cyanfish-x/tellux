import * as THREE from 'three'
import type { ThreeRendererWithEffects } from '../effects'
import type { TilesetManager } from '../tiles/TilesetManager'

export interface ViewportResizeManagerOptions {
  container: HTMLElement
  camera: THREE.PerspectiveCamera
  renderer: ThreeRendererWithEffects
  tilesets: TilesetManager
}

export class ViewportResizeManager {
  private readonly rendererSize = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver

  constructor(private readonly options: ViewportResizeManagerOptions) {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.options.container)
    window.addEventListener('resize', this.handleWindowResize)
  }

  resize() {
    const { clientWidth, clientHeight } = this.options.container
    if (!clientWidth || !clientHeight) return

    this.options.renderer.getSize(this.rendererSize)
    if (this.rendererSize.width === clientWidth && this.rendererSize.height === clientHeight) return

    this.options.camera.aspect = clientWidth / clientHeight
    this.options.camera.updateProjectionMatrix()
    this.options.renderer.setSize(clientWidth, clientHeight)
    this.options.tilesets.resize()
  }

  dispose() {
    window.removeEventListener('resize', this.handleWindowResize)
    this.resizeObserver.disconnect()
  }

  private readonly handleWindowResize = () => {
    this.resize()
  }
}
