import type { BufferGeometry, Group, Material, Vector3 } from 'three'
import type { CartographicFrameOptions, CartographicInput } from './spatial'

/**
 * HISM 网格部件：同一原型下与其他部件同步实例化的几何与材质。
 *
 * HISM mesh part: geometry and material instanced in sync with sibling parts
 * under the same archetype.
 */
export interface HismMeshPart {
  /** 部件几何。Part geometry. */
  geometry: BufferGeometry
  /** 部件材质。Part material. */
  material: Material | Material[]
  /**
   * 可选调试名。
   *
   * Optional debug name.
   */
  name?: string
}

/**
 * HISM LOD 级别：在指定距离内使用对应 mesh 部件集合。
 *
 * HISM LOD level: uses the associated mesh parts within the given distance.
 */
export interface HismLodLevel {
  /**
   * 相对簇中心的最大可见距离（米）。
   *
   * Maximum visible distance in meters from the cluster center.
   */
  maxDistanceMeters: number
  /** 该 LOD 下的 mesh 部件。Mesh parts at this LOD. */
  parts: HismMeshPart[]
}

/**
 * HISM 实例原型：一次放置会同时渲染其全部 mesh 部件。
 *
 * HISM instance archetype: one placement renders all mesh parts together.
 */
export interface HismArchetype {
  /**
   * 单 LOD 原型部件；与 `lodLevels` 二选一。
   *
   * Single-LOD parts; mutually exclusive with `lodLevels`.
   */
  parts?: HismMeshPart[]
  /**
   * 多 LOD 原型部件；与 `parts` 二选一。
   *
   * Multi-LOD parts; mutually exclusive with `parts`.
   */
  lodLevels?: HismLodLevel[]
  /**
   * 可选原型名。
   *
   * Optional archetype name.
   */
  name?: string
}

/**
 * 单个 HISM 实例放置参数。
 *
 * Placement parameters for a single HISM instance.
 */
export interface HismInstancePlacement {
  /**
   * 放置坐标。数组顺序为 `[经度, 纬度, 高度]`。
   *
   * Placement coordinates. Tuple order is `[longitude, latitude, height]`.
   */
  coordinates: CartographicInput
  /** 朝向角（度）。Heading in degrees. */
  heading?: number
  /** 俯仰角（度）。Pitch in degrees. */
  pitch?: number
  /** 翻滚角（度）。Roll in degrees. */
  roll?: number
  /**
   * 缩放。数字为等比缩放；数组分别缩放 x/y/z。
   *
   * Scale. A number applies uniform scaling; an array scales x/y/z separately.
   */
  scale?: number | [x: number, y: number, z: number]
  /**
   * 原型索引，对应 `archetypes` 数组下标。
   *
   * Archetype index into the `archetypes` array.
   */
  archetype: number
}

/**
 * 添加 HISM 图层的配置。
 *
 * Options for adding a HISM layer.
 */
export interface AddHismLayerOptions {
  /**
   * 图层 id。不传时 Tellux 自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /** 实例原型列表。Archetype list. */
  archetypes: HismArchetype[]
  /** 实例放置列表。Instance placements. */
  instances: HismInstancePlacement[]
  /**
   * 空间簇网格边长（米）。默认 `512`。
   *
   * Spatial cluster grid cell size in meters. Defaults to `512`.
   */
  clusterCellSizeMeters?: number
  /**
   * 簇网格参考纬度（度）。省略时根据实例质心自动计算。
   *
   * Reference latitude (degrees) for the cluster grid. Defaults to the
   * instance centroid when omitted.
   */
  referenceLatitude?: number
  /**
   * 簇网格参考经度（度）。省略时根据实例质心自动计算。
   *
   * Reference longitude (degrees) for the cluster grid. Defaults to the
   * instance centroid when omitted.
   */
  referenceLongitude?: number
  /**
   * 每帧更新回调，可用于风摆等共享材质动画。
   *
   * Per-frame update callback, e.g. for shared-material wind animation.
   */
  onUpdate?: (deltaTime: number, elapsedTime: number) => void
  /**
   * 是否显示图层，默认 `true`。
   *
   * Whether the layer is visible. Defaults to `true`.
   */
  show?: boolean
}

/**
 * HISM 拾取结果。
 *
 * HISM pick result.
 */
export interface HismPickResult {
  /** 图层 id。Layer id. */
  layerId: string
  /** 簇 key。Cluster key. */
  clusterKey: string
  /** 原型索引。Archetype index. */
  archetypeIndex: number
  /** LOD 索引。LOD index. */
  lodIndex: number
  /** 部件索引。Part index. */
  partIndex: number
  /** 实例 id。Instance id. */
  instanceId: number
  /** 命中点（世界坐标）。Hit point in world coordinates. */
  point: Vector3
  /** 命中距离。Hit distance. */
  distance: number
}

/**
 * 单图层运行时统计。
 *
 * Runtime statistics for a single layer.
 */
export interface HismLayerRuntimeStats {
  clusterCount: number
  visibleClusters: number
  drawCalls: number
  /**
   * 当前各 LOD 级别下的可见实例数（非簇数）。
   *
   * Visible instance counts per LOD level (not cluster counts).
   */
  activeLodCounts: Record<string, number>
}

/**
 * HISM 全局运行时统计。
 *
 * Global HISM runtime statistics.
 */
export interface HismRuntimeStats {
  layerCount: number
  clusterCount: number
  totalInstances: number
  visibleInstances: number
  visibleClusters: number
  drawCalls: number
  activeLodCounts: Record<string, number>
}

/**
 * 已加载 HISM 图层的控制句柄。
 *
 * Handle for a loaded HISM layer.
 */
export interface HismLayer {
  /** 图层 id。Layer id. */
  readonly id: string
  /** Three.js 根节点。Three.js root node. */
  readonly root: Group
  /** 实例总数。Total instance count. */
  readonly instanceCount: number
  /**
   * 当前可见簇内的实例数（随视锥剔除变化）。
   *
   * Instance count in currently visible clusters (changes with frustum culling).
   */
  readonly visibleInstanceCount: number
  /** 是否显示该图层。Whether the layer is visible. */
  show: boolean
  /**
   * 从 Viewer 中移除该图层并释放 GPU 资源。
   *
   * Removes the layer from Viewer and releases GPU resources.
   */
  remove(): void
}

/**
 * 实例矩阵写入回调，由 Viewer 注入以复用椭球定位逻辑。
 *
 * Callback for writing instance matrices, injected by Viewer to reuse ellipsoid
 * placement logic.
 */
export type HismApplyInstanceMatrix = (
  coordinates: CartographicInput,
  frame: CartographicFrameOptions,
  scale: number | [x: number, y: number, z: number] | undefined,
  target: import('three').Matrix4
) => void
