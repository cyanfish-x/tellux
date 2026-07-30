#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import * as THREE from 'three'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EARTH_RADIUS_METERS = 6378137
const DEG2RAD = Math.PI / 180

function parsePositiveInteger(flag, fallback) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index] ?? 0
}

function offsetToCartographic(east, north) {
  return [
    east / (DEG2RAD * EARTH_RADIUS_METERS),
    north / (DEG2RAD * EARTH_RADIUS_METERS),
    0
  ]
}

async function main() {
  const instanceCount = parsePositiveInteger('--instances', 20000)
  const iterations = parsePositiveInteger('--iterations', 100)
  const warmupIterations = parsePositiveInteger('--warmup', 10)
  const partCount = parsePositiveInteger('--parts', 4)
  const spacingMeters = 20
  const side = Math.ceil(Math.sqrt(instanceCount))

  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true }
  })

  try {
    const [
      { HismLayerImpl },
      { pickHismLayers },
      { RTCAutoUniforms },
      { createHismPickTraversalStats }
    ] = await Promise.all([
      vite.ssrLoadModule('/src/hism/core/HismLayer.ts'),
      vite.ssrLoadModule('/src/hism/picking/HismPicker.ts'),
      vite.ssrLoadModule('/src/rendering/RTCAutoUniforms.ts'),
      vite.ssrLoadModule('/src/hism/runtime/HismPickMetrics.ts')
    ])

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100000)
    camera.position.set(0, 0, 5000)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    const geometry = new THREE.BoxGeometry(8, 8, 20)
    const materials = Array.from(
      { length: partCount },
      () => new THREE.MeshBasicMaterial()
    )
    const instances = Array.from({ length: instanceCount }, (_, index) => {
      const x = (index % side) - Math.floor(side / 2)
      const y = Math.floor(index / side) - Math.floor(side / 2)
      return {
        coordinates: offsetToCartographic(x * spacingMeters, y * spacingMeters),
        archetype: 0
      }
    })
    const layer = new HismLayerImpl({
      id: 'benchmark',
      archetypes: [{
        parts: materials.map((material, index) => ({
          name: `part-${index}`,
          geometry,
          material
        }))
      }],
      instances,
      clusterCellSizeMeters: 256,
      referenceLongitude: 0,
      referenceLatitude: 0,
      rtcUniforms: new RTCAutoUniforms(camera),
      applyInstanceMatrix: (coordinates, _frame, scale, target) => {
        const [longitude, latitude] = coordinates
        const east = longitude * DEG2RAD * EARTH_RADIUS_METERS
        const north = latitude * DEG2RAD * EARTH_RADIUS_METERS
        const scalar = typeof scale === 'number' ? scale : 1
        target.makeScale(scalar, scalar, scalar).setPosition(east, north, 0)
      },
      onRemove: () => undefined
    })
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

    const runPick = () => {
      const stats = createHismPickTraversalStats()
      const startedAt = performance.now()
      const result = pickHismLayers({
        layers: [layer],
        raycaster,
        stats
      })
      return {
        durationMs: performance.now() - startedAt,
        result,
        stats
      }
    }

    for (let index = 0; index < warmupIterations; index += 1) {
      runPick()
    }

    const samples = []
    let traversalStats = null
    for (let index = 0; index < iterations; index += 1) {
      const sample = runPick()
      samples.push(sample.durationMs)
      traversalStats = sample.stats
      if (!sample.result) {
        throw new Error('Benchmark ray did not hit the center instance.')
      }
    }

    const runtimeStats = layer.collectRuntimeStats()
    console.log(JSON.stringify({
      instanceCount,
      partCount,
      clusterCount: runtimeStats.clusterCount,
      visibleClusters: runtimeStats.visibleClusters,
      iterations,
      p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
      p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
      traversal: traversalStats
    }, null, 2))

    layer.remove()
    geometry.dispose()
    materials.forEach((material) => material.dispose())
  } finally {
    await vite.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
