export interface WaterAreaTileCoordinate {
  x: number
  y: number
  z: number
}

export interface WaterAreaTileImageResult {
  image?: ImageBitmap
  solid?: 'land' | 'water'
}
