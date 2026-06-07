# Tellux

English | [中文](./README.md)

Tellux is a Three.js-based GIS viewer for Cesium Ion 3D Tiles with globe controls, atmospheric scattering, clouds, lens flare, SMAA, and dithering effects.

The npm package name is `tellux` because npm package names must be lowercase.

Live demo: https://tellux.cyanfish.site

## Install

```bash
npm install tellux three 3d-tiles-renderer postprocessing @takram/three-atmosphere @takram/three-clouds @takram/three-geospatial @takram/three-geospatial-effects @mapbox/vector-tile pbf
```

## Usage

```ts
import tellux from 'tellux'

const container = document.querySelector('#viewer') as HTMLElement

const viewer = new tellux.Viewer(container, {
  terrain: {
    url: 'https://example.com/terrain/'
  },
  layers: [
    {
      source: {
        type: 'xyz',
        url: 'https://example.com/imagery/{z}/{y}/{x}.png'
      }
    }
  ],
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 500
  }
})
```

`terrain.url` accepts a Cesium quantized-mesh terrain root directory or a direct `layer.json` URL. You can switch terrain at runtime:

```ts
viewer.setTerrain({
  url: 'https://example.com/another-terrain/layer.json'
})

viewer.setTerrain(null)
```

You can also use Cesium Ion imagery sources:

```ts
new tellux.Viewer(container, {
  layers: [
    {
      source: {
        type: 'cesium-ion',
        assetId: 2275207,
        apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN
      }
    }
  ]
})
```

Imagery layers are managed through `viewer.layers`. Layers are drawn from bottom to top:

```ts
const imageryLayer = viewer.layers.add({
  name: 'World Imagery',
  source: {
    type: 'xyz',
    url: 'https://example.com/imagery/{z}/{y}/{x}.png'
  }
})

imageryLayer.setVisible(false)
imageryLayer.setStyle({ opacity: 0.65 })
imageryLayer.moveTo(0)
imageryLayer.remove()
```

MVT vector tiles can be used as imagery layers:

```ts
viewer.layers.add({
  name: 'Water and roads',
  source: {
    type: 'mvt',
    url: 'https://example.com/tiles/{z}/{x}/{y}.pbf'
  },
  style: {
    getStyle(layerName) {
      if (layerName.includes('water')) return { fill: '#38bdf8', order: 10 }
      if (layerName.includes('transportation')) return { stroke: '#facc15', strokeWidth: 1.4, order: 30 }
      return null
    }
  }
})
```

MVT layers use the `3d-tiles-renderer` MVT overlay and require `@mapbox/vector-tile` and `pbf` at runtime.

GeoJSON can be used as a draped vector overlay:

```ts
viewer.layers.add({
  name: 'Area boundary',
  source: {
    type: 'geojson',
    url: '/data/boundary.geojson'
  },
  style: {
    opacity: 0.85,
    fill: 'rgba(20, 184, 166, 0.28)',
    stroke: '#14b8a6',
    strokeWidth: 2,
    getStyle(feature, properties) {
      if (properties?.kind === 'restricted') return { fill: 'rgba(244, 63, 94, 0.32)', stroke: '#f43f5e' }
      return {}
    }
  }
})
```

You can also pass a GeoJSON object directly:

```ts
viewer.layers.add({
  source: {
    type: 'geojson',
    geojson
  }
})
```

WMS services can be used as imagery layers:

```ts
viewer.layers.add({
  name: 'Province boundary',
  source: {
    type: 'wms',
    url: 'https://example.com/geoserver/wms',
    layer: 'workspace:layer',
    crs: 'EPSG:4326',
    format: 'image/png',
    transparent: true
  },
  style: {
    opacity: 0.7
  }
})
```

For example, a GeoServer WMS 1.1.0 service:

```ts
viewer.layers.add({
  name: 'China Province WMS',
  source: {
    type: 'wms',
    url: 'https://example.com/geoserver/wms',
    layer: 'workspace:province_boundary',
    version: '1.1.0',
    crs: 'EPSG:4326',
    styles: '',
    format: 'image/png',
    transparent: true,
    contentBoundingBox: [73.501142, 3.397162, 135.088511, 53.560901]
  },
  style: {
    opacity: 0.72
  }
})
```

> WMS layers should request an image format such as `image/png`. `format=application/openlayers` is usually a GeoServer preview page format and is not suitable for imagery textures.

## glTF / GLB models

Use `viewer.addModel(...)` to load regular glTF or GLB models and place them in the Tellux scene with cartographic coordinates. `coordinates` accepts a `[longitude, latitude, height]` tuple or a `{ longitude, latitude, height }` object. Height is in meters.

```ts
const model = viewer.addModel({
  type: 'gltf',
  id: 'littlest-tokyo',
  url: 'https://threejs.org/examples/models/gltf/LittlestTokyo.glb',
  coordinates: [114, 30, 0],
  scale: 0.45,
  heading: 180,
  alignToGround: true,
  animate: true,
  animationChannel: 0
})

await model.ready

viewer.flyToTarget(model.root, {
  heading: -35,
  pitch: -28,
  distance: 2600
})

model.playAnimation(0)
model.pauseAnimation()
model.stopAnimation()
model.remove()
```

