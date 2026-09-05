export const PACKAGE_TYPES = './dist/index.d.ts'

export const PACKAGE_EXPORTS = {
  '.': {
    types: './dist/index.d.ts',
    import: './dist/index.js'
  },
  './assets': {
    types: './dist/assets.d.ts',
    import: './dist/assets.js'
  }
} as const

export const PUBLIC_VALUE_EXPORTS = [
  'AtmosphereLightingMode',
  'Camera',
  'Clock',
  'DEFAULT_POINT_CLOUD_SHADING',
  'DebugSettingsPanel',
  'Entity',
  'EntityManager',
  'Globe',
  'HighlightManager',
  'HismCluster',
  'HismManager',
  'HismPickMarker',
  'IconGraphics',
  'ImageryLayer',
  'LayerManager',
  'ModelManager',
  'PointGraphics',
  'PolygonGraphics',
  'PolylineGraphics',
  'PositionPipeline',
  'RTCAutoUniforms',
  'Scene',
  'SceneTilesetCollection',
  'SpringControl',
  'SymbolGraphics',
  'TelluxGlobeControls',
  'Terrain',
  'TextGraphics',
  'Timeline',
  'Viewer',
  'ViewerRenderer',
  'applyRTCInstancing',
  'collectHismRuntimeStats',
  'createInstancedVegetationPipeline',
  'createRTCPositionPipeline',
  'createRTCPositionStage',
  'createWindSwayLeavesMaterial',
  'createWindSwayStage',
  'createWindSwayUniforms',
  'default',
  'disposeGlyphAtlases',
  'disposeMsdfAtlas',
  'hasTelluxPositionPipeline',
  'loadMsdfAtlas',
  'preloadFontMsdfAtlas',
  'resolvePointCloudShading',
  'setMsdfAtlasForFont',
  'setRTCMatrixAt',
  'tellux',
  'telluxAssetFileNames',
  'telluxAssetUrls'
] as const

export const PUBLIC_TYPE_EXPORTS = [
  'AddHismLayerOptions',
  'AddModelOptions',
  'CameraDestination',
  'CameraEllipsoid',
  'CameraEllipsoidProvider',
  'CameraFlightEasingFunction',
  'CameraFlyToOptions',
  'CameraOrientation',
  'CameraProjectionOptions',
  'CameraSetViewOptions',
  'CartographicFrameOptions',
  'CesiumIon3DTilesetOptions',
  'CesiumIonImagerySourceOptions',
  'CesiumIonTerrainOptions',
  'ClockChangeEvent',
  'ClockChangeReason',
  'ClockEventListener',
  'ClockEventMap',
  'ClockOptions',
  'ClockTickEvent',
  'CloudQualityPreset',
  'CloudShadowQuality',
  'ColorInput',
  'DateTimeInput',
  'DebugSettingsPanelOptions',
  'EntityOptions',
  'EntityTransparencyMode',
  'FlyToTargetOffset',
  'FlyToTargetOptions',
  'FlyToTargetTarget',
  'GeoJSONData',
  'GeoJSONFeature',
  'GeoJSONFeatureCollection',
  'GeoJSONFeatureProperties',
  'GeoJSONFeatureStyle',
  'GeoJSONGeometry',
  'GeoJSONGetStyleCallback',
  'GeoJSONImagerySourceOptions',
  'GltfModelLightingMode',
  'GltfModelMaterialMode',
  'GltfModelOptions',
  'GlyphTextConfig',
  'GlyphTextRun',
  'GraphicOutlineOptions',
  'HeightSamplingSource',
  'HighlightTarget',
  'HismApplyInstanceMatrix',
  'HismArchetype',
  'HismInstancePlacement',
  'HismLayer',
  'HismLayerRuntimeStats',
  'HismLodLevel',
  'HismManagerOptions',
  'HismMeshPart',
  'HismPickResult',
  'HismRuntimeStats',
  'IconOptions',
  'ImageryLayerOptions',
  'ImageryLayerSourceOptions',
  'ImageryLayerStyleOptions',
  'LensFlareQuality',
  'Load3DTilesetOptions',
  'LonLat',
  'LonLatHeight',
  'LonLatHeightLike',
  'LonLatLike',
  'MVTFeatureProperties',
  'MVTFeatureStyle',
  'MVTGetStyleCallback',
  'MVTImagerySourceOptions',
  'ModelLayer',
  'MsdfAtlas',
  'MsdfAtlasData',
  'MsdfGlyphMetrics',
  'PickEntityOptions',
  'PickObjectOptions',
  'Picked3DTilesFeature',
  'PickedEntity',
  'PickedObject',
  'PointCloudShadingOptions',
  'PointOptions',
  'PolygonOptions',
  'PolygonOutlineOptions',
  'PolylineOptions',
  'PositionPipelineApplyOptions',
  'PositionPipelineComposeOptions',
  'PositionPipelineStage',
  'PositionPipelineStageContext',
  'ResolvedPointCloudShading',
  'SampleHeightMostDetailedOptions',
  'SampleHeightOptions',
  'Scene3DTileLoadingOptions',
  'ScreenPosition',
  'SpringControlOptions',
  'SurfaceMaterialMode',
  'SymbolAnchor',
  'SymbolOptions',
  'SymbolTextRelative',
  'TelluxAssetName',
  'TelluxConfig',
  'TelluxRenderer',
  'TelluxWebGLRenderer',
  'TelluxWebGPURenderer',
  'TerrainOptions',
  'TerrainRenderOptions',
  'TerrainTileLoadingOptions',
  'TextOptions',
  'ThreeDTilesRenderOptions',
  'TiandituTerrainOptions',
  'TilesetFeatureProperties',
  'TilesetLayer',
  'TimelineOptions',
  'Url3DTilesetOptions',
  'UrlTerrainOptions',
  'ViewerAtmosphereLightingOptions',
  'ViewerAtmosphereNightOptions',
  'ViewerAtmosphereOptions',
  'ViewerAtmospherePhotometricOptions',
  'ViewerAtmosphereScatteringOptions',
  'ViewerAtmosphereShadowOptions',
  'ViewerAtmosphereSkyOptions',
  'ViewerAtmosphereStarsOptions',
  'ViewerAutoExposureOptions',
  'ViewerBloomOptions',
  'ViewerClickEvent',
  'ViewerCloudLayerOptions',
  'ViewerCloudLookOptions',
  'ViewerCloudOptions',
  'ViewerCloudShadowOptions',
  'ViewerControls',
  'ViewerEntityOptions',
  'ViewerEntityTransparencyOptions',
  'ViewerEvent',
  'ViewerEventListener',
  'ViewerEventMap',
  'ViewerFallbackAmbientLightOptions',
  'ViewerHighlightOptions',
  'ViewerHighlightOutlineOptions',
  'ViewerHighlightOverlayOptions',
  'ViewerLensFlareOptions',
  'ViewerLensFlareThresholdOptions',
  'ViewerMouseEvent',
  'ViewerMouseMoveEvent',
  'ViewerOptions',
  'ViewerPickLayer',
  'ViewerPickOptions',
  'ViewerPickResult',
  'ViewerPostProcessOptions',
  'ViewerPostProcessStageOptions',
  'ViewerRendererOptions',
  'ViewerRendererType',
  'ViewerSceneOptions',
  'ViewerSurfaceMaterialOptions',
  'ViewerSurfaceOptions',
  'ViewerWidgetOptions',
  'WMSImagerySourceOptions',
  'WMTSImagerySourceOptions',
  'WMTSTileMatrix',
  'WindSwayLeavesMaterialOptions',
  'WindSwayUniformValues',
  'XYZImagerySourceOptions'
] as const

