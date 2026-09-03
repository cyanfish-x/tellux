import { getSunDirectionECEF } from "@takram/three-atmosphere"
import { Ellipsoid, Geodetic } from "@takram/three-geospatial"
import type { Light, Mesh, MeshStandardMaterial, Object3D, Texture } from "three"
import {
  Box3,
  Group,
  Matrix4,
  MeshStandardMaterial as MeshStandardMaterialCtor,
  PointLight,
  RectAreaLight,
  Vector3,
} from "three"
import { RectAreaLightTexturesLib } from "three/addons/lights/RectAreaLightTexturesLib.js"
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js"
import { RectAreaLightNode } from "three/webgpu"

const MODEL_ELLIPSOID = Ellipsoid.WGS84
const DEG2RAD = Math.PI / 180
/** 与 three-geospatial Non-geospatial 一致：cosSun < 0.1 时开灯。 */
const NIGHT_LIGHT_SUN_ALTITUDE_THRESHOLD = 0.1
/**
 * 上游把模型和灯放在同一个 `scale={0.01}` 组里，点光 intensity 固定 0.1。
 * 点光照度按世界距离平方衰减：模型放大 N 倍时，要把 intensity 乘 N² 才能在墙上得到同样的暖色 spill。
 * 面光是亮度（nits），面积随父级缩放抵消距离，intensity 保持 0.1。
 *
 * Upstream parents the model and lights under `scale={0.01}` with point intensity 0.1.
 * Point-light illuminance falls with world distance squared, so a model N times larger
 * needs intensity × N² to keep the same warm spill. Rect area lights are nits; area and
 * distance scale together, so intensity stays 0.1.
 */
const UPSTREAM_MODEL_SCALE = 0.01
const UPSTREAM_LIGHT_INTENSITY = 0.1
const RECT_AREA_LIGHT_INTENSITY = 0.1
/**
 * 上游把 `gltf.scene` 平移 `offset`，灯作为 scene 的兄弟停在作者坐标。
 * Tellux 不平移模型（坐标钉在 layer.root），所以灯要写到 scene 局部：`L - offset`。
 *
 * Upstream translates `gltf.scene` by `offset` and leaves lights as siblings at
 * authored coordinates. Tellux does not shift the model (the pin stays on
 * layer.root), so lights must be stored in scene space as `L - offset`.
 */
const UPSTREAM_SCENE_Y_PADDING = 12

const offsetBox = new Box3()
const offsetLocalBox = new Box3()
const offsetInverse = new Matrix4()
const offsetRelative = new Matrix4()

export function computeLittlestTokyoLightOffset(model: Object3D) {
  model.updateWorldMatrix(true, true)
  offsetInverse.copy(model.matrixWorld).invert()
  offsetBox.makeEmpty()
  model.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    if (!mesh.geometry.boundingBox) return
    offsetRelative.multiplyMatrices(offsetInverse, mesh.matrixWorld)
    offsetLocalBox.copy(mesh.geometry.boundingBox).applyMatrix4(offsetRelative)
    offsetBox.union(offsetLocalBox)
  })
  if (offsetBox.isEmpty()) return new Vector3()
  return new Vector3(
    -(offsetBox.max.x + offsetBox.min.x) / 2,
    -offsetBox.min.y - UPSTREAM_SCENE_Y_PADDING,
    -(offsetBox.max.z + offsetBox.min.z) / 2
  )
}

export function pointLightIntensityForModelScale(modelScale: number) {
  const scale = Math.max(1e-6, Math.abs(modelScale))
  return UPSTREAM_LIGHT_INTENSITY * (scale / UPSTREAM_MODEL_SCALE) ** 2
}

export function resolveLittlestTokyoLightParent(root: Object3D) {
  if (root.scale.x !== 1 || root.scale.y !== 1 || root.scale.z !== 1) {
    return root
  }
  if (root.children.length !== 1) return root
  const child = root.children[0]
  if (child.scale.x !== 1 || child.scale.y !== 1 || child.scale.z !== 1) {
    return child
  }
  return root
}

const geodeticPosition = new Vector3()
const surfaceNormal = new Vector3()
const sunDirection = new Vector3()

let rectAreaLightUniformsReady = false

function ensureRectAreaLightUniforms() {
  if (rectAreaLightUniformsReady) return
  // WebGL 走 UniformsLib；WebGPU / TSL 必须再把同一套 LTC 贴图交给 RectAreaLightNode。
  RectAreaLightUniformsLib.init()
  RectAreaLightNode.setLTC(RectAreaLightTexturesLib)
  rectAreaLightUniformsReady = true
}

