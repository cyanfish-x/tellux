import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { SplatMesh } from '@sparkjsdev/spark'

const installed = new WeakSet<SplatMesh>()
type Splat = ReturnType<NonNullable<SplatMesh['packedSplats']>['getSplat']>

// 在每个候选高斯附近重定位后，用 JS 双精度求交；避免 f32 判别式消减。
// Rebase around each candidate and intersect in JS double precision, avoiding f32 cancellation.
function intersectSplat(ray: Ray, splat: Splat): number {
  const { center, scales, quaternion, opacity } = splat
  const origin = ray.origin.clone().sub(center)
  const shift = -origin.dot(ray.direction) / ray.direction.lengthSq()
  origin.addScaledVector(ray.direction, shift)
  quaternion.conjugate()
  origin.applyQuaternion(quaternion)
  const direction = ray.direction.clone().applyQuaternion(quaternion)
  scales.multiplyScalar(Math.max(opacity, 1) * 4 - 3)
  const minScale = Math.max(scales.x, scales.y, scales.z) * 0.01
  // 与 Spark 一致：很薄的高斯按椭圆盘拾取，普通高斯按椭球入口拾取。
  // Match Spark's disk treatment for thin splats and entry-only ellipsoid intersections.
  const flatAxis = scales.z < minScale ? 'z' : scales.y < minScale ? 'y' : scales.x < minScale ? 'x' : null
  if (flatAxis) {
    if (Math.abs(direction[flatAxis]) < 1e-6) return NaN
    const distance = -origin[flatAxis] / direction[flatAxis]
    origin.addScaledVector(direction, distance)
    origin[flatAxis] = 0
    scales[flatAxis] = 1
    return origin.divide(scales).lengthSq() <= 1 ? shift + distance : NaN
  }
  origin.divide(scales)
  direction.divide(scales)
  const a = direction.lengthSq()
  if (!Number.isFinite(a) || a === 0) return NaN
  const closest = -origin.dot(direction) / a
  origin.addScaledVector(direction, closest)
  const remaining = 1 - origin.lengthSq()
  return remaining >= 0 ? shift + closest - Math.sqrt(remaining / a) : NaN
}

/**
 * 为解码完成的静态高斯建立拾取索引，以双精度计算交点，稳定缩放和旋转。
 * Index decoded static splats and intersect in double precision for stable zoom and orbit.
 * 索引随 mesh.dispose 释放；修改高斯数据或局部变形后需重建，不适用于分页数据。
 * Released with mesh.dispose; rebuild after splat edits or local deformation. Not for paged data.
 */
export function stabilizeSplatRaycast(mesh: SplatMesh): void {
  if (installed.has(mesh) || mesh.paged) return
  const source = mesh.extSplats ?? mesh.packedSplats
  if (!source || source.numSplats === 0) return

  // 每个三角形只编码一个高斯的保守 AABB；不渲染、不进行三角形求交。
  // Each proxy triangle encodes a conservative splat AABB; never rendered or triangle-tested.
  const positions = new Float32Array(source.numSplats * 9)
  source.forEachSplat((index, center, scales, _quaternion, opacity) => {
    let radius = Math.max(scales.x, scales.y, scales.z) * (Math.max(opacity, 1) * 4 - 3)
    // 向外扩展，覆盖 BVH float32 存储的舍入误差。
    // Expand outward to cover rounding in the BVH's float32 storage.
    radius += Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z), radius) * 2 ** -22 + 1e-5
    const offset = index * 9
    positions.set([
      center.x - radius, center.y - radius, center.z - radius,
      center.x + radius, center.y + radius, center.z + radius,
      center.x - radius, center.y + radius, center.z - radius,
    ], offset)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const bvh = new MeshBVH(geometry, { maxLeafTris: 8 })
  const inverse = new Matrix4()
  const linear = new Matrix3()
  const ray = new Ray()
  const originalRaycast = mesh.raycast
  const originalDispose = mesh.dispose
  mesh.raycast = function (raycaster, intersects) {
    if (!this.raycastable) return
    // 显式子集/分页拾取由 Spark 管理；静态案例使用完整数据，保持视觉 LOD 切换时锚点稳定。
    // Leave explicit subsets/paging to Spark; static examples pick full data across visual LODs.
    if (this.raycastIndices || this.paged) return originalRaycast.call(this, raycaster, intersects)
    inverse.copy(this.matrixWorld).invert()
    ray.origin.copy(raycaster.ray.origin).applyMatrix4(inverse)
    // 不归一化局部方向，保留原始世界射线的距离参数（包括非均匀缩放）。
    // Keep the world-ray distance parameter, including nonuniform scale, by not normalizing.
    ray.direction.copy(raycaster.ray.direction).applyMatrix3(linear.setFromMatrix4(inverse))
    bvh.shapecast({
      intersectsBounds: box => ray.intersectsBox(box),
      intersectsRange: (offset, count) => {
        for (let i = offset; i < offset + count; i++) {
          // BVH 重排索引，三角形首顶点仍指回原始高斯序号。
          // BVH reorders indices; the first vertex still identifies the original splat.
          const splat = source.getSplat(geometry.index!.getX(i * 3) / 3)
          if (splat.opacity < this.minRaycastOpacity) continue
          const distance = intersectSplat(ray, splat)
          if (distance >= raycaster.near && distance <= raycaster.far) {
            intersects.push({ distance, point: raycaster.ray.at(distance, new Vector3()), object: this })
          }
        }
        return false
      },
    })
  }
  mesh.dispose = function () {
    this.raycast = originalRaycast
    this.dispose = originalDispose
    installed.delete(this)
    geometry.dispose()
    originalDispose.call(this)
  }
  installed.add(mesh)
}