const BANNED_MEMBER_NAMES = [
  'syncStyleFromSettings',
  'syncRuntimeEffects',
  'pointGraphicImpl',
  'symbolGraphicImpl',
  'polylineGraphicImpl'
] as const

export interface BarrelExports {
  values: string[]
  types: string[]
}

export interface ApiSurfaceHit {
  file: string
  pattern: string
  excerpt: string
}

export function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

export function parseBarrelExports(source: string): BarrelExports {
  const values = new Set<string>()
  const types = new Set<string>()
  const text = stripComments(source)
  const blockPattern = /export\s+(type\s+)?\{([^}]*)\}/g

  for (const match of text.matchAll(blockPattern)) {
    const blockIsType = Boolean(match[1])
    for (const rawItem of match[2].split(',')) {
      const item = rawItem.trim()
      if (!item) continue
      const isType = blockIsType || /^type\s+/.test(item)
      const name = item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim()
      if (!name) continue
      if (isType) types.add(name)
      else values.add(name)
    }
  }

  if (/\bexport\s+default\b/.test(text)) {
    values.add('default')
  }

  return {
    values: [...values].sort(),
    types: [...types].sort()
  }
}

export function findBannedApiSurfaceHits(
  files: Iterable<{ file: string; source: string }>
): ApiSurfaceHit[] {
  const hits: ApiSurfaceHit[] = []

  for (const { file, source } of files) {
    const text = stripComments(source)
    for (const name of BANNED_MEMBER_NAMES) {
      const index = findIdentifier(text, name)
      if (index >= 0) {
        hits.push({
          file,
          pattern: name,
          excerpt: excerptAt(text, index)
        })
      }
    }

    if (isSettingsDeclarationFile(file)) {
      const applyIndex = findSettingsApply(text)
      if (applyIndex >= 0) {
        hits.push({
          file,
          pattern: 'Settings.apply',
          excerpt: excerptAt(text, applyIndex)
        })
      }
    }
  }

  return hits
}

export function assertPackageExportContract(pkg: {
  types?: string
  exports?: unknown
}) {
  const failures: string[] = []
  if (pkg.types !== PACKAGE_TYPES) {
    failures.push(`types: expected ${PACKAGE_TYPES}, got ${String(pkg.types)}`)
  }
  if (JSON.stringify(pkg.exports) !== JSON.stringify(PACKAGE_EXPORTS)) {
    failures.push('exports mapping drifted from the 1.0 contract')
  }
  return failures
}

function findIdentifier(text: string, name: string) {
  const pattern = new RegExp(`\\b${name}\\b`)
  const match = pattern.exec(text)
  return match ? match.index : -1
}

function findSettingsApply(text: string) {
  const match = /\bapply\s*\(/.exec(text)
  return match ? match.index : -1
}

function isSettingsDeclarationFile(file: string) {
  return /(?:^|[/\\])[A-Za-z0-9]+Settings\.d\.ts$/.test(file.replace(/\\/g, '/'))
}

function excerptAt(text: string, index: number) {
  const start = Math.max(0, index - 24)
  const end = Math.min(text.length, index + 48)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}
