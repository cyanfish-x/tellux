export const WATER_AREA_LAYER_KEYS = [
  'ocean',
  'water_polygons',
  'bridges',
  'pier_polygons',
  'dam_polygons',
  'street_polygons',
  'streets'
] as const

export interface WaterAreaFeatureSummary {
  numVertices: number
  props: Record<string, unknown>
}

export type WaterAreaTileData = Map<
  string,
  readonly WaterAreaFeatureSummary[]
>

export type WaterAreaTileClassification = 'land' | 'water' | 'mixed'

export function isWaterPolygon(
  feature: Pick<WaterAreaFeatureSummary, 'props'>
): boolean {
  return feature.props.kind !== 'glacier'
}

export function classifyWaterAreaTile(
  data: WaterAreaTileData
): WaterAreaTileClassification {
  const ocean = data.get('ocean') ?? []
  const waterPolygons = (data.get('water_polygons') ?? []).filter(
    isWaterPolygon
  )

  if (ocean.length === 0 && waterPolygons.length === 0) {
    return 'land'
  }

  const hasOccluder = WATER_AREA_LAYER_KEYS.some(
    (key) => key !== 'ocean' && (data.get(key)?.length ?? 0) > 0
  )
  if (!hasOccluder && ocean[0]?.numVertices === 5) {
    return 'water'
  }

  return 'mixed'
}
