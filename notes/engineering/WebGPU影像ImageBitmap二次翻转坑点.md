# WebGPU 影像 ImageBitmap 二次翻转坑点

> 2026-09-06 复核范围：核对 applyTextureToMaterial 的 ImageBitmap 条件；原线上错缝观察保留，不据此推断其他纹理类型或新版上游上传路径。


本文记录 WebGPU 渲染模式下地形影像瓦片上下颠倒、邻接错缝的根因：`3d-tiles-renderer` 对 ImageBitmap 的预翻转约定与 Three.js WebGPU 上传路径不一致。

## 现象

线上 `webgpu-basic`（生产环境天地图影像 + 地形，`enableTileSplitting: true`）瓦片错乱：

- 全球尺度：大块矩形影像条带错位、陆海拼缝断裂。
- 区域尺度：可辨认的地理轮廓，但瓦片边界错缝、局部颠倒或「重影」。

同配置的 WebGL `basic` 示例正常。

## 根因

### 1. 上游影像纹理的 ImageBitmap 约定

`TiledImageSource.processBufferToTexture`（`3d-tiles-renderer`）：

```js
const imageBitmap = await createImageBitmap(blob, {
  imageOrientation: 'flipY', // 已按 WebGL 习惯预翻转
})
const texture = new Texture(imageBitmap)
// texture.flipY 仍为默认 true
```

`RegionImageSource` 在地形瓦片与单张影像瓦片边界对齐时走**单瓦片快路径**，直接 `texture.clone()` 返回上述 ImageBitmap 纹理（开启 tile splitting 时这是主路径）。

### 2. WebGL 与 WebGPU 对 ImageBitmap + flipY 行为不同

| 后端 | `Texture.flipY === true` 且 image 为 ImageBitmap 时 |
| --- | --- |
| WebGL | **忽略** `UNPACK_FLIP_Y_WEBGL`（见 `WebGLTextures.uploadTexture`）→ 只保留 createImageBitmap 的一次翻转 → 正确 |
| WebGPU | `copyExternalImageToTexture({ flipY: true })` **再翻一次** → 二次翻转 → 上下颠倒 |

WebGL 的 `ImageOverlayPlugin` 通过 `layerMaps` + `layer_uv_*` 采样同一批纹理，因 WebGL 不二次翻转，表现正常。

WebGPU 的 `WebGPUTerrainOverlayPlugin` 把纹理赋给 `material.map`，走 WebGPU 上传路径，快路径瓦片全部颠倒；与仍走 Canvas 合成路径的瓦片混在一起时，表现为错缝 / 错乱。

Three.js 自身也意识到这一点：`GLTFLoader` 对 ImageBitmap 纹理显式设置 `texture.flipY = false`。

### 3. 为何不是 example 配置问题

`examples/webgpu-basic.ts` 与 `examples/basic.ts` 除 `renderer.type: 'webgpu'` 外配置同构。差异只在 Tellux 是否启用 `WebGPUTerrainOverlayPlugin`（`useDirectOverlayTexture`）。

## 修复

在 `WebGPUTerrainOverlayPlugin` 赋 `material.map` 前，对 ImageBitmap 纹理强制：

```ts
texture.flipY = false
texture.needsUpdate = true
```

CanvasTexture 合成路径不受影响（`image` 不是 ImageBitmap，继续用默认 `flipY: true`，与 WebGL 一致）。

## 关联源码

- 修复点：`src/tiles/WebGPUTerrainOverlayPlugin.ts`（`applyTextureToMaterial`）
- 插件入口：`src/tiles/TerrainTilesetFactory.ts`（`useDirectOverlayTexture`）
- 上游快路径：`node_modules/3d-tiles-renderer/.../RegionImageSource.js`（single-tile clone）
- 上游预翻转：`node_modules/3d-tiles-renderer/.../TiledImageSource.js`（`imageOrientation: 'flipY'`）
- WebGL 忽略 ImageBitmap flipY：`three/.../WebGLTextures.js`
- WebGPU 上传翻转：`three/.../WebGPUTextureUtils.js`（`copyExternalImageToTexture`）
