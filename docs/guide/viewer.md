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
      smaa: true
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
```

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

## 事件

Viewer 目前提供 `click` 和 `mousemove` 事件。事件会返回 canvas 像素坐标，以及当前命中的经纬高。

```ts
viewer.on('click', (event) => {
  console.log(event.position)
  console.log(event.cartographic)
})
```
