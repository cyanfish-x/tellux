import * as THREE from 'three'

/**
 * 单帧内借用材质 hook 的透明深度范围适配器；不拥有输入深度纹理。
 * Borrows material hooks for a frame's transparent depth range; input depth textures are not owned.
 */
export class TransparentDepthSlice {
  private readonly active = new THREE.Uniform(false)
  private readonly capture = new THREE.Uniform(false)
  private readonly lower = new THREE.Uniform<THREE.Texture | null>(null)
  private readonly upper = new THREE.Uniform<THREE.Texture | null>(null)
  private readonly hasLower = new THREE.Uniform(false)
  private readonly hasUpper = new THREE.Uniform(false)
  private readonly resolution = new THREE.Uniform(new THREE.Vector2(1, 1))
  private readonly restores = new Map<THREE.Material, () => void>()

  /** 设置下界排除、上界包含的深度范围。 Sets an exclusive lower and inclusive upper depth range. */
  setRange(lower: THREE.Texture | null, upper: THREE.Texture | null, width: number, height: number) {
    this.lower.value = lower
    this.upper.value = upper
    this.hasLower.value = lower !== null
    this.hasUpper.value = upper !== null
    this.resolution.value.set(width, height)
    this.active.value = lower !== null || upper !== null
  }

  /** 深度捕获忽略标准材质的零覆盖片元。 Depth capture ignores zero-coverage fragments in standard materials. */
  setCapture(enabled: boolean) { this.capture.value = enabled }

  /** 此绘制是否仅捕获深度。 Whether the draw only captures depth. */
  get depthOnly() { return this.capture.value }

  /** 保留已有 shader 适配，追加本帧范围裁剪。 Preserves existing shader adapters and adds this frame's range clipping. */
  attach(material: THREE.Material) {
    if (this.restores.has(material)) return
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey
    const compile: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, {
        telluxDepthSliceActive: this.active,
        telluxDepthSliceCapture: this.capture,
        telluxDepthSliceLower: this.lower,
        telluxDepthSliceUpper: this.upper,
        telluxDepthSliceHasLower: this.hasLower,
        telluxDepthSliceHasUpper: this.hasUpper,
        telluxDepthSliceResolution: this.resolution,
      })
      // Three.js stores unsigned-int depth in DEPTH_COMPONENT24. The tolerance
      // accounts for write/read quantization so a surface cannot be peeled twice.
      const header = `
uniform bool telluxDepthSliceActive;
uniform bool telluxDepthSliceCapture;
uniform sampler2D telluxDepthSliceLower;
uniform sampler2D telluxDepthSliceUpper;
uniform bool telluxDepthSliceHasLower;
uniform bool telluxDepthSliceHasUpper;
uniform vec2 telluxDepthSliceResolution;
void telluxDiscardOutsideDepthSlice() {
  if (!telluxDepthSliceActive) return;
  vec2 uv = gl_FragCoord.xy / telluxDepthSliceResolution;
  float depth = gl_FragCoord.z;
  #if defined(USE_LOGARITHMIC_DEPTH_BUFFER) || defined(USE_LOGDEPTHBUF)
    depth = gl_FragDepth;
  #endif
  float tolerance = 1.0 / 16777215.0;
  if (telluxDepthSliceHasLower && depth <= texture2D(telluxDepthSliceLower, uv).r + tolerance) discard;
  if (telluxDepthSliceHasUpper && depth > texture2D(telluxDepthSliceUpper, uv).r + tolerance) discard;
}
`
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
        '#include <alphatest_fragment>\nif (telluxDepthSliceCapture && diffuseColor.a <= 0.0) discard;')
      // The depth chunk writes logarithmic depth before the output section. Ordinary
      // shaders can reject at entry; log-depth shaders must wait until their depth is written.
      if (shader.fragmentShader.includes('#include <logdepthbuf_fragment>')) {
        shader.fragmentShader = header + shader.fragmentShader.replace(
          '#include <logdepthbuf_fragment>',
          '#include <logdepthbuf_fragment>\ntelluxDiscardOutsideDepthSlice();',
        )
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          /\bvoid\s+main\s*\(\s*(?:void)?\s*\)\s*\{/,
          `${header}\nvoid main() { telluxDiscardOutsideDepthSlice();`,
        )
      }
    }
    const key = () => `${previousKey.call(material)}:tellux-depth-slice-v1`
    material.onBeforeCompile = compile
    material.customProgramCacheKey = key
    material.needsUpdate = true
    this.restores.set(material, () => {
      if (material.onBeforeCompile === compile) material.onBeforeCompile = previous
      if (material.customProgramCacheKey === key) material.customProgramCacheKey = previousKey
      material.needsUpdate = true
    })
  }

  /** 恢复借用的 hook 并解除纹理引用，须在 finally 调用。 Restores borrowed hooks and releases texture references; call in finally. */
  endFrame() {
    this.active.value = false
    this.capture.value = false
    this.lower.value = null
    this.upper.value = null
    this.hasLower.value = false
    this.hasUpper.value = false
    for (const restore of this.restores.values()) restore()
    this.restores.clear()
  }
}
