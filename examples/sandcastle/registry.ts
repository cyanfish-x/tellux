import type { SandcastleExample } from "./types"

export const sandcastleExamples: SandcastleExample[] = [
  {
    id: "basic-scene",
    title: "基础场景",
    category: "Viewer",
    description: "创建 Tellux Viewer，加载 ArcGIS 影像，并在东京和上海之间切换相机。",
    tags: ["Viewer", "Camera", "Imagery"],
    code: `const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 650,
    heading: -90,
    pitch: -12
  },
  scene: {
    clouds: false,
    toneMappingExposure: 8
  }
})

const panel = document.createElement("section")
panel.className = "toolbar"
panel.innerHTML = \`
  <header class="toolbar__header">
    <h1>基础场景渲染</h1>
  </header>
  <p>创建 Viewer，通过 XYZ 影像加载 ArcGIS World Imagery。</p>
  <div class="toolbar__row">
    <button class="button" data-city="tokyo" type="button">东京</button>
    <button class="button" data-city="shanghai" type="button">上海</button>
  </div>
\`
container.parentElement?.appendChild(panel)

panel.querySelector('[data-city="tokyo"]')?.addEventListener("click", () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 35.6812,
      longitude: 139.8,
      height: 650
    },
    orientation: {
      heading: -90,
      pitch: -12
    }
  })
})

panel.querySelector('[data-city="shanghai"]')?.addEventListener("click", () => {
  viewer.camera.flyTo({
    destination: {
      latitude: 31.2304,
      longitude: 121.4737,
      height: 1200
    },
    orientation: {
      heading: -80,
      pitch: -18
    }
  })
})

console.log("Viewer ready", viewer)

return () => {
  panel.remove()
  viewer.destroy()
}`,
  },
  {
    id: "fly-to",
    title: "相机飞行",
    category: "Camera",
    description: "使用 Cesium 风格的经纬高目标和 heading / pitch 参数执行相机飞行。",
    tags: ["Camera", "Flight"],
    code: `const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 31.2304,
    longitude: 121.4737,
    height: 2800,
    heading: -60,
    pitch: -24
  },
  scene: {
    clouds: false,
    toneMappingExposure: 8
  }
})

const locations = [
  {
    name: "上海",
    destination: { latitude: 31.2304, longitude: 121.4737, height: 2200 },
    orientation: { heading: -60, pitch: -24 }
  },
  {
    name: "东京",
    destination: { latitude: 35.6812, longitude: 139.7671, height: 1800 },
    orientation: { heading: -90, pitch: -18 }
  },
  {
    name: "新加坡",
    destination: { latitude: 1.3521, longitude: 103.8198, height: 2600 },
    orientation: { heading: 36, pitch: -22 }
  }
]

const panel = document.createElement("section")
panel.className = "toolbar"
panel.innerHTML = \`
  <header class="toolbar__header">
    <h1>相机飞行</h1>
  </header>
  <p>点击城市按钮，使用 viewer.camera.flyTo 切换视角。</p>
  <div class="toolbar__row"></div>
\`
const row = panel.querySelector(".toolbar__row")
for (const location of locations) {
  const button = document.createElement("button")
  button.className = "button"
  button.type = "button"
  button.textContent = location.name
  button.addEventListener("click", () => {
    viewer.camera.flyTo({
      destination: location.destination,
      orientation: location.orientation
    })
    console.log("Fly to", location.name)
  })
  row?.appendChild(button)
}
container.parentElement?.appendChild(panel)

return () => {
  panel.remove()
  viewer.destroy()
}`,
  },
  {
    id: "3d-tiles",
    title: "3D Tiles",
    category: "Tiles",
    description: "通过 viewer.load3DTileset 加载公开 tileset.json，并在加载后飞行到目标。",
    tags: ["3D Tiles", "Tileset", "Flight"],
    code: `const viewer = createTelluxViewer(container, {
  scene: {
    clouds: false,
    toneMappingExposure: 7
  }
})

const tilesetUrl =
  "https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/main/1.0/TilesetWithDiscreteLOD/tileset.json"

const panel = document.createElement("section")
panel.className = "toolbar toolbar--wide"
panel.innerHTML = \`
  <header class="toolbar__header">
    <h1>3D Tiles 加载</h1>
  </header>
  <p>加载 CesiumGS 公开 3D Tiles 示例，并使用 viewer.flyToTarget 定位。</p>
  <p class="status" aria-live="polite">正在加载 3D Tiles...</p>
\`
container.parentElement?.appendChild(panel)

const status = panel.querySelector(".status")
const layer = viewer.load3DTileset({
  type: "url",
  id: "sandcastle-3d-tiles",
  url: tilesetUrl
})

viewer.flyToTarget(layer.tileset, {
  heading: 0,
  pitch: -30
})

if (status) {
  status.textContent = "3D Tiles 已加入场景。"
}
console.log("Tileset layer", layer.id)

return () => {
  layer.remove()
  panel.remove()
  viewer.destroy()
}`,
  },
  {
    id: "atmosphere",
    title: "大气与体积云",
    category: "Rendering",
    description: "开启天空大气、体积云和后处理，并暴露云量与曝光控制。",
    tags: ["Atmosphere", "Clouds", "Post FX"],
    code: `const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 22.4355,
    longitude: 150.7092,
    height: 1744994,
    heading: -34.95,
    pitch: -39.2,
    far: 8000000
  },
  scene: {
    clouds: true,
    skyAtmosphere: true,
    cloudCoverage: 0.35,
    lensFlare: true,
    smaa: true,
    toneMappingExposure: 8
  }
})

viewer.scene.cloudLayerAltitude = 1500
viewer.scene.cloudLayerHeight = 650
viewer.clock.currentTime = new Date("2026-06-08T06:30:00Z")
viewer.clock.animate = false

const panel = document.createElement("section")
panel.className = "toolbar"
panel.innerHTML = \`
  <header class="toolbar__header">
    <h1>大气与体积云</h1>
  </header>
  <label class="field">
    <span>云覆盖率</span>
    <input class="field__input" data-control="coverage" type="range" min="0" max="1" step="0.01" value="0.35" />
  </label>
  <label class="field">
    <span>曝光</span>
    <input class="field__input" data-control="exposure" type="range" min="2" max="14" step="0.1" value="8" />
  </label>
\`
container.parentElement?.appendChild(panel)

panel.querySelector('[data-control="coverage"]')?.addEventListener("input", (event) => {
  viewer.scene.cloudCoverage = Number(event.currentTarget.value)
})

panel.querySelector('[data-control="exposure"]')?.addEventListener("input", (event) => {
  viewer.toneMappingExposure = Number(event.currentTarget.value)
})

return () => {
  panel.remove()
  viewer.destroy()
}`,
  },
]

export function getSandcastleExample(id: string | null) {
  return sandcastleExamples.find((example) => example.id === id) ?? sandcastleExamples[0]
}
