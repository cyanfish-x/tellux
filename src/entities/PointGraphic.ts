import * as THREE from 'three'
import type { ColorInput, PointOptions } from '../types'
import { createCircleTexture } from './createCircleTexture'
import type { ResolveColor } from './invertToneMapping'

interface PointGraphicOptions {
  position: THREE.Vector3
  options: PointOptions
  resolveColor: ResolveColor
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
  private readonly fillEdgeMaterial: THREE.PointsMaterial
  private readonly outlineMaterial: THREE.PointsMaterial | null
  private readonly outlineEdgeMaterial: THREE.PointsMaterial | null
  private readonly fillGeometry: THREE.BufferGeometry
  private readonly outlineGeometry: THREE.BufferGeometry | null
  private readonly resolveColor: ResolveColor
  private readonly currentColor: THREE.Color
  private readonly currentOutlineColor: THREE.Color
  private currentOutlineWidth: number

  constructor({ position, options, resolveColor }: PointGraphicOptions) {
    const pixelSize = options.pixelSize ?? 8
    const outlineWidth = options.outlineWidth ?? 0
    this.resolveColor = resolveColor
    this.currentColor = new THREE.Color(options.color ?? 0xffffff)
    this.currentOutlineColor = new THREE.Color(options.outlineColor ?? 0xffffff)
    this.currentOutlineWidth = outlineWidth

    this.fillGeometry = createPointGeometry(position)
    this.fillMaterial = createPointMaterial(this.resolveColor(this.currentColor), pixelSize, 0, 'opaque')
    this.fillEdgeMaterial = createPointMaterial(this.resolveColor(this.currentColor), pixelSize, 0, 'edge')
    const group = new THREE.Group()

    if (outlineWidth > 0) {
      this.outlineGeometry = createPointGeometry(position)
      this.outlineMaterial = createPointMaterial(this.resolveColor(this.currentOutlineColor), pixelSize + outlineWidth * 2, 0.5, 'opaque')
      this.outlineEdgeMaterial = createPointMaterial(this.resolveColor(this.currentOutlineColor), pixelSize + outlineWidth * 2, 0.5, 'edge')
      group.add(new THREE.Points(this.outlineGeometry, this.outlineEdgeMaterial))
      group.add(new THREE.Points(this.outlineGeometry, this.outlineMaterial))
      group.add(new THREE.Points(this.fillGeometry, this.fillEdgeMaterial))
      group.add(new THREE.Points(this.fillGeometry, this.fillMaterial))
      this.object3D = group
    } else {
      this.outlineGeometry = null
      this.outlineMaterial = null
      this.outlineEdgeMaterial = null
      group.add(new THREE.Points(this.fillGeometry, this.fillEdgeMaterial))
      group.add(new THREE.Points(this.fillGeometry, this.fillMaterial))
      this.object3D = group
    }

    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
  }

  setPosition(position: THREE.Vector3) {
    setGeometryPosition(this.fillGeometry, position)
    setGeometryPosition(this.outlineGeometry, position)
  }

  copyPosition(target: THREE.Vector3) {
    const attribute = this.fillGeometry.getAttribute('position') as THREE.BufferAttribute
    return target.fromBufferAttribute(attribute, 0)
  }

  get visualDiameter(): number {
    return this.fillMaterial.size + this.currentOutlineWidth * 2
  }

  get color(): number {
    return this.currentColor.getHex()
  }

  get pixelSize(): number {
    return this.fillMaterial.size
  }

  setColor(color: ColorInput) {
    this.currentColor.set(color)
    const resolvedColor = this.resolveColor(this.currentColor)
    this.fillMaterial.color.set(resolvedColor)
    this.fillEdgeMaterial.color.set(resolvedColor)
  }

  refreshColors() {
    const fill = this.resolveColor(this.currentColor)
    this.fillMaterial.color.copy(fill)
    this.fillEdgeMaterial.color.copy(fill)
    if (this.outlineMaterial && this.outlineEdgeMaterial) {
      const outline = this.resolveColor(this.currentOutlineColor)
      this.outlineMaterial.color.copy(outline)
      this.outlineEdgeMaterial.color.copy(outline)
    }
  }

  setPixelSize(pixelSize: number) {
    this.fillMaterial.size = pixelSize
    this.fillEdgeMaterial.size = pixelSize
    if (this.outlineMaterial) {
      this.outlineMaterial.size = pixelSize + this.currentOutlineWidth * 2
    }
    if (this.outlineEdgeMaterial) {
      this.outlineEdgeMaterial.size = pixelSize + this.currentOutlineWidth * 2
    }
  }

  dispose() {
    this.fillGeometry.dispose()
    this.outlineGeometry?.dispose()
    this.fillMaterial.map?.dispose()
    this.fillMaterial.dispose()
    this.fillEdgeMaterial.map?.dispose()
    this.fillEdgeMaterial.dispose()
    if (this.outlineMaterial) {
      this.outlineMaterial.map?.dispose()
      this.outlineMaterial.dispose()
    }
    if (this.outlineEdgeMaterial) {
      this.outlineEdgeMaterial.map?.dispose()
      this.outlineEdgeMaterial.dispose()
    }
  }
}

function createPointGeometry(position: THREE.Vector3): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([position.x, position.y, position.z]), 3))
  return geometry
}

function createPointMaterial(
  color: THREE.Color,
  size: number,
  outlineRatio: number,
  pass: 'opaque' | 'edge'
): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    transparent: pass === 'edge',
    depthTest: true,
    depthWrite: pass === 'opaque',
    alphaTest: pass === 'opaque' ? 0.995 : 0.005,
    map: createCircleTexture(outlineRatio)
  })
  if (pass === 'edge') {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'if ( diffuseColor.a >= 0.995 ) discard;\n#include <opaque_fragment>'
      )
    }
    material.customProgramCacheKey = () => 'tellux-point-edge'
  }
  return material
}

function setGeometryPosition(geometry: THREE.BufferGeometry | null, position: THREE.Vector3) {
  if (!geometry) return
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
  attribute.setXYZ(0, position.x, position.y, position.z)
  attribute.needsUpdate = true
}
