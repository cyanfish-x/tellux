import tellux from "../src"
import { createTiandituXYZImagery } from "./shared"

const DEFAULT_ION_TERRAIN_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? "1"
const DEFAULT_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""

// Hero 地球自转角速度（度/秒），约 120 秒一圈。
// Auto-rotation angular speed (degrees/second), roughly one revolution per 120 s.
const AUTO_ROTATE_SPEED_DEG_PER_SEC = 3

// 仅当相机高于此高度（米）才自转：低空视角是用户在看具体区域，自转会打断阅读。
// Auto-rotate only above this height (meters): at low altitude the user is inspecting a region and rotation would be disruptive.
const AUTO_ROTATE_MIN_HEIGHT = 460000

// 用户停止操作相机后多久恢复自转（毫秒）：给一个阅读缓冲，避免刚松手又被带走。
// How long after the user stops interacting before auto-rotation resumes (ms): a grace period so the view isn't pulled away the instant they release.
const AUTO_ROTATE_RESUME_DELAY = 2000

const nav = document.querySelector(".portal-nav")
const docsLink = document.querySelector<HTMLAnchorElement>("[data-docs-link]")
const globeContainer = document.querySelector("#portal-globe-viewer")

const getDocsUrl = () => {
  const isLocalExamplesDev =
    (window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost") &&
    window.location.port === "5173"

  if (isLocalExamplesDev) {
    // 开发时文档站由 docs:dev 独立跑在 5174 根路径（vitepress dev docs，无 base），
    // 不带 /docs 前缀；生产构建后文档部署到 ./docs/ 子路径。
    return "http://127.0.0.1:5174/"
  }

  return new URL("./docs/", window.location.href).toString()
}

if (docsLink) {
  docsLink.href = getDocsUrl()
}

if (nav instanceof HTMLElement) {
  const updateNavigationSurface = () => {
    nav.toggleAttribute("data-scrolled", window.scrollY > 24)
  }

  updateNavigationSurface()
  window.addEventListener("scroll", updateNavigationSurface, { passive: true })
}

document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href")
    if (!targetId || targetId === "#") {
      return
    }

    const target = document.querySelector(targetId)
    if (!(target instanceof HTMLElement)) {
      return
    }

    event.preventDefault()
    target.scrollIntoView({ behavior: "smooth", block: "start" })
  })
})

