import * as THREE from 'three'

/**
 * 简单 HISM 拾取标记：在命中点显示可脉冲缩放的球体。
 *
 * Simple HISM pick marker: a pulsing sphere at the hit point.
 */
export class HismPickMarker {
  readonly object: THREE.Mesh
  private elapsed = 0

  constructor() {
    const geometry = new THREE.SphereGeometry(8, 16, 16)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0.85,
      depthTest: true
    })
    this.object = new THREE.Mesh(geometry, material)
    this.object.name = 'tellux-hism-pick-marker'
    this.object.visible = false
  }

  show(point: THREE.Vector3) {
    this.object.position.copy(point)
    this.object.visible = true
    this.elapsed = 0
  }

  hide() {
    this.object.visible = false
  }

  update(deltaTime: number) {
    if (!this.object.visible) return
    this.elapsed += deltaTime
    const pulse = 1 + Math.sin(this.elapsed * 8) * 0.18
    this.object.scale.setScalar(pulse)
  }

  dispose() {
    this.object.geometry.dispose()
    ;(this.object.material as THREE.Material).dispose()
    this.object.parent?.remove(this.object)
  }
}
