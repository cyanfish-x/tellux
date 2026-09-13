import * as THREE from 'three'

/** 保留 Spark 排序与着色，一次输出多个预乘透明段。 Keeps Spark sorting and shading while emitting several premultiplied depth intervals per draw. */
export class SparkDepthBuckets {
  private readonly targets: THREE.WebGLRenderTarget[] = []
  private readonly depths = new THREE.Uniform<THREE.Texture[]>([])
  private readonly resolution = new THREE.Uniform(new THREE.Vector2())
  private readonly first = new THREE.Uniform(0)
  private readonly restores: Array<() => void> = []
  private outputCount = 0
  private groupSize = 4
  private readonly material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true, premultipliedAlpha: true, toneMapped: false,
    uniforms: {map: new THREE.Uniform<THREE.Texture | null>(null)},
    vertexShader: 'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D map;varying vec2 uv0;void main(){gl_FragColor=texture2D(map,uv0);}',
  })
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
  private readonly camera = new THREE.Camera()

  capture(renderer: THREE.WebGLRenderer, destination: THREE.WebGLRenderTarget, depths: THREE.Texture[],
    draw: (target: THREE.WebGLRenderTarget, adapter: Pick<SparkDepthBuckets, 'attach'>) => void,
  ) {
    this.depths.value = depths
    this.resolution.value.set(destination.width, destination.height)
    const gl = renderer.getContext() as WebGL2RenderingContext
    this.groupSize = Math.min(8, gl.getParameter(gl.MAX_DRAW_BUFFERS) as number)
    const count = depths.length + 1, groupSize = this.groupSize
    try {
      for (let first = 0, group = 0; first < count; first += groupSize, group++) {
        this.outputCount = Math.min(groupSize, count - first)
        let target = this.targets[group]
        if (target && target.textures.length !== this.outputCount) { target.depthTexture = null; target.dispose(); target = undefined! }
        if (!target) this.targets[group] = target = new THREE.WebGLRenderTarget(destination.width, destination.height, {
          count: this.outputCount, type: THREE.HalfFloatType, depthBuffer: true,
          minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        })
        target.depthTexture = null
        target.setSize(destination.width, destination.height)
        target.depthTexture = destination.depthTexture
        target.stencilBuffer = destination.stencilBuffer
        this.first.value = first
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(true, false, false)
        try { draw(target, this) } finally { this.restoreHooks() }
      }
    } finally {
      this.restoreHooks()
      this.depths.value = []
      // These targets own their colors, but never own the upstream opaque depth attachment.
      for (const target of this.targets) target.depthTexture = null
    }
  }

  attach(material: THREE.Material) {
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey
    const count = this.outputCount, depthCount = this.depths.value.length
    const compile: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, {telluxBucketDepths: this.depths, telluxBucketResolution: this.resolution, telluxBucketFirst: this.first})
      const outputs = Array.from({length: count}, (_, i) => `layout(location=${i}) out vec4 telluxBucket${i};`).join('\n')
      const classification = Array.from({length: depthCount}, (_, i) =>
        `if (depth > texture2D(telluxBucketDepths[${i}], uv).r + 1.0 / 16777215.0) bucket = ${i + 1};`).join('\n')
      const writes = Array.from({length: count}, (_, i) =>
        `telluxBucket${i} = bucket == telluxBucketFirst + ${i} ? fragColor : vec4(0.0);`).join('\n')
      shader.fragmentShader = shader.fragmentShader.replace('out vec4 fragColor;', `vec4 fragColor;\n${outputs}
uniform sampler2D telluxBucketDepths[${depthCount}];
uniform vec2 telluxBucketResolution;
uniform int telluxBucketFirst;`)
        .replace(/}\s*$/, `
float depth = gl_FragCoord.z;
#if defined(USE_LOGARITHMIC_DEPTH_BUFFER) || defined(USE_LOGDEPTHBUF)
depth = gl_FragDepth;
#endif
vec2 uv = gl_FragCoord.xy / telluxBucketResolution;
int bucket = 0;
${classification}
${writes}
}`)
    }
    const key = () => `${previousKey.call(material)}:tellux-spark-buckets:${depthCount}:${count}`
    material.onBeforeCompile = compile; material.customProgramCacheKey = key; material.needsUpdate = true
    this.restores.push(() => {
      if (material.onBeforeCompile === compile) material.onBeforeCompile = previous
      if (material.customProgramCacheKey === key) material.customProgramCacheKey = previousKey
      material.needsUpdate = true
    })
  }

  composite(renderer: THREE.WebGLRenderer, destination: THREE.WebGLRenderTarget, index: number) {
    this.material.uniforms.map.value = this.targets[Math.floor(index / this.groupSize)].textures[index % this.groupSize]
    renderer.setRenderTarget(destination); renderer.render(this.quad, this.camera)
    this.material.uniforms.map.value = null
  }

  private restoreHooks() { for (const restore of this.restores.reverse()) restore(); this.restores.length = 0 }

  dispose() {
    this.restoreHooks()
    for (const target of this.targets) { target.depthTexture = null; target.dispose() }
    this.targets.length = 0; this.quad.geometry.dispose(); this.material.dispose()
  }
}
