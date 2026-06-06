import tellux from '../src'

type PortalLanguage = 'zh' | 'en'
type PortalTextKey =
  | 'title'
  | 'navLabel'
  | 'navExamples'
  | 'navGuides'
  | 'navApi'
  | 'languageToggle'
  | 'languageToggleLabel'
  | 'heroEyebrow'
  | 'heroTitle'
  | 'heroCopy'
  | 'primaryActionsLabel'
  | 'browseExamples'
  | 'readmeAction'
  | 'readmeHref'
  | 'statsLabel'
  | 'statRenderer'
  | 'statFormat'
  | 'statFormatValue'
  | 'statPipeline'
  | 'statPipelineValue'
  | 'globeLabel'
  | 'globeFallback'
  | 'globeCaptionLabel'
  | 'globeCaption'
  | 'overviewLabel'
  | 'overviewExamplesTitle'
  | 'overviewExamplesCopy'
  | 'overviewGuidesTitle'
  | 'overviewGuidesCopy'
  | 'overviewApiTitle'
  | 'overviewApiCopy'
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
  | 'guidesEyebrow'
  | 'guidesTitle'
  | 'guidesCopy'
  | 'guidesListLabel'
  | 'guideIndex01'
  | 'guideIndex02'
  | 'guideIndex03'
  | 'guideStartTitle'
  | 'guideStartCopy'
  | 'guideDataTitle'
  | 'guideDataCopy'
  | 'guideRenderingTitle'
  | 'guideRenderingCopy'
  | 'apiEyebrow'
  | 'apiTitle'
  | 'apiCopy'
  | 'apiListLabel'
  | 'apiViewerTitle'
  | 'apiViewerCopy'
  | 'apiCameraTitle'
  | 'apiCameraCopy'
  | 'apiResourcesTitle'
  | 'apiResourcesCopy'

declare global {
  interface Window {
    viewer?: tellux.Viewer
  }
}

