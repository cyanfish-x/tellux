# Viewer 基础

`Viewer` 是 Tellux 的公开 API 门面，负责装配渲染器、场景、相机、地形、图层、采样、模型和后处理模块。

## 常用属性

```ts
viewer.scene
viewer.camera
viewer.clock
viewer.layers
viewer.controls
viewer.tileset
viewer.renderer
```

这些属性暴露的是面向应用侧的控制入口。业务代码优先通过这些入口操作，不建议直接穿透内部模块状态。

## 场景配置

`scene` 配置按能力分组：`atmosphere` 管大气、天空和光照，`clouds` 管体积云，`surface` 管基础地球表面材质，`postProcess` 管后处理。

```ts
const viewer = new Viewer(container, {
  scene: {
    atmosphere: {
      lighting: {
        mode: 'light-source'
      },
      scattering: {
        intensity: 0.6
      }
    },
    clouds: {
      show: true,
      quality: 'medium',
      coverage: 0.35
    },
    surface: {
      materialMode: 'auto'
    },
    postProcess: {
      toneMappingExposure: 10,
      smaa: true,
      taa: false // 仅 WebGPU；按需启用
    }
  }
})
```

运行时控制入口保持同样的层级：

```ts
viewer.scene.atmosphere.lighting.mode = 'post-process'
viewer.scene.atmosphere.sky.stars.show = false
viewer.scene.clouds.quality = 'high'
viewer.scene.postProcess.smaa.enabled = true
viewer.scene.postProcess.taa.enabled = true // WebGPU
```

上面的示例只展示了常用字段。`ViewerOptions` 的全部配置项（地形、相机、大气散射参数、云、后处理、renderer、控件等）及每个字段的默认值、单位和取值说明，见 [类型入口 — 配置项参考](../api/types.md#配置项参考)。

## 渲染循环

默认情况下，Tellux 会接管 `renderer.setAnimationLoop`。

```ts
viewer.useDefaultRenderLoop = true
```

如果你需要把 Tellux 嵌入已有 Three.js 渲染循环，可以关闭默认循环并手动推进：

```ts
viewer.useDefaultRenderLoop = false

function animate(time: number) {
  viewer.render(time)
  requestAnimationFrame(animate)
}

requestAnimationFrame(animate)
```

## Renderer 类型

默认情况下，Viewer 使用 Three.js `WebGLRenderer`。可以通过 `renderer.type` 选择实验性的 WebGPU renderer：

```ts
const viewer = await Viewer.create(container, {
  renderer: {
    type: 'webgpu'
  },
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: 'light-source'
      }
    },
    clouds: {
      show: false
    }
  }
})
```

WebGPU renderer 需要异步初始化。使用 `Viewer.create()` 会在返回前等待 `viewer.ready`；如果使用 `new Viewer()`，在外部手动渲染循环里建议先等待：

```ts
const viewer = new Viewer(container, {
  renderer: {
    type: 'webgpu'
  },
  useDefaultRenderLoop: false
})

await viewer.ready
viewer.render()
```

WebGPU 支持目前是实验能力。基础地球、3D Tiles、地形、影像、模型、拾取、大气天空 / 空气透视和星空会走 WebGPU 管线；体积云以及 SMAA、抖动等 WebGL 后处理会降级为不渲染。`scene.postProcess.lensFlare` 已复用同一套强度、阈值与质量档 API；`scene.postProcess.taa` 是已支持的时间抗锯齿，默认关闭，启用后会使用高精度运动矢量和深度重投影历史画面。两者的图顺序为 LensFlare → TAA。星空沿用 `scene.atmosphere.sky.stars` 的 `show`、`intensity` 与 `pointSize` 配置。WebGPU 大气首版使用 Takram node-based 管线，`light-source` 光照模式支持更完整，部分 WebGL 专属的散射调试参数暂不映射。

## 事件

Viewer 目前提供 `click` 和 `mousemove` 事件。事件会返回 canvas 像素坐标，以及当前命中的经纬高。

```ts
viewer.on('click', (event) => {
  console.log(event.position)
  console.log(event.cartographic)
})
```
