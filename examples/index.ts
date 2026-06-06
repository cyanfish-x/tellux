import tellux from '../src'

type PortalLanguage = 'zh' | 'en'
type PortalTextKey =
  | 'title'
  | 'navLabel'
  | 'navExamples'
  | 'navGuides'
  | 'navGuidesHref'
  | 'navApi'
  | 'navApiHref'
  | 'languageToggle'
  | 'languageToggleLabel'
  | 'heroEyebrow'
  | 'heroTitle'
  | 'heroCopy'
  | 'primaryActionsLabel'
  | 'browseExamples'
  | 'statsLabel'
  | 'statBase'
  | 'statBaseValue'
  | 'statData'
  | 'statDataValue'
  | 'statEffects'
  | 'statEffectsValue'
  | 'globeLabel'
  | 'globeFallback'
  | 'globeCaptionLabel'
  | 'globeCaption'
  | 'overviewLabel'
  | 'overviewCapabilityTitle'
  | 'overviewCapabilityCopy'
  | 'overviewBaseTitle'
  | 'overviewBaseCopy'
  | 'overviewFeaturesTitle'
  | 'overviewFeaturesCopy'
  | 'examplesEyebrow'
  | 'examplesTitle'
  | 'examplesCopy'
  | 'examplesGridLabel'
  | 'tagViewer'
  | 'tagCamera'
  | 'tagEvents'
  | 'tagLayers'
  | 'tagTiles'
  | 'tagTerrain'
  | 'tagAtmosphere'
  | 'cardBasicTitle'
  | 'cardBasicCopy'
  | 'cardFlyTitle'
  | 'cardFlyCopy'
  | 'cardClickTitle'
  | 'cardClickCopy'
  | 'cardLayersTitle'
  | 'cardLayersCopy'
  | 'cardTilesTitle'
  | 'cardTilesCopy'
  | 'cardTerrainTitle'
  | 'cardTerrainCopy'
  | 'cardAtmosphereTitle'
  | 'cardAtmosphereCopy'

declare global {
  interface Window {
    viewer?: tellux.Viewer
  }
}