const portalText: Record<PortalLanguage, Record<PortalTextKey, string>> = {
  zh: {
    title: 'Tellux 开发者门户',
    navLabel: 'Tellux 门户导航',
    navExamples: '示例',
    navGuides: '指南',
    navApi: '接口文档',
    languageToggle: 'EN',
    languageToggleLabel: '切换到英文',
    heroEyebrow: 'Three.js GIS 查看器工具包',
    heroTitle: 'Tellux 开发者门户',
    heroCopy:
      '从可运行示例开始探索 Tellux：地球视图、相机飞行、点击读数、影像图层、三维瓦片、地形以及大气云层。后续这里也会承载指南和 API 文档入口。',
    primaryActionsLabel: '主要门户操作',
    browseExamples: '浏览示例',
    readmeAction: '阅读说明文档',
    readmeHref: './README.md',
    statsLabel: 'Tellux 门户亮点',
    statRenderer: '渲染器',
    statFormat: '格式',
    statFormatValue: '三维瓦片',
    statPipeline: '渲染管线',
    statPipelineValue: '大气 / 云层 / 后处理',
    globeLabel: 'Tellux 查看器地球预览',
    globeFallback: '正在初始化 Tellux 查看器',
    globeCaptionLabel: '实时预览',
    globeCaption: 'ArcGIS 影像 + 大气',
    overviewLabel: '门户概览',
    overviewExamplesTitle: '示例',
    overviewExamplesCopy: '运行中的功能切片',
    overviewGuidesTitle: '指南',
    overviewGuidesCopy: '即将加入接入指南',
    overviewApiTitle: '接口文档',
    overviewApiCopy: '预留类型与接口文档',
    examplesEyebrow: '示例',
    examplesTitle: '示例入口',
    examplesCopy: '这些页面通过 Vite 从仓库源码直接引入 Tellux，适合开发时验证 API 行为和渲染效果。',
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
    cardAtmosphereCopy: '切换太平洋和喜马拉雅视角，并通过公共设置面板调整大气、体积云、UTC 时间、光照和曝光。',
    guidesEyebrow: '指南',
    guidesTitle: '指南页占位',
    guidesCopy: '未来可以把入门安装、查看器生命周期、图层接入、Cesium Ion 资源、部署资源路径等内容放在这里。',
    guidesListLabel: '规划中的指南',
    guideIndex01: '指南 01',
    guideIndex02: '指南 02',
    guideIndex03: '指南 03',
    guideStartTitle: '快速开始',
    guideStartCopy: '安装、资源目录、创建第一个查看器。',
    guideDataTitle: '数据与图层',
    guideDataCopy: 'XYZ、WMS、MVT、地形和三维瓦片的接入模式。',
    guideRenderingTitle: '渲染效果',
    guideRenderingCopy: '大气、云层、后处理、曝光与性能调优。',
    apiEyebrow: '接口文档',
    apiTitle: '接口文档占位',
    apiCopy: '等声明产物或文档生成流程接入后，可以把查看器、相机、图层管理器、资源类型等入口汇总到这里。',
    apiListLabel: '规划中的 API 文档',
    apiViewerTitle: '查看器',
    apiViewerCopy: '初始化选项、场景控制、资源加载和销毁流程。',
    apiCameraTitle: '相机',
    apiCameraCopy: '飞行、设置视角、坐标与相机状态。',
    apiResourcesTitle: '资源',
    apiResourcesCopy: 'Cesium Ion 资源、模板地址资源、WMS 资源、MVT 资源。'
  },
  en: {
    title: 'Tellux Developer Portal',
    navLabel: 'Tellux portal navigation',
    navExamples: 'Examples',
    navGuides: 'Guides',
    navApi: 'API Docs',
    languageToggle: '中文',
    languageToggleLabel: 'Switch to Chinese',
    heroEyebrow: 'Three.js GIS Viewer Toolkit',
    heroTitle: 'Tellux Developer Portal',
    heroCopy:
      'Explore Tellux through runnable examples: globe views, camera flights, click readouts, imagery layers, 3D Tiles, terrain, atmosphere, and clouds. Guides and API documentation will land here as the project grows.',
    primaryActionsLabel: 'Primary portal actions',
    browseExamples: 'Browse Examples',
    readmeAction: 'Read README',
    readmeHref: './README.en.md',
    statsLabel: 'Tellux portal highlights',
    statRenderer: 'Renderer',
    statFormat: 'Format',
    statFormatValue: '3D Tiles',
    statPipeline: 'Pipeline',
    statPipelineValue: 'Atmosphere / Clouds / Post FX',
    globeLabel: 'Tellux Viewer globe preview',
    globeFallback: 'Initializing Tellux Viewer',
    globeCaptionLabel: 'Live Viewer',
    globeCaption: 'ArcGIS imagery + atmosphere',
    overviewLabel: 'Portal overview',
    overviewExamplesTitle: 'Examples',
    overviewExamplesCopy: 'Runnable feature slices',
    overviewGuidesTitle: 'Guides',
    overviewGuidesCopy: 'Integration guides coming soon',
    overviewApiTitle: 'API Docs',
    overviewApiCopy: 'Reserved for typed API references',
    examplesEyebrow: 'Examples',
    examplesTitle: 'Example Entry Points',
    examplesCopy: 'These pages import Tellux from the repository source through Vite, making them useful for API and rendering checks during development.',
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
    cardAtmosphereCopy: 'Switch between Pacific and Himalayan views while tuning atmosphere, volumetric clouds, UTC time, lighting, and exposure in the shared settings panel.',
    guidesEyebrow: 'Guides',
    guidesTitle: 'Guide Placeholder',
    guidesCopy: 'Future guides can cover installation, viewer lifecycle, layer integration, Cesium Ion resources, and deployment asset paths.',
    guidesListLabel: 'Planned guides',
    guideIndex01: 'Guide 01',
    guideIndex02: 'Guide 02',
    guideIndex03: 'Guide 03',
    guideStartTitle: 'Getting Started',
    guideStartCopy: 'Installation, asset directories, and creating your first Viewer.',
    guideDataTitle: 'Data and Layers',
    guideDataCopy: 'Integration patterns for XYZ, WMS, MVT, terrain, and 3D Tiles.',
    guideRenderingTitle: 'Rendering',
    guideRenderingCopy: 'Atmosphere, clouds, post-processing, exposure, and performance tuning.',
    apiEyebrow: 'API Docs',
    apiTitle: 'API Docs Placeholder',
    apiCopy: 'Once declaration or documentation generation is wired up, this area can collect Viewer, Camera, LayerManager, and resource type references.',
    apiListLabel: 'Planned API docs',
    apiViewerTitle: 'Viewer',
    apiViewerCopy: 'Initialization options, scene controls, resource loading, and teardown flow.',
    apiCameraTitle: 'Camera',
    apiCameraCopy: 'flyTo, setView, coordinates, and camera state.',
    apiResourcesTitle: 'Resources',
    apiResourcesCopy: 'CesiumIonResource, TemplateUrlResource, WMSResource, and MVTResource.'
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
