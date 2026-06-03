# Tellux

Tellux is a Three.js-based GIS viewer for Cesium Ion 3D Tiles with globe controls, atmospheric scattering, clouds, lens flare, SMAA, and dithering effects.

The npm package name is `tellux` because npm package names must be lowercase.

## Install

```bash
npm install tellux three 3d-tiles-renderer postprocessing @takram/three-atmosphere @takram/three-clouds @takram/three-geospatial @takram/three-geospatial-effects
```

## Usage

```ts
import { Viewer, CesiumIonResource } from 'tellux'

const container = document.querySelector('#viewer') as HTMLElement

const viewer = new Viewer(container, {
  imageryProvider: CesiumIonResource.fromAssetId(2275207, {
    apiToken: import.meta.env.VITE_CESIUM_ION_TOKEN
  }),
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 500
  }
})
```

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

## API

```ts
viewer.camera.setView({
  latitude: 31.2304,
  longitude: 121.4737,
  height: 1000,
  heading: -90,
  pitch: -15
})

viewer.scene.clouds.show = false
viewer.scene.skyAtmosphere.show = true
viewer.scene.postProcessStages.smaa.enabled = true
viewer.toneMappingExposure = 8
viewer.resolutionScale = 1.5

viewer.destroy()
```
