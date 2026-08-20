export interface DeriveCoastFieldOptions {
  heights: Float32Array
  validity: Uint8Array
  width: number
  height: number
  cellSize: number
  seaLevel: number
  maxDepth: number
  bathymetrySlope: number
  hysteresis: number
  previousLand?: Uint8Array
}

export interface DerivedCoastField {
  landMask: Uint8Array
  shoreSdf: Float32Array
  bedHeight: Float32Array
  validity: Uint8Array
}

export function deriveCoastField(options: DeriveCoastFieldOptions): DerivedCoastField {
  const count = options.width * options.height
  const landMask = new Uint8Array(count)
  const validity = new Uint8Array(options.validity)
  for (let index = 0; index < count; index += 1) {
    if (validity[index] === 0 || !Number.isFinite(options.heights[index])) continue
    const previous = options.previousLand?.[index]
    const threshold = previous === 1
      ? options.seaLevel - options.hysteresis
      : previous === 0
        ? options.seaLevel + options.hysteresis
        : options.seaLevel
    landMask[index] = options.heights[index] >= threshold ? 1 : 0
  }

  const distanceToLand = squaredDistanceTransform(landMask, options.width, options.height, 1, validity)
  const distanceToWater = squaredDistanceTransform(landMask, options.width, options.height, 0, validity)
  const shoreSdf = new Float32Array(count)
  const bedHeight = new Float32Array(count)
  bedHeight.fill(Number.NaN)
  for (let index = 0; index < count; index += 1) {
    if (validity[index] === 0) {
      shoreSdf[index] = Number.NaN
      continue
    }
    const land = landMask[index] === 1
    const squaredDistance = land ? distanceToWater[index] : distanceToLand[index]
    const cellDistance = Math.max(Math.sqrt(squaredDistance) - 0.5, 0)
    const distance = cellDistance * options.cellSize
    shoreSdf[index] = land ? distance : -distance
    bedHeight[index] = land
      ? options.heights[index]
      : options.seaLevel - options.maxDepth * (
          1 - Math.exp(-options.bathymetrySlope * distance / options.maxDepth)
        )
  }

  return { landMask, shoreSdf, bedHeight, validity }
}

function squaredDistanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
  featureValue: 0 | 1,
  validity: Uint8Array
) {
  const maxDistance = width * width + height * height
  const intermediate = new Float64Array(width * height)
  const output = new Float64Array(width * height)
  const maxLength = Math.max(width, height)
  const source = new Float64Array(maxLength)
  const target = new Float64Array(maxLength)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      source[x] = validity[index] !== 0 && mask[index] === featureValue ? 0 : maxDistance
    }
    distanceTransform1D(source, target, width)
    for (let x = 0; x < width; x += 1) intermediate[y * width + x] = target[x]
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) source[y] = intermediate[y * width + x]
    distanceTransform1D(source, target, height)
    for (let y = 0; y < height; y += 1) output[y * width + x] = target[y]
  }
  return output
}

// Felzenszwalb/Huttenlocher exact squared Euclidean distance transform.
function distanceTransform1D(source: Float64Array, target: Float64Array, length: number) {
  const locations = new Int32Array(length)
  const boundaries = new Float64Array(length + 1)
  let k = 0
  locations[0] = 0
  boundaries[0] = Number.NEGATIVE_INFINITY
  boundaries[1] = Number.POSITIVE_INFINITY
  for (let q = 1; q < length; q += 1) {
    let intersection = intersectionOfParabolas(source, q, locations[k])
    while (intersection <= boundaries[k] && k > 0) {
      k -= 1
      intersection = intersectionOfParabolas(source, q, locations[k])
    }
    k += 1
    locations[k] = q
    boundaries[k] = intersection
    boundaries[k + 1] = Number.POSITIVE_INFINITY
  }
  k = 0
  for (let q = 0; q < length; q += 1) {
    while (boundaries[k + 1] < q) k += 1
    const delta = q - locations[k]
    target[q] = delta * delta + source[locations[k]]
  }
}

function intersectionOfParabolas(source: Float64Array, q: number, location: number) {
  return ((source[q] + q * q) - (source[location] + location * location)) / (2 * q - 2 * location)
}
