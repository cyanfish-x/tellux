import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  invertAgxEncodedColor,
  type ToneMappingColorState
} from '../entities/invertToneMapping'
import { PointCloudColorTransform } from '../tiles/PointCloudColorTransform'

function createPoints() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Uint8Array([64, 128, 192]), 3, true)
  )
  const material = new THREE.PointsMaterial({ vertexColors: true })
  return { points: new THREE.Points(geometry, material), material }
}

function compilePointShader(material: THREE.PointsMaterial) {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: `
#include <color_pars_vertex>
void main() {
  #include <color_vertex>
}
`,
    fragmentShader: 'void main() {}'
  }
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never)
  return shader
}

describe('PointCloudColorTransform', () => {
  it('round-trips representative point RGB through the exact Three.js AgX matrices', () => {
    const targets: Array<[number, number, number]> = [
      [0.7412, 0.7451, 0.7137],
      [0.2471, 0.2941, 0.2863],
      [0.2, 0.55, 0.15]
    ]

    for (const target of targets) {
      const precompensated = invertAgxEncodedColor(target, 5)
      const displayed = applyThreeAgx(precompensated, 5)
      expect(displayed[0]).toBeCloseTo(target[0], 2)
      expect(displayed[1]).toBeCloseTo(target[1], 2)
      expect(displayed[2]).toBeCloseTo(target[2], 2)
    }
  })

  it('precompensates vertex RGB through an AgX 3D LUT and tracks exposure', () => {
    let state: ToneMappingColorState = {
      toneMapping: THREE.AgXToneMapping,
      exposure: 5
    }
    const transform = new PointCloudColorTransform(() => state)
    const { points, material } = createPoints()

    transform.apply(points)
    const shader = compilePointShader(material)

    expect(shader.vertexShader).toContain('telluxPointColorLut')
    expect(shader.vertexShader).toContain('texture(telluxPointColorLut')
    const lut = shader.uniforms.telluxPointColorLut.value as THREE.Data3DTexture
    expect(lut).toMatchObject({
      isData3DTexture: true
    })
    const lutData = lut.image.data as Float32Array
    const red = 8
    const green = 16
    const blue = 24
    const offset = ((blue * 33 + green) * 33 + red) * 4
    const displayed = applyThreeAgx(
      [lutData[offset], lutData[offset + 1], lutData[offset + 2]],
      1
    )
    expect(displayed[0]).toBeCloseTo(red / 32, 2)
    expect(displayed[1]).toBeCloseTo(green / 32, 2)
    expect(displayed[2]).toBeCloseTo(blue / 32, 2)
    expect(shader.uniforms.telluxPointColorTransformEnabled.value).toBe(1)
    expect(shader.uniforms.telluxPointToneMappingExposure.value).toBe(5)

    state = { toneMapping: THREE.AgXToneMapping, exposure: 2 }
    transform.update()
    expect(shader.uniforms.telluxPointToneMappingExposure.value).toBe(2)

    state = { toneMapping: THREE.NoToneMapping, exposure: 2 }
    transform.update()
    expect(shader.uniforms.telluxPointColorTransformEnabled.value).toBe(0)

    state = { toneMapping: THREE.AgXToneMapping, exposure: 0 }
    transform.update()
    expect(shader.uniforms.telluxPointToneMappingExposure.value).toBe(1e-3)

    transform.dispose()
  })

  it('patches each material once and preserves an existing shader hook', () => {
    const transform = new PointCloudColorTransform(() => ({
      toneMapping: THREE.AgXToneMapping,
      exposure: 1
    }))
    const { points, material } = createPoints()
    const previousHook = vi.fn()
    material.onBeforeCompile = previousHook

    transform.apply(points)
    const cacheKey = material.customProgramCacheKey()
    transform.apply(points)
    compilePointShader(material)

    expect(previousHook).toHaveBeenCalledOnce()
    expect(material.customProgramCacheKey()).toBe(cacheKey)

    transform.dispose()
  })
})

type Vec3 = [number, number, number]

function multiply(matrix: number[], value: Vec3): Vec3 {
  return [
    matrix[0] * value[0] + matrix[1] * value[1] + matrix[2] * value[2],
    matrix[3] * value[0] + matrix[4] * value[1] + matrix[5] * value[2],
    matrix[6] * value[0] + matrix[7] * value[1] + matrix[8] * value[2]
  ]
}

function applyThreeAgx(input: Vec3, exposure: number): Vec3 {
  const linearSrgbToRec2020 = [
    0.6274, 0.3293, 0.0433,
    0.0691, 0.9195, 0.0113,
    0.0164, 0.088, 0.8956
  ]
  const agxInset = [
    0.856627153315983, 0.0951212405381588, 0.0482516061458583,
    0.137318972929847, 0.761241990602591, 0.101439036467562,
    0.11189821299995, 0.0767994186031903, 0.811302368396859
  ]
  const agxOutset = [
    1.1271005818144368, -0.11060664309660323, -0.016493938717834573,
    -0.1413297634984383, 1.157823702216272, -0.016493938717834257,
    -0.14132976349843826, -0.11060664309660294, 1.2519364065950405
  ]
  const linearRec2020ToSrgb = [
    1.6605, -0.5876, -0.0728,
    -0.1246, 1.1329, -0.0083,
    -0.0182, -0.1006, 1.1187
  ]

  let color = input.map((value) => value * exposure) as Vec3
  color = multiply(linearSrgbToRec2020, color)
  color = multiply(agxInset, color)
  color = color.map((value) => {
    const logValue = Math.log2(Math.max(value, 1e-10))
    return Math.min(1, Math.max(0, (logValue + 12.47393) / 16.499999))
  }) as Vec3
  color = color.map((value) => {
    const value2 = value * value
    const value4 = value2 * value2
    return 15.5 * value4 * value2 - 40.14 * value4 * value + 31.96 * value4
      - 6.868 * value2 * value + 0.4298 * value2 + 0.1191 * value - 0.00232
  }) as Vec3
  color = multiply(agxOutset, color)
  color = color.map((value) => Math.pow(Math.max(0, value), 2.2)) as Vec3
  color = multiply(linearRec2020ToSrgb, color)
  return color.map((value) => {
    const linear = Math.min(1, Math.max(0, value))
    return linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
  }) as Vec3
}
