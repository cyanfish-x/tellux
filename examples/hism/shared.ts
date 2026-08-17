import * as THREE from "three"
import { Tree } from "@dgreenheck/ez-tree"
import {
  createWindSwayLeavesMaterial,
  type HismArchetype,
  type RTCAutoUniforms,
} from "../../src"
import { exampleMapServiceConfig } from "../shared"


/** 示例共用场景中心（四姑娘山附近）。 */
export const HISM_DEMO_CENTER = {
  longitude: 103.561611,
  latitude: 31.016963,
} as const

/** 示例共用初始相机姿态。 */
export const HISM_DEMO_VIEW_POSE = {
  latitude: 31.01740061257519,
  longitude: 103.55668103900562,
  height: 1188.4025046429122,
  heading: 12.641958573261494,
  pitch: -27.183678322477718,
  roll: -0.000007808919233872686,
} as const

export const HISM_TREE_PRESETS = [
  { name: "oak_medium", baseScale: 1.0 },
  { name: "pine_medium", baseScale: 1.0 },
  { name: "aspen_medium", baseScale: 1.0 },
] as const

const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

export type HismDemoPlacement = {
  longitude: number
  latitude: number
  heading: number
  scale: number
  presetIndex: number
}

export type HismDemoPresetTemplate = {
  name: string
  baseScale: number
  tree: Tree
  branchesGeometry: THREE.BufferGeometry
  leavesGeometry: THREE.BufferGeometry
  branchesMaterial: THREE.Material | THREE.Material[]
  leavesMaterial: THREE.Material | THREE.Material[]
}

export function createHismDemoViewerOptions(options?: { includeTerrain?: boolean }) {
  const includeTerrain = options?.includeTerrain !== false
  return {
    dracoDecoderPath: "/draco/",
    terrain: includeTerrain ? exampleMapServiceConfig.createTerrainOptions() : undefined,
    layers: [
      {
        source: exampleMapServiceConfig.createImagerySource(),
      },
    ],
    camera: { ...HISM_DEMO_VIEW_POSE },
    scene: {
      atmosphere: {
        show: true,
        lighting: { mode: "light-source" as const },
        fallbackAmbientLight: { intensity: 0.85 },
      },
      clouds: { show: false },
      postProcess: { toneMappingExposure: 7 },
    },
  }
}

export function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function offsetToCartographic(
  centerLongitude: number,
  centerLatitude: number,
  eastMeters: number,
  northMeters: number
) {
  return {
    latitude: centerLatitude + (northMeters / EARTH_RADIUS_METERS) * RAD2DEG,
    longitude:
      centerLongitude +
      (eastMeters /
        (EARTH_RADIUS_METERS * Math.cos(centerLatitude * DEG2RAD))) *
        RAD2DEG,
  }
}

export function cartographicOffsetMeters(
  centerLongitude: number,
  centerLatitude: number,
  longitude: number,
  latitude: number
) {
  return {
    east:
      (longitude - centerLongitude) *
      DEG2RAD *
      EARTH_RADIUS_METERS *
      Math.cos(centerLatitude * DEG2RAD),
    north: (latitude - centerLatitude) * DEG2RAD * EARTH_RADIUS_METERS,
  }
}

export function generateFastPlacements(options: {
  count: number
  centerLongitude: number
  centerLatitude: number
  radiusMeters: number
  seed: number
  presetCount: number
  presetScales?: readonly number[]
}): HismDemoPlacement[] {
  const random = createSeededRandom(options.seed)
  const points: HismDemoPlacement[] = new Array(options.count)
  for (let index = 0; index < options.count; index += 1) {
    const radius = Math.sqrt(random()) * options.radiusMeters
    const angle = random() * Math.PI * 2
    const east = Math.cos(angle) * radius
    const north = Math.sin(angle) * radius
    const coordinates = offsetToCartographic(
      options.centerLongitude,
      options.centerLatitude,
      east,
      north
    )
    const presetIndex = Math.floor(random() * options.presetCount)
    const baseScale = options.presetScales?.[presetIndex] ?? 1
    points[index] = {
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      heading: random() * 360,
      scale: (0.78 + random() * 0.5) * baseScale,
      presetIndex,
    }
  }
  return points
}

