export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI
export const CAMERA_FRAME = 1

export const DEFAULT_CAMERA = {
  destination: {
    longitude: 139.8,
    latitude: 35.6812,
    height: 500
  },
  orientation: {
    heading: -90,
    pitch: -10,
    roll: 0
  },
  projection: {
    fov: 50,
    near: 10,
    far: 1e6
  }
}