function isMeshStandardMaterial(material: unknown): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterialCtor
}

function collectBaseColorMaterials(root: Object3D) {
  const materials = new Set<MeshStandardMaterial>()
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const meshMaterials = (object as Mesh).material
    const entries = Array.isArray(meshMaterials) ? meshMaterials : [meshMaterials]
    for (const entry of entries) {
      if (isMeshStandardMaterial(entry)) {
        materials.add(entry)
      }
    }
  })
  const filtered = [...materials].filter(
    (material) => material.map?.name === "baseColor.jpg"
  )
  return filtered.length > 0 ? filtered : [...materials]
}

const POINT_LIGHTS = [
  { position: [95, 115, 29] as const, color: "red" },
  { position: [64, 85, 184] as const, color: "orange" },
  { position: [196, 85, 209] as const, color: "orange" },
  { position: [196, 75, 43] as const, color: "orange" },
  { position: [168, 72, -166] as const, color: "orange" },
] as const

const RECT_AREA_LIGHTS = [
  {
    position: [-130, 46, 75] as const,
    rotationY: Math.PI / 2,
    width: 1.4,
    height: 0.4,
    color: "yellow",
  },
  {
    position: [-68, 43, 145] as const,
    rotationY: Math.PI,
    width: 0.8,
    height: 0.7,
    color: "yellow",
  },
  {
    position: [-52, 43, -77] as const,
    rotationY: Math.PI / 4,
    width: 0.8,
    height: 0.7,
    color: "yellow",
  },
] as const

export interface LittlestTokyoNightRig {
  readonly emissiveMaterials: MeshStandardMaterial[]
  readonly lights: Light[]
  setLightIntensity: (value: number) => void
  dispose: () => void
}

export function computeSunAltitudeAtLocation(
  longitude: number,
  latitude: number,
  date: Date
) {
  const geodetic = new Geodetic(
    longitude * DEG2RAD,
    latitude * DEG2RAD,
    0
  )
  geodetic.toECEF(geodeticPosition)
  MODEL_ELLIPSOID.getSurfaceNormal(geodeticPosition, surfaceNormal)
  getSunDirectionECEF(date, sunDirection)
  return surfaceNormal.dot(sunDirection)
}

export function isNightLightsOn(sunAltitude: number) {
  return sunAltitude < NIGHT_LIGHT_SUN_ALTITUDE_THRESHOLD ? 1 : 0
}

export function setupLittlestTokyoNightRig(
  root: Object3D,
  emissiveMap: Texture
): LittlestTokyoNightRig {
  ensureRectAreaLightUniforms()

  const lightParent = resolveLittlestTokyoLightParent(root)
  const pointLightIntensity = pointLightIntensityForModelScale(lightParent.scale.x)
  const lightOffset = computeLittlestTokyoLightOffset(lightParent)

  const lightsGroup = new Group()
  lightsGroup.name = "littlest-tokyo-night-lights"
  lightParent.add(lightsGroup)

  const emissiveMaterials = collectBaseColorMaterials(lightParent)
  for (const material of emissiveMaterials) {
    material.emissiveMap = emissiveMap
    material.emissive.setScalar(0)
    material.emissiveIntensity = 1
  }

  lightParent.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  const lights: Light[] = []
  for (const config of POINT_LIGHTS) {
    const light = new PointLight(config.color, 0, 0, 2)
    light.position.set(
      config.position[0] - lightOffset.x,
      config.position[1] - lightOffset.y,
      config.position[2] - lightOffset.z
    )
    lightsGroup.add(light)
    lights.push(light)
  }

  for (const config of RECT_AREA_LIGHTS) {
    const light = new RectAreaLight(config.color, 0, config.width, config.height)
    light.position.set(
      config.position[0] - lightOffset.x,
      config.position[1] - lightOffset.y,
      config.position[2] - lightOffset.z
    )
    light.rotation.y = config.rotationY
    lightsGroup.add(light)
    lights.push(light)
  }

  const setLightIntensity = (value: number) => {
    for (const material of emissiveMaterials) {
      material.emissive.setScalar(value * 0.5)
    }
    for (const light of lights) {
      light.intensity = value * (
        light.type === "RectAreaLight" ? RECT_AREA_LIGHT_INTENSITY : pointLightIntensity
      )
    }
  }

  return {
    emissiveMaterials,
    lights,
    setLightIntensity,
    dispose() {
      lightsGroup.removeFromParent()
      for (const light of lights) {
        light.dispose()
      }
    },
  }
}
