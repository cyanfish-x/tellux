import * as THREE from 'three'
import type { ColorInput, PointOptions } from '../types'
import { createCircleTexture } from './createCircleTexture'

interface PointGraphicOptions {
  position: THREE.Vector3
  options: PointOptions
}

/**
 * 点图形。持有单个 THREE.Points 对象，用 PointsMaterial 的圆形纹理渲染
 * 恒定像素大小的点；带描边时由外环点和内核点两层叠加。
 *
 * Point graphics. Holds a THREE.Points object rendered with a circular
 * PointsMaterial texture at a constant pixel size; outlines are drawn as a
 * larger backing point under a smaller fill point.
 */
export class PointGraphic {
  readonly object3D: THREE.Object3D
  private readonly fillMaterial: THREE.PointsMaterial
  private readonly outlineMaterial: THREE.PointsMaterial | null
  private readonly fillGeometry: THREE.BufferGeometry
  private readonly outlineGeometry: THREE.BufferGeometry | null
  private currentOutlineWidth: number

  constructor({ position, options }: PointGraphicOptions) {
    const pixelSize = options.pixelSize ?? 8
    const outlineWidth = options.outlineWidth ?? 0
    this.currentOutlineWidth = outlineWidth

    this.fillGeometry = createPointGeometry(position)
    this.fillMaterial = createPointMaterial(resolveColor(options.color), pixelSize, 0)

    if (outlineWidth > 0) {
      this.outlineGeometry = createPointGeometry(position)
      this.outlineMaterial = createPointMaterial(resolveColor(options.outlineColor), pixelSize + outlineWidth * 2, 0.5)
      const group = new THREE.Group()
      group.add(new THREE.Points(this.outlineGeometry, this.outlineMaterial))
      group.add(new THREE.Points(this.fillGeometry, this.fillMaterial))
      this.object3D = group
    } else {
      this.outlineGeometry = null
      this.outlineMaterial = null
      this.object3D = new THREE.Points(this.fillGeometry, this.fillMaterial)
    }

    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
  }

  setPosition(position: THREE.Vector3) {
    setGeometryPosition(this.fillGeometry, position)
    setGeometryPosition(this.outlineGeometry, position)
  }

  get color(): number {
    return this.fillMaterial.color.getHex()
  }

  get pixelSize(): number {
    return this.fillMaterial.size
  }

  setColor(color: ColorInput) {
    this.fillMaterial.color.set(resolveColor(color))
  }

  setPixelSize(pixelSize: number) {
    this.fillMaterial.size = pixelSize
    if (this.outlineMaterial) {
      this.outlineMaterial.size = pixelSize + this.currentOutlineWidth * 2
    }
  }

  dispose() {
    this.fillGeometry.dispose()
    this.outlineGeometry?.dispose()
    this.fillMaterial.map?.dispose()
    this.fillMaterial.dispose()
    if (this.outlineMaterial) {
      this.outlineMaterial.map?.dispose()
      this.outlineMaterial.dispose()
    }
  }
}

function createPointGeometry(position: THREE.Vector3): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([position.x, position.y, position.z]), 3))
  return geometry
}

function createPointMaterial(colorHex: number, size: number, outlineRatio: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color: colorHex,
    size,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    map: createCircleTexture(outlineRatio)
  })
}

function setGeometryPosition(geometry: THREE.BufferGeometry | null, position: THREE.Vector3) {
  if (!geometry) return
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
  attribute.setXYZ(0, position.x, position.y, position.z)
  attribute.needsUpdate = true
}

export function resolveColor(input: ColorInput | undefined): number {
  if (input === undefined) return 0xffffff
  if (typeof input === 'number') return input
  return new THREE.Color().set(input).getHex()
}
