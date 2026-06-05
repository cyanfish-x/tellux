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
      source: tellux.TemplateUrlResource.fromUrl(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      )
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

You can still use Cesium Ion resources:

```ts
new tellux.Viewer(container, {
  layers: [
    {
      source: tellux.CesiumIonResource.fromAssetId(2275207, {
        apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN
      })
    }
  ]
})
```

Imagery layers are managed through `viewer.layers`. Layers are drawn from bottom to top:

```ts
const imageryLayer = viewer.layers.add({
  name: 'World Imagery',
  source: tellux.TemplateUrlResource.fromUrl(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  )
})

imageryLayer.setVisible(false)
imageryLayer.setStyle({ opacity: 0.65 })
imageryLayer.moveTo(0)
imageryLayer.remove()
```

MVT vector tiles can be used as imagery layers with `MVTResource`:

```ts
viewer.layers.add({
  name: 'Water and roads',
  source: tellux.MVTResource.fromUrl('https://example.com/tiles/{z}/{x}/{y}.pbf', {
    getStyle(layerName) {
      if (layerName.includes('water')) return { fill: '#38bdf8', order: 10 }
      if (layerName.includes('transportation')) return { stroke: '#facc15', strokeWidth: 1.4, order: 30 }
      return null
    }
  })
})
```

`MVTResource` uses the `3d-tiles-renderer` MVT overlay and requires `@mapbox/vector-tile` and `pbf` at runtime.

WMS services can be used as imagery layers with `WMSResource`:

```ts
viewer.layers.add({
  name: 'Province boundary',
  source: tellux.WMSResource.fromUrl('https://example.com/geoserver/wms', 'workspace:layer', {
    crs: 'EPSG:4326',
    format: 'image/png',
    transparent: true
  }),
  style: {
    opacity: 0.7
  }
})
```

For example, a GeoServer WMS 1.1.0 service:

```ts
viewer.layers.add({
  name: 'China Province WMS',
  source: tellux.WMSResource.fromUrl('http://localhost:8080/geoserver/YX_yimin/wms', 'YX_yimin:china_province', {
    version: '1.1.0',
    crs: 'EPSG:4326',
    styles: '',
    format: 'image/png',
    transparent: true,
    contentBoundingBox: [73.501142, 3.397162, 135.088511, 53.560901]
  }),
  style: {
    opacity: 0.72
  }
})
```

> WMS layers should request an image format such as `image/png`. `format=application/openlayers` is usually a GeoServer preview page format and is not suitable for imagery textures.

Make sure the container has a non-zero size:

```css
#viewer {
  width: 100vw;
  height: 100vh;
}
```

## Draco decoder

Tellux uses `DRACOLoader` for glTF tiles. By default it loads decoders from `/draco/gltf/`.

Copy the decoder files from `three/examples/jsm/libs/draco/gltf/` into your app's public directory, or pass a custom path:

```ts
new Viewer(container, {
  dracoDecoderPath: '/assets/draco/gltf/'
})
```

## Static asset directory

Tellux loads cloud and STBN textures from upstream asset URLs by default. For intranet deployments,
put `local_weather.png`, `turbulence.png`, `shape.bin`, `shape_detail.bin`, and `stbn.bin` in your
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

viewer.scene.clouds.show = false
viewer.scene.skyAtmosphere.show = true
viewer.scene.postProcessStages.smaa.enabled = true
viewer.toneMappingExposure = 8
viewer.resolutionScale = 1.5

viewer.destroy()
```
