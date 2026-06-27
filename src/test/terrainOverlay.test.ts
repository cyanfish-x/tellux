import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { ImageryLayer } from '../LayerManager'
import { LayerManager } from '../LayerManager'
import { ImageryOverlayFactory } from '../tiles/ImageryOverlayFactory'
import { TerrainTilesetFactory } from '../tiles/TerrainTilesetFactory'
import { WebGPUTerrainOverlayPlugin } from '../tiles/WebGPUTerrainOverlayPlugin'

describe('terrain imagery overlays', () => {
  it('notifies initial imagery layers so the viewer can rebuild terrain with overlays', () => {
    const changes: Array<{ type: string; layerCount: number }> = []

    new LayerManager([
      {
        id: 'satellite',
        source: {
          type: 'xyz',
          url: 'https://example.test/tiles/{z}/{y}/{x}.jpg'
        }
      }
    ], (layers, change) => {
      changes.push({
        type: change.type,
        layerCount: layers.length
      })
    })

    expect(changes).toEqual([
      {
        type: 'structure',
        layerCount: 1
      }
    ])
  })

  it('attaches visible imagery layers to terrain tilesets', () => {
    const imageryOverlayFactory = new ImageryOverlayFactory({
      renderer: {} as never,
      transparentOverlayTexture: {} as never
    })
    const terrainTilesetFactory = new TerrainTilesetFactory({
      imageryOverlayFactory,
      getSurfaceMaterialMode: () => 'standard',
      getSurfaceMaterialOptions: () => ({
        roughness: 1,
        metalness: 0,
        useRoughnessMap: false
      }),
      useDirectOverlayTexture: false,
      registerCommonTilesetPlugins: () => {}
    })
    const layer = new ImageryLayer({
      id: 'satellite',
      source: {
        type: 'xyz',
        url: 'https://example.test/tiles/{z}/{y}/{x}.jpg',
        levels: 19
      }
    }, {
      remove: () => true,
      move: () => true,
      update: () => {}
    })

    const { tileset, imageryContext } = terrainTilesetFactory.create({
      type: 'cesium-ion',
      assetId: 1,
      apiToken: 'test-token'
    }, [layer], () => 0)
    const overlayPlugin = tileset.getPluginByName('IMAGE_OVERLAY_PLUGIN') as {
      overlays?: unknown[]
      enableTileSplitting?: boolean
    } | null

    expect(imageryContext.overlays.size).toBe(1)
    expect(overlayPlugin?.overlays).toHaveLength(1)
    expect(overlayPlugin?.enableTileSplitting).toBe(true)
  })

  it('keeps explicit terrain imagery tile splitting enabled', () => {
    const imageryOverlayFactory = new ImageryOverlayFactory({
      renderer: {} as never,
      transparentOverlayTexture: {} as never
    })
    const terrainTilesetFactory = new TerrainTilesetFactory({
      imageryOverlayFactory,
      getSurfaceMaterialMode: () => 'standard',
      getSurfaceMaterialOptions: () => ({
        roughness: 1,
        metalness: 0,
        useRoughnessMap: false
      }),
      useDirectOverlayTexture: false,
      registerCommonTilesetPlugins: () => {}
    })

    const { tileset } = terrainTilesetFactory.create({
      type: 'cesium-ion',
      assetId: 1,
      apiToken: 'test-token',
      tileLoading: {
        enableTileSplitting: true
      }
    }, [], () => 0)
    const overlayPlugin = tileset.getPluginByName('IMAGE_OVERLAY_PLUGIN') as {
      enableTileSplitting?: boolean
    } | null

    expect(overlayPlugin?.enableTileSplitting).toBe(true)
  })

  it('uses a WebGPU compatible terrain overlay plugin for direct overlay textures', () => {
    const imageryOverlayFactory = new ImageryOverlayFactory({
      renderer: {} as never,
      transparentOverlayTexture: {} as never
    })
    const terrainTilesetFactory = new TerrainTilesetFactory({
      imageryOverlayFactory,
      getSurfaceMaterialMode: () => 'standard',
      getSurfaceMaterialOptions: () => ({
        roughness: 1,
        metalness: 0,
        useRoughnessMap: false
      }),
      useDirectOverlayTexture: true,
      registerCommonTilesetPlugins: () => {}
    })
    const layer = new ImageryLayer({
      id: 'satellite',
      source: {
        type: 'xyz',
        url: 'https://example.test/tiles/{z}/{y}/{x}.jpg',
        levels: 19
      }
    }, {
      remove: () => true,
      move: () => true,
      update: () => {}
    })

    const { tileset, imageryContext } = terrainTilesetFactory.create({
      type: 'cesium-ion',
      assetId: 1,
      apiToken: 'test-token'
    }, [layer], () => 0)
    const webgpuOverlayPlugin = tileset.getPluginByName('TELLUX_WEBGPU_TERRAIN_OVERLAY_PLUGIN') as {
      overlays?: unknown[]
      enableTileSplitting?: boolean
      fetchData?: (url: string) => unknown
    } | null

    expect(tileset.getPluginByName('IMAGE_OVERLAY_PLUGIN')).toBeNull()
    expect(imageryContext.overlays.size).toBe(1)
    expect(webgpuOverlayPlugin?.overlays).toHaveLength(1)
    expect(webgpuOverlayPlugin?.enableTileSplitting).toBe(true)
    expect(webgpuOverlayPlugin?.fetchData?.('child.image_overlay_tile_split')).toBeInstanceOf(ArrayBuffer)
    expect(imageryContext.plugin).toBe(webgpuOverlayPlugin)
  })

  it('applies splitting plugin textures directly to WebGPU terrain tile materials', () => {
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)
    const overlay = { opacity: 1 }
    const tile = {}

    const plugin = new WebGPUTerrainOverlayPlugin([overlay as never], 512)
    const splittingPlugin = (plugin as unknown as {
      splittingPlugin: {
        overlays: unknown[]
        overlayInfo: Map<unknown, {
          tileInfo: Map<unknown, {
            target: unknown
            meshInfo: Map<THREE.Mesh, { attribute: THREE.BufferAttribute }>
          }>
        }>
        _updateLayers: (tile: unknown) => void
      }
    }).splittingPlugin
    splittingPlugin.overlays = [overlay]
    splittingPlugin.overlayInfo = new Map([
      [overlay, {
        tileInfo: new Map([
          [tile, {
            target: texture,
            meshInfo: new Map([
              [mesh, {
                attribute: new THREE.BufferAttribute(new Float32Array([
                  0, 0, 1,
                  1, 0, 1,
                  1, 1, 1,
                  0, 1, 1
                ]), 3)
              }]
            ])
          }]
        ])
      }]
    ])

    splittingPlugin._updateLayers(tile)

    expect(material.map).toBe(texture)
  })

  it('uses overlay-projected UVs for WebGPU terrain direct textures', () => {
    const overlay = { opacity: 1 }
    const tile = {}
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0,
      1, 0,
      1, 1
    ]), 2))

    const plugin = new WebGPUTerrainOverlayPlugin([overlay as never], 512)
    const splittingPlugin = (plugin as unknown as {
      splittingPlugin: {
        overlays: unknown[]
        overlayInfo: Map<unknown, {
          tileInfo: Map<unknown, {
            target: unknown
            meshInfo: Map<THREE.Mesh, { attribute: THREE.BufferAttribute }>
          }>
        }>
        _updateLayers: (tile: unknown) => void
      }
    }).splittingPlugin
    splittingPlugin.overlays = [overlay]
    splittingPlugin.overlayInfo = new Map([
      [overlay, {
        tileInfo: new Map([
          [tile, {
            target: new THREE.Texture(),
            meshInfo: new Map([
              [mesh, {
                attribute: new THREE.BufferAttribute(new Float32Array([
                  0.25, 0.5, 1,
                  0.75, 0.5, 1,
                  0.75, 0.9, 1
                ]), 3)
              }]
            ])
          }]
        ])
      }]
    ])

    splittingPlugin._updateLayers(tile)

    expect(Array.from(mesh.geometry.getAttribute('uv').array)).toEqual([
      0.25, 0.5,
      0.75, 0.5,
      0.75, expect.closeTo(0.9)
    ])
  })

  it('does not refetch a coarser terrain range outside the splitting plugin pipeline', async () => {
    const material = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)
    const calls: string[] = []
    const tile = {
      boundingVolume: {
        region: [0, 0, 1, 1, 0, 1]
      }
    }
    const overlay = {
      opacity: 1,
      isReady: true,
      isPlanarProjection: false,
      aspectRatio: 1,
      projection: {
        clampToBounds: (range: number[]) => range,
        toNormalizedRange: (range: number[]) => range
      },
      init: () => Promise.resolve(),
      whenReady: () => {
        calls.push('whenReady')
        return Promise.resolve()
      },
      setResolution: () => {},
      hasContent: () => true,
      lockTexture: () => {
        calls.push('lockTexture')
      },
      getTexture: () => {
        calls.push('getTexture')
        return new THREE.Texture()
      },
      releaseTexture: () => {}
    }

    const plugin = new WebGPUTerrainOverlayPlugin([overlay as never], 512)
    const internals = plugin as unknown as {
      splittingPlugin: {
        processTileModel: (scene: THREE.Object3D, tile: unknown) => Promise<void>
      }
    }
    internals.splittingPlugin.processTileModel = async () => {}

    await plugin.processTileModel(mesh, tile)

    expect(calls).toEqual([])
    expect(material.map).toBeNull()
  })

  it('raises terrain traversal error when imagery pixels need a higher LOD', () => {
    const plugin = new WebGPUTerrainOverlayPlugin([{
      opacity: 1,
      isReady: true,
      projection: {
        clampToBounds: (range: number[]) => range
      }
    } as never], 256)
    ;(plugin as unknown as {
      tiles: {
        ellipsoid: {
          radius: THREE.Vector3
        }
        cameraInfo: Array<{
          isOrthographic: boolean
          pixelSize: number
          position: THREE.Vector3
          frustum: unknown
        }>
      }
    }).tiles = {
      ellipsoid: {
        radius: new THREE.Vector3(6378137, 6378137, 6356752)
      },
      cameraInfo: [{
        isOrthographic: true,
        pixelSize: 100,
        position: new THREE.Vector3(),
        frustum: {}
      }]
    }
    const target = {
      inView: true,
      error: 0,
      distance: Infinity
    }

    const handled = plugin.calculateTileViewError({
      boundingVolume: {
        region: [0, 0, Math.PI / 128, Math.PI / 128, 0, 100]
      },
      engineData: {
        boundingVolume: {
          intersectsFrustum: () => true,
          distanceToPoint: () => 1000
        }
      }
    }, target)

    expect(handled).toBe(true)
    expect(target.error).toBeGreaterThan(1)
  })

  it('does not adjust traversal error when WebGPU terrain tile splitting is disabled', () => {
    const plugin = new WebGPUTerrainOverlayPlugin([{
      opacity: 1,
      isReady: true,
      projection: {
        clampToBounds: (range: number[]) => range
      }
    } as never], 256, false)
    const target = {
      inView: true,
      error: 0,
      distance: Infinity
    }

    const handled = plugin.calculateTileViewError({
      boundingVolume: {
        region: [0, 0, Math.PI / 128, Math.PI / 128, 0, 100]
      }
    }, target)

    expect(handled).toBe(false)
    expect(target.error).toBe(0)
  })
})