`type` is always `'gltf'`, and the URL can point to either `.gltf` or `.glb`. When `animate: true` is set, the first animation channel plays after loading by default. Use `animationChannel` to choose another channel.

If you need to place your own Three.js objects, reuse Tellux coordinate conversion APIs:

```ts
const position = viewer.cartographicToVector3([114, 30, 100])

const matrix = viewer.cartographicToMatrix4([114, 30, 0], {
  heading: 90,
  pitch: 0,
  roll: 0
})

object.matrixAutoUpdate = false
object.matrix.copy(matrix)
viewer.scene.threeScene.add(object)
```

`cartographicToVector3(...)` returns the underlying Three.js world position. `cartographicToMatrix4(...)` returns a local Three.js object matrix where `+Y` points up and `+Z` points forward.

## Lighting Modes

Tellux provides two atmosphere lighting modes. The default is `light-source`:

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    atmosphereLightingMode: 'light-source'
  }
})
```

`light-source` uses Takram's sun directional light and sky light probe in the Three.js scene. It is the best default for most 3D GIS scenes: 3D Tiles, terrain, imagery overlays, custom Three.js objects, and PBR materials can all use the normal Three.js lighting path. You can tune the light source intensity with `atmosphereSunLightIntensity` and `atmosphereSkyLightIntensity`:

```ts
viewer.scene.atmosphereLightingMode = 'light-source'
viewer.scene.atmosphereSunLight = true
viewer.scene.atmosphereSkyLight = true
viewer.scene.atmosphereSunLightIntensity = 1.2
viewer.scene.atmosphereSkyLightIntensity = 0.8
```

`post-process` is Takram's native aerial-perspective post-process lighting path. It treats the rendered color buffer as surface albedo, then applies sun light, sky light, atmospheric transmittance, and in-scattering in `AerialPerspectiveEffect`. This mode is useful for advanced scenes that want a more unified atmospheric post-process look, but the input materials should be albedo materials unaffected by Three.js lights, such as `MeshBasicMaterial` or glTF `KHR_materials_unlit`.

When loading 3D Tiles, if the source data is not already unlit but you want it to participate in `post-process` lighting, use `materialMode: 'unlit'` explicitly:

```ts
viewer.scene.atmosphereLightingMode = 'post-process'
viewer.scene.atmosphereSunLight = true
viewer.scene.atmosphereSkyLight = true
viewer.scene.atmosphereAlbedoScale = 0.6

const layer = viewer.load3DTileset({
  type: 'url',
  url: 'https://example.com/tileset.json',
  materialMode: 'unlit'
})
```

If PBR or other lit materials are used in `post-process` mode, the Three.js light sources are disabled and the tiles may already be dark or black before the post-process lighting runs. In that case, either use the default `light-source` mode or load the 3D Tiles that need post-process lighting with `materialMode: 'unlit'`.

Make sure the container has a non-zero size:

```css
#viewer {
  width: 100vw;
  height: 100vh;
}
```

## Draco decoder

Tellux uses `DRACOLoader` for glTF tiles and glTF / GLB models. By default it loads decoders from `/draco/gltf/`.

Copy the decoder files from `three/examples/jsm/libs/draco/gltf/` into your app's public directory, or pass a custom path:

```ts
new Viewer(container, {
  dracoDecoderPath: '/assets/draco/gltf/'
})
```

## Static asset directory

Tellux loads cloud, STBN, and star field assets from upstream asset URLs by default. For intranet deployments,
put `local_weather.png`, `turbulence.png`, `shape.bin`, `shape_detail.bin`, `stbn.bin`, and `stars.bin` in your
own static directory and set `tellux.baseUrl` before creating the Viewer:

```ts
import tellux from 'tellux'

tellux.baseUrl = '/assets/tellux/'

new tellux.Viewer(container)
```

## API

```ts
viewer.camera.setView({
  latitude: 31.2304,
  longitude: 121.4737,
  height: 1000,
  heading: -90,
  pitch: -15
})

viewer.flyToTarget({
  latitude: 31.2304,
  longitude: 121.4737,
  height: 0
}, {
  heading: -90,
  pitch: -30,
  distance: 1200
})

const layer = viewer.load3DTileset({
  type: 'url',
  url: 'https://example.com/tileset.json'
})

viewer.flyToTarget(layer.tileset, {
  heading: 0,
  pitch: -30
})

const model = viewer.addModel({
  type: 'gltf',
  url: '/models/site.glb',
  coordinates: [121.4737, 31.2304, 0],
  animate: true
})

await model.ready
viewer.flyToTarget(model.root)

viewer.scene.clouds.show = false
viewer.scene.skyAtmosphere.show = true
viewer.scene.postProcessStages.smaa.enabled = true
viewer.toneMappingExposure = 8
viewer.resolutionScale = 1.5

viewer.destroy()
```