export function generatePoissonPlacements(options: {
  count: number
  centerLongitude: number
  centerLatitude: number
  radiusMeters: number
  minSpacingMeters: number
  seed: number
  presetCount: number
  presetScales?: readonly number[]
}): HismDemoPlacement[] {
  const random = createSeededRandom(options.seed)
  const points: HismDemoPlacement[] = []
  const minSpacingSquared = options.minSpacingMeters * options.minSpacingMeters
  const maxAttempts = options.count * 220

  for (
    let attempt = 0;
    attempt < maxAttempts && points.length < options.count;
    attempt += 1
  ) {
    const radius = Math.sqrt(random()) * options.radiusMeters
    const angle = random() * Math.PI * 2
    const east = Math.cos(angle) * radius
    const north = Math.sin(angle) * radius

    if (
      points.some((point) => {
        const offset = cartographicOffsetMeters(
          options.centerLongitude,
          options.centerLatitude,
          point.longitude,
          point.latitude
        )
        const dx = offset.east - east
        const dy = offset.north - north
        return dx * dx + dy * dy < minSpacingSquared
      })
    ) {
      continue
    }

    const coordinates = offsetToCartographic(
      options.centerLongitude,
      options.centerLatitude,
      east,
      north
    )
    const presetIndex = Math.floor(random() * options.presetCount)
    const baseScale = options.presetScales?.[presetIndex] ?? 1
    points.push({
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      heading: random() * 360,
      scale: (0.78 + random() * 0.5) * baseScale,
      presetIndex,
    })
  }

  return points
}

export function buildLegacyTreeTemplate(
  name: string,
  baseScale: number
): HismDemoPresetTemplate {
  const tree = new Tree()
  tree.loadPreset(name)
  return {
    name,
    baseScale,
    tree,
    branchesGeometry: tree.branchesMesh.geometry,
    leavesGeometry: tree.leavesMesh.geometry,
    branchesMaterial: tree.branchesMesh.material,
    leavesMaterial: tree.leavesMesh.material,
  }
}

export function buildHismTreeTemplate(
  name: string,
  baseScale: number,
  rtcUniforms: RTCAutoUniforms
): HismDemoPresetTemplate {
  const tree = new Tree()
  tree.loadPreset(name)
  const branchesMaterial = tree.branchesMesh.material
  const ezLeavesMaterial = tree.leavesMesh.material as THREE.MeshPhongMaterial
  const leavesMaterial = createWindSwayLeavesMaterial({
    map: ezLeavesMaterial.map,
    color: ezLeavesMaterial.color,
    alphaTest: ezLeavesMaterial.alphaTest,
    dithering: ezLeavesMaterial.dithering,
    rtcUniforms,
  })
  ezLeavesMaterial.dispose()
  tree.leavesMesh.material = leavesMaterial
  return {
    name,
    baseScale,
    tree,
    branchesGeometry: tree.branchesMesh.geometry,
    leavesGeometry: tree.leavesMesh.geometry,
    branchesMaterial,
    leavesMaterial,
  }
}

export function buildSimpleTreeArchetypes(
  templates: HismDemoPresetTemplate[]
): HismArchetype[] {
  return templates.map((template) => ({
    name: template.name,
    parts: [
      {
        name: "branches",
        geometry: template.branchesGeometry,
        material: template.branchesMaterial,
      },
      {
        name: "leaves",
        geometry: template.leavesGeometry,
        material: template.leavesMaterial,
      },
    ],
  }))
}

export function buildLodTreeArchetypes(
  templates: HismDemoPresetTemplate[],
  options: {
    nearDistanceMeters: number
    impostorGeometry: THREE.BufferGeometry
    impostorMaterial: THREE.Material
  }
): HismArchetype[] {
  return templates.map((template) => ({
    name: template.name,
    lodLevels: [
      {
        maxDistanceMeters: options.nearDistanceMeters,
        parts: [
          {
            name: "branches",
            geometry: template.branchesGeometry,
            material: template.branchesMaterial,
          },
          {
            name: "leaves",
            geometry: template.leavesGeometry,
            material: template.leavesMaterial,
          },
        ],
      },
      {
        maxDistanceMeters: Number.POSITIVE_INFINITY,
        parts: [
          {
            name: "impostor",
            geometry: options.impostorGeometry,
            material: options.impostorMaterial,
          },
        ],
      },
    ],
  }))
}