const portalText: Record<PortalLanguage, Record<PortalTextKey, string>> = {
  zh: {
    title: 'Tellux',
    navLabel: 'Tellux 门户导航',
    navExamples: '示例',
    navGuides: '指南',
    navGuidesHref: 'https://github.com/Bro-B/tellux/blob/main/README.md#使用',
    navApi: '接口文档',
    navApiHref: 'https://github.com/Bro-B/tellux/blob/main/README.md#api',
    languageToggle: 'EN',
    languageToggleLabel: '切换到英文',
    heroEyebrow: 'Three.js GIS 查看器工具包',
    heroTitle: 'Tellux',
    heroCopy:
      '基于 Three.js 的 GIS viewer，用熟悉的地图 API 组织数字地球、地形、影像、3D Tiles、大气、体积云和后处理效果。',
    primaryActionsLabel: '主要门户操作',
    browseExamples: '浏览示例',
    statsLabel: 'Tellux 能力亮点',
    statBase: 'Base',
    statBaseValue: 'Three.js / ESM',
    statData: '数据',
    statDataValue: '3D Tiles / 地形 / 影像',
    statEffects: '效果',
    statEffectsValue: '大气 / 云层 / 后处理',
    globeLabel: 'Tellux 查看器地球预览',
    globeFallback: '正在初始化 Tellux 查看器',
    globeCaptionLabel: '实时预览',
    globeCaption: 'ArcGIS 影像 + 大气',
    overviewLabel: 'Tellux 能力概览',
    overviewCapabilityTitle: 'GIS 能力',
    overviewCapabilityCopy: '地球、相机、拾取和图层',
    overviewBaseTitle: '技术底座',
    overviewBaseCopy: 'Three.js + 3d-tiles-renderer',
    overviewFeaturesTitle: '渲染特性',
    overviewFeaturesCopy: '大气、云、镜头光晕和抗锯齿',
    examplesEyebrow: '示例',
    examplesTitle: '示例入口',
    examplesCopy: '从这些可运行切片查看 Tellux 的核心能力：Viewer 初始化、相机飞行、鼠标拾取、图层管理、3D Tiles、Cesium 地形以及大气云层。',
    examplesGridLabel: 'Tellux 示例',
    tagViewer: '查看器',
    tagCamera: '相机',
    tagEvents: '事件',
    tagLayers: '图层',
    tagTiles: '三维瓦片',
    tagTerrain: '地形',
    tagAtmosphere: '大气',
    cardBasicTitle: '基础场景渲染',
    cardBasicCopy: '创建查看器，加载 ArcGIS 影像瓦片，启用默认大气、云层和后处理，并提供东京、上海视角按钮。',
    cardFlyTitle: '相机飞行',
    cardFlyCopy: '使用 Cesium 风格的相机飞行 API 在东京、上海、新加坡之间平滑飞行，并支持取消飞行。',
    cardClickTitle: '点击与鼠标读数',
    cardClickCopy: '监听查看器点击和鼠标移动事件，显示画布像素坐标以及经度、纬度和高度。',
    cardLayersTitle: '影像图层管理器',
    cardLayersCopy: '管理 ArcGIS XYZ、NASA GIBS WMS 和 OpenInfraMap MVT 图层，支持显隐、透明度和拖拽排序。',
    cardTilesTitle: '三维瓦片加载',
    cardTilesCopy: '通过 tileset.json 地址或 Cesium Ion 资产加载独立场景三维瓦片，并支持飞行定位、显隐和移除。',
    cardTerrainTitle: 'Cesium 地形热切换',
    cardTerrainCopy: '输入量化网格地形地址，通过左上角面板开启、关闭并热切换地形。',
    cardAtmosphereTitle: '体积云与大气',
    cardAtmosphereCopy: '切换太平洋和喜马拉雅视角，并通过公共设置面板调整大气、体积云、UTC 时间、光照和曝光。'
  },
  en: {
    title: 'Tellux',
    navLabel: 'Tellux portal navigation',
    navExamples: 'Examples',
    navGuides: 'Guides',
    navGuidesHref: 'https://github.com/Bro-B/tellux/blob/main/README.en.md#usage',
    navApi: 'API Docs',
    navApiHref: 'https://github.com/Bro-B/tellux/blob/main/README.en.md#api',
    languageToggle: '中文',
    languageToggleLabel: 'Switch to Chinese',
    heroEyebrow: 'Three.js GIS Viewer Toolkit',
    heroTitle: 'Tellux',
    heroCopy:
      'A Three.js-based GIS viewer that wraps globe, terrain, imagery, 3D Tiles, atmosphere, volumetric clouds, and post effects behind map-friendly APIs.',
    primaryActionsLabel: 'Primary portal actions',
    browseExamples: 'Browse Examples',
    statsLabel: 'Tellux capability highlights',
    statBase: 'Base',
    statBaseValue: 'Three.js / ESM',
    statData: 'Data',
    statDataValue: '3D Tiles / Terrain / Imagery',
    statEffects: 'Effects',
    statEffectsValue: 'Atmosphere / Clouds / Post FX',
    globeLabel: 'Tellux Viewer globe preview',
    globeFallback: 'Initializing Tellux Viewer',
    globeCaptionLabel: 'Live Viewer',
    globeCaption: 'ArcGIS imagery + atmosphere',
    overviewLabel: 'Tellux capability overview',
    overviewCapabilityTitle: 'GIS APIs',
    overviewCapabilityCopy: 'Globe, camera, picking, and layers',
    overviewBaseTitle: 'Foundation',
    overviewBaseCopy: 'Three.js + 3d-tiles-renderer',
    overviewFeaturesTitle: 'Rendering',
    overviewFeaturesCopy: 'Atmosphere, clouds, lens flare, and SMAA',
    examplesEyebrow: 'Examples',
    examplesTitle: 'Example Entry Points',
    examplesCopy: 'Use these runnable slices to inspect Tellux fundamentals: Viewer setup, camera flights, mouse picking, layer management, 3D Tiles, Cesium terrain, atmosphere, and clouds.',
    examplesGridLabel: 'Tellux examples',
    tagViewer: 'Viewer',
    tagCamera: 'Camera',
    tagEvents: 'Events',
    tagLayers: 'Layers',
    tagTiles: '3D Tiles',
    tagTerrain: 'Terrain',
    tagAtmosphere: 'Atmosphere',
    cardBasicTitle: 'Basic Scene Rendering',
    cardBasicCopy: 'Create a Viewer, load ArcGIS imagery tiles, enable the default atmosphere, clouds, and post effects, and switch between Tokyo and Shanghai views.',
    cardFlyTitle: 'Camera Flights',
    cardFlyCopy: 'Use Cesium-style camera flight APIs to move smoothly between Tokyo, Shanghai, and Singapore, with support for canceling active flights.',
    cardClickTitle: 'Click and Mouse Readouts',
    cardClickCopy: 'Listen to viewer click and mouse move events, then display canvas pixel coordinates plus longitude, latitude, and height.',
    cardLayersTitle: 'Imagery Layer Manager',
    cardLayersCopy: 'Manage ArcGIS XYZ, NASA GIBS WMS, and OpenInfraMap MVT layers with visibility, opacity, and drag sorting controls.',
    cardTilesTitle: '3D Tiles Loading',
    cardTilesCopy: 'Load standalone 3D Tiles scenes from a tileset.json URL or a Cesium Ion asset, then fly to, show, hide, and remove them.',
    cardTerrainTitle: 'Cesium Terrain Hot Swap',
    cardTerrainCopy: 'Enter a quantized-mesh terrain URL and use the upper-left panel to enable, disable, and hot-swap terrain.',
    cardAtmosphereTitle: 'Volumetric Clouds and Atmosphere',
    cardAtmosphereCopy: 'Switch between Pacific and Himalayan views while tuning atmosphere, volumetric clouds, UTC time, lighting, and exposure in the shared settings panel.'
  }
}

