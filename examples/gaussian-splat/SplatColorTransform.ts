import type { SparkRenderer } from '@sparkjsdev/spark'
import { createAgxInverseLut } from '../../src/tiles/PointCloudColorTransform'

/** 高斯显示色适配：在透明混合前补偿最终 AgX 与曝光。 Compensate final AgX/exposure before splat alpha blending. */
export class SplatColorTransform {
  private lut: ReturnType<typeof createAgxInverseLut> | null = null
  private readonly exposure = { value: 1 }
  private readonly enabled = { value: true }
  private readonly materials = new WeakSet<object>()

  update(exposure: number, enabled: boolean) {
    this.exposure.value = Math.max(1e-3, exposure)
    this.enabled.value = enabled
  }

  attach(spark: SparkRenderer | null) {
    if (!spark || this.materials.has(spark.material)) return
    const material = spark.material
    const anchor = 'if (encodeLinear) {'
    if (!material.fragmentShader.includes(anchor)) throw new Error('Unsupported Spark fragment shader color path')
    this.lut ??= createAgxInverseLut()
    material.uniforms.telluxSplatColorLut = { value: this.lut }
    material.uniforms.telluxSplatExposure = this.exposure
    material.uniforms.telluxSplatDisplayColor = this.enabled
    material.fragmentShader = material.fragmentShader.replace('void main()', `
uniform highp sampler3D telluxSplatColorLut;
uniform float telluxSplatExposure;
uniform bool telluxSplatDisplayColor;
void main()`).replace(anchor, `if (telluxSplatDisplayColor) {
        vec3 uv = clamp(rgba.rgb, 0.0, 1.0) * (32.0 / 33.0) + (0.5 / 33.0);
        rgba.rgb = texture(telluxSplatColorLut, uv).rgb / telluxSplatExposure;
    } else ${anchor}`)
    material.needsUpdate = true
    this.materials.add(material)
  }

  dispose() { this.lut?.dispose(); this.lut = null }
}
