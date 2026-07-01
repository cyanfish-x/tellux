import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { ColorInput, PolylineOptions } from '../types'
import { resolveColor } from './invertToneMapping'

interface PolylineGraphicOptions {
  worldPositions: THREE.Vector3[]
  options: PolylineOptions
}

/**
 * 折线图形。用 Line2 + LineMaterial 渲染像素级恒定宽度的粗线。
 *
 * Polyline graphics. Renders constant-pixel-width lines with Line2 and
 * LineMaterial.
 */
export class PolylineGraphic {
  readonly object3D: Line2
  private readonly material: LineMaterial
  private readonly geometry: LineGeometry
  private worldPositions: THREE.Vector3[]

  constructor({ worldPositions, options }: PolylineGraphicOptions) {
    const width = options.width ?? 2
    this.worldPositions = clonePositions(worldPositions)
    this.geometry = new LineGeometry()
    this.geometry.setPositions(toFlatArray(this.worldPositions))

    this.material = new LineMaterial({
      color: resolveColor(options.color),
      linewidth: width,
      worldUnits: false,
      transparent: true,
      depthWrite: false,
      resolution: new THREE.Vector2(1, 1)
    })

    this.object3D = new Line2(this.geometry, this.material)
    this.object3D.computeLineDistances()
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
  }

  get color(): number {
    return this.material.color.getHex()
  }

  get width(): number {
    return this.material.linewidth
  }

  setPositions(worldPositions: THREE.Vector3[]) {
    this.worldPositions = clonePositions(worldPositions)
    this.geometry.setPositions(toFlatArray(this.worldPositions))
    this.object3D.computeLineDistances()
  }

  setColor(color: ColorInput) {
    this.material.color.set(resolveColor(color))
  }

  setWidth(width: number) {
    this.material.linewidth = width
  }

  syncResolution(width: number, height: number) {
    this.material.resolution.set(width, height)
  }

  forEachSegment(callback: (start: THREE.Vector3, end: THREE.Vector3) => void) {
    for (let i = 0; i < this.worldPositions.length - 1; i += 1) {
      callback(this.worldPositions[i], this.worldPositions[i + 1])
    }
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

function clonePositions(positions: THREE.Vector3[]) {
  return positions.map((position) => position.clone())
}

function toFlatArray(positions: THREE.Vector3[]): number[] {
  const flat: number[] = []
  for (const p of positions) {
    flat.push(p.x, p.y, p.z)
  }
  return flat
}
