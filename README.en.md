# Tellux

[中文](./README.md) | English

[![npm version](https://img.shields.io/npm/v/tellux?style=flat-square)](https://www.npmjs.com/package/tellux) [![license](https://img.shields.io/npm/l/tellux?style=flat-square)](./LICENSE)

Tellux is an open-source 3D Earth Engine built on Three.js for creating digital globes, digital twins, 3D maps, and a wide range of 3D Earth applications in the browser.

Built on Three.js's powerful rendering capabilities and open-source ecosystem, Tellux provides a unified API for organizing globe cameras, Cesium Quantized Mesh terrain, multi-source imagery and vector layers, 3D Tiles, atmospheric sky, volumetric clouds, and post-processing effects. It lets developers focus on building modern web applications ranging from lightweight visualizations to complex 3D Earth scenes.

![](https://picture.cyanfish.site/202607201619427.png)

---

[🌐 Examples](https://tellux.cyanfish.site) | [📚 Documentation (Chinese)](https://tellux.cyanfish.site/docs/) | [🧪 Sandcastle](https://tellux.cyanfish.site/sandcastle.html) | [💻 GitHub](https://github.com/cyanfish-x/tellux)

---

## 🚀 Get started

### npm

Tellux is an ESM package. When using a module bundler such as Vite, Webpack, or Rollup, install Tellux and its required peer dependencies:

```bash
pnpm add tellux three 3d-tiles-renderer @takram/three-geospatial @takram/three-geospatial-effects @takram/three-atmosphere @takram/three-clouds postprocessing
```

Install optional dependencies when using MVT vector tiles:

```bash
pnpm add @mapbox/vector-tile pbf
```

Create a container with a non-zero size, then initialize a Viewer:

```html
<div id="viewer"></div>

<style>
  #viewer {
    width: 100vw;
    height: 100vh;
  }
</style>
```

```ts
import tellux from 'tellux'

const viewer = new tellux.Viewer('viewer', {
  terrain: {
    type: 'url',
    url: 'https://example.com/terrain/'
  },
  overlays: [
    {
      source: {
        type: 'xyz',
        url: 'https://example.com/imagery/{z}/{y}/{x}.png'
      }
    }
  ],
  camera: {
    destination: {
      longitude: 121.4737,
      latitude: 31.2304,
      height: 1200
    },
    orientation: {
      pitch: -25
    }
  }
})
```

### 📚 What next?

- Read the [Getting Started guide](https://tellux.cyanfish.site/docs/guide/getting-started) for Draco decoders, asset paths, and Viewer lifecycle.
- Explore the [guides](https://tellux.cyanfish.site/docs/guide/viewer) for cameras, interaction, terrain, imagery, 3D Tiles, models, atmosphere, and post-processing.
- Browse and edit runnable examples in [Sandcastle](https://tellux.cyanfish.site/sandcastle.html).
- Consult the public [Viewer API](https://tellux.cyanfish.site/docs/api/viewer) and [type reference](https://tellux.cyanfish.site/docs/api/types).
- Interested in contributing? Read the [Contributing Guide](./CONTRIBUTING.en.md), then open an issue or pull request. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## ⚖️ License

[MIT](./LICENSE). Tellux is free for commercial and non-commercial use.

## 🌍 Where does geospatial content come from?

Tellux is a runtime and rendering library; it does not bind or host base geospatial content. Use any combination of:

- Cesium quantized-mesh terrain, XYZ, WMS, WMTS, GeoJSON, MVT, and 3D Tiles from self-hosted or public services.
- Terrain, imagery, and 3D Tiles assets accessed with a Cesium Ion token.
- Application-owned glTF / GLB models and Three.js objects placed at cartographic coordinates.

Cesium Ion is an optional data service. Tellux APIs support both self-hosted URLs and Cesium Ion assets for terrain, imagery, and 3D Tiles. Data licensing, availability, and access control remain the responsibility of the application and data provider.

## ✨ Features

- Control a WGS84 globe using longitude, latitude, height, heading, pitch, and roll, with flights, picking, and height sampling.
- Load Cesium quantized-mesh terrain, XYZ, WMS, WMTS, Cesium Ion imagery, and draped GeoJSON and MVT vector overlays.
- Load URL- or Cesium Ion-based 3D Tiles, plus glTF / GLB models with animation and ground alignment.
- Build geospatial scenes with atmospheric sky, aerial perspective, volumetric clouds, day-night lighting, SMAA, lens flare, and dithering; WebGPU supports lens flare and optional TAA.
- Interoperate with Three.js scenes, objects, coordinate conversion, and custom render loops.
- The [Gaussian splat example](https://tellux.cyanfish.site/gaussian-splat-3d-tiles.html) switches between SvirnasAlyt, Elevator, Cesium ion, and standalone Spark assets (WebGL; the official ion sample can use a public evaluation token).
- Use WebGL by default. The experimental WebGPU renderer supports the base globe, terrain, imagery, 3D Tiles, models, picking, atmosphere, lens flare, and optional TAA; see [Known limitations](https://tellux.cyanfish.site/docs/guide/limitations).

## 🛠️ Development

```bash
pnpm install
pnpm type-check
pnpm test:run
pnpm build
```

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `pnpm dev`            | Start the examples and documentation sites |
| `pnpm type-check`     | Run TypeScript type checking               |
| `pnpm test:run`       | Run tests                                  |
| `pnpm build`          | Build library output and declarations      |
| `pnpm build:examples` | Build the documentation and examples site  |

See the [0.3 migration guide](docs/guide/migration-0.3.md) for camera snapshots, domain facades, and entity outlines.