const PORTAL_LANGUAGE_STORAGE_KEY = 'tellux:portal-language'

const arcgisWorldImageryUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

tellux.baseUrl = '/tellux/'

let currentPortalLanguage = getInitialPortalLanguage()
applyPortalLanguage(currentPortalLanguage)
document.querySelector('[data-language-toggle]')?.addEventListener('click', () => {
  currentPortalLanguage = currentPortalLanguage === 'zh' ? 'en' : 'zh'
  savePortalLanguage(currentPortalLanguage)
  applyPortalLanguage(currentPortalLanguage)
})

const globeContainer = document.querySelector('#portal-globe-viewer')
if (globeContainer instanceof HTMLElement) {
  const viewer = new tellux.Viewer(globeContainer, {
    camera: {
      latitude: 33.642362709383136,
      longitude: 108.94098653906926,
      height: 116962.0776354643,
      heading: 42.69550793158089,
      pitch: -22.550424247520187,
      roll: -0.002352292489079191,
      far: 12000000
    },
    scene: {
      clouds: false,
      skyAtmosphere: true,
      lensFlare: true,
      smaa: true,
      toneMappingExposure: 7
    },
    layers: [
      {
        source: tellux.TemplateUrlResource.fromUrl(arcgisWorldImageryUrl, {
          levels: 15
        })
      }
    ],
    resolutionScale: Math.min(window.devicePixelRatio, 1.5),
    transparent: true
  })
  window.viewer = viewer
  viewer.clock.animate = true
  viewer.clock.multiplier = 10
  window.addEventListener('beforeunload', () => {
    viewer.destroy()
    if (window.viewer === viewer) {
      delete window.viewer
    }
  })
}

function getInitialPortalLanguage(): PortalLanguage {
  try {
    const stored = window.localStorage.getItem(PORTAL_LANGUAGE_STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') {
      return stored
    }
  } catch {
    // Ignore storage errors so the portal still works in restricted contexts.
  }
  return 'zh'
}

function savePortalLanguage(language: PortalLanguage) {
  try {
    window.localStorage.setItem(PORTAL_LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Ignore storage errors so one-off language switching remains available.
  }
}

function applyPortalLanguage(language: PortalLanguage) {
  const text = portalText[language]
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  document.title = text.title

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as PortalTextKey | undefined
    if (key && text[key] !== undefined) {
      element.textContent = text[key]
    }
  })

  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel as PortalTextKey | undefined
    if (key && text[key] !== undefined) {
      element.setAttribute('aria-label', text[key])
    }
  })

  document.querySelectorAll<HTMLAnchorElement>('[data-i18n-href]').forEach((element) => {
    const key = element.dataset.i18nHref as PortalTextKey | undefined
    if (key && text[key] !== undefined) {
      element.href = text[key]
    }
  })
}