if (globeContainer instanceof HTMLElement) {
  const viewer = new tellux.Viewer(globeContainer, {
    dracoDecoderPath: "/draco/gltf/",
    terrain: DEFAULT_ION_TOKEN
      ? {
          type: "cesium-ion",
          assetId: DEFAULT_ION_TERRAIN_ASSET_ID,
          apiToken: DEFAULT_ION_TOKEN,
          tileLoading: {
            enableTileSplitting: true,
          },
        }
      : undefined,
    layers: [
      {
        source: createTiandituXYZImagery(),
      },
    ],
    camera: {
      latitude: 37.3006381769495,
      longitude: 109.11101722751532,
      height: 6406304.285449645,
      heading: -10.737398475171885,
      pitch: -89.81337176751433,
      roll: 0.648027734186861,
      far: 8000000,
    },
    scene: {
      atmosphere: {
        show: true,
      },
      clouds: {
        show: false,
        coverage: 0.35,
      },
    },
    resolutionScale: Math.min(window.devicePixelRatio, 1.5),
  })

  viewer.scene.clouds.layerAltitude = 1500
  viewer.scene.clouds.layerHeight = 650
  viewer.clock.hourUTC = 9.2
  viewer.clock.animate = false
  ;(window as any).viewer = viewer
  ;(window as any).portalViewer = viewer

  // Hero 地球自转：相机经度持续推进，陆地依次滚过视场。
  // 触发规则：用户开始操作相机（拖拽 / 缩放，含滚轮）时立即停转，松手 AUTO_ROTATE_RESUME_DELAY 毫秒后恢复；
  // 相机高度低于 AUTO_ROTATE_MIN_HEIGHT 时不推进经度（低空是用户在看具体区域，不应被打断）。
  // 与 Viewer 默认渲染循环里的 controls.update 在时间上互斥——自转期间用户不操作，
  // controls.update 无输入是静态的，setView 安全覆盖相机；操作期间 rAF 已停，由 controls 全权接管。
  //
  // Hero globe auto-rotation: the camera longitude advances each frame so landmasses drift across the view.
  // Trigger rules: the moment the user starts interacting (drag / zoom, including the wheel) rotation stops, and resumes
  // AUTO_ROTATE_RESUME_DELAY ms after they release; below AUTO_ROTATE_MIN_HEIGHT the longitude never advances (at low
  // altitude the user is inspecting a region and shouldn't be interrupted). Mutually exclusive in time with controls.update
  // from the default render loop — while rotating the user isn't interacting and controls.update is a no-op without input,
  // so setView cleanly owns the camera; while interacting the rAF is stopped and controls fully owns it.
  let autoRotateFrameId: number | null = null
  let resumeTimerId: ReturnType<typeof setTimeout> | null = null
  let autoLongitude = viewer.camera.getState().longitude
  let lastFrameTime = 0

  const tickAutoRotate = (now: number) => {
    // 首帧只记录时间，避免引入一个巨大的 dt 跳变。
    // On the first frame just record the time to avoid a huge initial dt jump.
    if (lastFrameTime === 0) {
      lastFrameTime = now
    } else {
      const deltaTime = (now - lastFrameTime) / 1000
      lastFrameTime = now
      // 低空不自转：保持 rAF 心跳，用户拉高后下一帧即恢复推进，无需重启循环。
      // No rotation at low altitude: keep the rAF heartbeat alive so the moment the user zooms out the next frame resumes, with no loop restart needed.
      const height = viewer.camera.getCurrentHeight()
      if (height === null || height >= AUTO_ROTATE_MIN_HEIGHT) {
        autoLongitude += AUTO_ROTATE_SPEED_DEG_PER_SEC * deltaTime
        // 只推进经度，其余视角参数从当前状态读回，保持高度/俯仰/朝向稳定。
        // Advance longitude only; read the rest back from the current state to keep height/pitch/heading stable.
        viewer.camera.setView({ ...viewer.camera.getState(), longitude: autoLongitude })
      }
    }
    autoRotateFrameId = requestAnimationFrame(tickAutoRotate)
  }

  const startAutoRotate = () => {
    if (autoRotateFrameId !== null) return
    lastFrameTime = 0
    autoRotateFrameId = requestAnimationFrame(tickAutoRotate)
  }

  const stopAutoRotate = () => {
    if (autoRotateFrameId !== null) {
      cancelAnimationFrame(autoRotateFrameId)
      autoRotateFrameId = null
    }
  }

  const cancelResumeTimer = () => {
    if (resumeTimerId !== null) {
      clearTimeout(resumeTimerId)
      resumeTimerId = null
    }
  }

  const scheduleResume = () => {
    cancelResumeTimer()
    resumeTimerId = setTimeout(() => {
      resumeTimerId = null
      // 从用户操作后的当前位置续转，避免跳回自转离开时的经度。
      // Resume from wherever the user left the camera instead of snapping back to the longitude when rotation paused.
      autoLongitude = viewer.camera.getState().longitude
      startAutoRotate()
    }, AUTO_ROTATE_RESUME_DELAY)
  }

  // 用户开始操作相机（拖拽 / 缩放，含滚轮）→ 立即停转并取消挂起的恢复。
  // The user starts interacting (drag / zoom, including wheel) → stop now and cancel any pending resume.
  viewer.controls.addEventListener("start", () => {
    cancelResumeTimer()
    stopAutoRotate()
  })
  // 用户停止操作 → 延时恢复自转。
  // The user releases → resume after a grace period.
  viewer.controls.addEventListener("end", scheduleResume)

  startAutoRotate()

  window.addEventListener("beforeunload", () => {
    cancelResumeTimer()
    stopAutoRotate()
    viewer.destroy()
  })
}
