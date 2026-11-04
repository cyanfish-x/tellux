import * as THREE from 'three'
import type { Viewer } from '../../src'
import type { AtmosphereManager } from '../../src/rendering/AtmosphereManager'
import type { ThreeEffectPass, ThreeRendererWithEffects } from '../../src/effects'
import { createJointMediumMaterial } from './JointMediumMaterial'
import { verifyMediumGPU } from './verifyMediumGPU'
import { correctCloudCentroid, optimizeCloudSampling, syncCloudSamplingDefines } from './IntegratedCloudAtmosphere'
import { stabilizeCloudSampling } from './stableCloudSampling'
import { verifyCloudComposition } from './verifyCloudComposition'

/** A1 联合积分实验，私有接缝不属于公开 API。 A1 joint integration experiment, with non-public seams. */
export function startMediumIntegration(viewer: Viewer) {
  if (!(viewer.renderer.raw instanceof THREE.WebGLRenderer)) throw new Error('A1 requires WebGL')
  const renderer = viewer.renderer.raw as ThreeRendererWithEffects
  const internal = viewer as unknown as { atmosphere: AtmosphereManager; postProcessing: { cloudAtmosphereAdapter: ThreeEffectPass; applyEffects(): void } }
  const clouds = internal.atmosphere.cloudsEffect
  clouds.localWeatherVelocity.set(0, 0)
  clouds.shapeVelocity.set(0, 0, 0)
  clouds.shapeDetailVelocity.set(0, 0, 0)
  const original = internal.postProcessing.cloudAtmosphereAdapter as ThreeEffectPass & { needsSwap?: boolean }
  const candidate = createJointMediumMaterial(clouds)
  const cloudMaterial = clouds.cloudsPass.currentMaterial
  const originalCloudShader = cloudMaterial.fragmentShader
  const integratedCloudShader = correctCloudCentroid(optimizeCloudSampling(stabilizeCloudSampling(originalCloudShader, false)))
  const shadowMaterial = clouds.shadowPass.currentMaterial
  const originalShadowShader = shadowMaterial.fragmentShader
  const integratedShadowShader = optimizeCloudSampling(stabilizeCloudSampling(originalShadowShader, false))
  const oldCloudBeforeRender = cloudMaterial.onBeforeRender
  const oldShadowBeforeRender = shadowMaterial.onBeforeRender
  cloudMaterial.onBeforeRender = function (...args) { oldCloudBeforeRender.apply(this, args); syncCloudSamplingDefines(this) }
  shadowMaterial.onBeforeRender = function (...args) { oldShadowBeforeRender.apply(this, args); syncCloudSamplingDefines(this) }
  let integratedActive = false
  const scene = new THREE.Scene()
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), candidate.material)
  quad.frustumCulled = false; scene.add(quad)
  const camera = new THREE.Camera()
  const oldSetEffects = renderer.setEffects
  let base: THREE.Effect[] = []
  let disposed = false, raf = 0, mode = 'joint', frame = 0, ready = false
  let pending: { resolve(value: unknown): void; reject(error: unknown): void } | null = null
  let lastValidation: unknown = null
  let shaderError: string | null = null
  const oldShaderError = renderer.debug.onShaderError
  renderer.debug.onShaderError = (context, program, vertex, fragment) => {
    shaderError = [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].join('\n')
    console.error('A1 shader failure', shaderError)
    oldShaderError?.(context, program, vertex, fragment)
  }
  let lastDefines = ''
  const gl = renderer.getContext() as WebGL2RenderingContext
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info')
  const queries: Array<{ query: WebGLQuery; width: number; height: number; steps: number; mode: string; segmented: boolean; cloudStep: number }> = []
  const timings: Array<{ ms: number; width: number; height: number; steps: number; mode: string; segmented: boolean; cloudStep: number }> = []
  const frameQueries: Array<{ query: WebGLQuery; cpuMs: number; frame: number; mode: string; cloudStep: number }> = []
  const frameTimings: Array<{ ms: number; cpuMs: number; frame: number; mode: string; cloudStep: number }> = []
  const controls = document.createElement('aside')
  controls.style.cssText = 'position:absolute;left:12px;top:12px;z-index:30;width:370px;max-height:92vh;overflow:auto;padding:16px;border-radius:8px;background:#112033ed;color:white;font:13px/1.5 sans-serif'
  controls.innerHTML = `<strong>A1 · 大气与云联合积分 / Joint media</strong>
<p>真实 Takram 云密度/云照明 + 可选大气源项。LUT 等效源项保留上游散射近似，不代表空气与云的多次散射完整耦合。</p>
<p><label>空气源项 / Air source <select id="a1-air-model"><option value="1" selected>LUT 区间等效 / LUT effective</option><option value="0">直接单次散射 / Direct single</option></select></label></p>
<label>对照 / Mode <select id="a1-mode"><option value="joint">联合消光参考 / Joint reference</option><option value="integrated">吸收权重深度近似 / Absorption centroid</option><option value="air-first">错误串接：空气在前 / Air first</option><option value="cloud-first">错误串接：云在前 / Cloud first</option><option value="upstream">现有上游 / Upstream</option></select></label>
<p><label><input id="a1-air" type="checkbox" checked>空气 / Air</label> <label><input id="a1-cloud" type="checkbox" checked>云 / Clouds</label></p>
<p><label>步数 / Steps <select id="a1-steps"><option>32</option><option selected>64</option><option>128</option><option>256</option><option>512</option></select></label></p>
<p><label>结果 / Output <select id="a1-output"><option value="0">场景 / Scene</option><option value="1">透射率 T</option><option value="2">散射 S</option></select></label></p>
<p><label><input id="a1-segmented" type="checkbox">插入云层边界 / Split at cloud shells</label></p>
<p><label>云内最大步长 / Cloud step <select id="a1-cloud-step"><option value="0">原网格 / Original</option><option value="10">10 m</option><option value="5" selected>5 m</option><option value="2">2 m</option></select></label></p>
<p>积分域 / Domain: 12 km；云内细化自动插入边界，空气保留均匀网格。联合 T &lt; 1e-6 时提前终止。</p>
<p><button id="a1-verify">运行数值检查 / Verify</button> <button id="a1-export">导出报告 / Export</button></p>
<p>报告分别记录整帧 GPU 与新增积分 draw 耗时；整帧不含数值验证读回。原方案与深度近似使用原有云质量，参考参数仅对参考模式生效。参考为同一照明近似的 8192 步加边界、不提前终止，并检查 4096 步差异；不是物理真值。</p>
<pre id="a1-status" style="white-space:pre-wrap">加载 LUT 与云纹理… / Loading…</pre>`
  document.body.append(controls)
  const element = <T extends HTMLElement>(id: string) => controls.querySelector<T>(`#a1-${id}`)!
  element<HTMLSelectElement>('mode').onchange = e => {
    mode = (e.target as HTMLSelectElement).value
    const reference = mode !== 'upstream' && mode !== 'integrated'
    for (const id of ['air', 'cloud', 'air-model', 'steps', 'segmented', 'cloud-step', 'output']) {
      (element(id) as HTMLInputElement).disabled = !reference
    }
  }
  element<HTMLInputElement>('air').onchange = e => { candidate.uniforms.a1Air.value = (e.target as HTMLInputElement).checked }
  element<HTMLSelectElement>('air-model').onchange = e => { candidate.uniforms.a1AirModel.value = Number((e.target as HTMLSelectElement).value) }
  element<HTMLInputElement>('cloud').onchange = e => { candidate.uniforms.a1Cloud.value = (e.target as HTMLInputElement).checked }
  element<HTMLSelectElement>('steps').onchange = e => { candidate.uniforms.a1Steps.value = Number((e.target as HTMLSelectElement).value) }
  element<HTMLInputElement>('segmented').onchange = e => { candidate.uniforms.a1Segmented.value = (e.target as HTMLInputElement).checked }
  element<HTMLSelectElement>('cloud-step').onchange = e => { candidate.uniforms.a1CloudStep.value = Number((e.target as HTMLSelectElement).value) }
  element<HTMLSelectElement>('output').onchange = e => { candidate.uniforms.a1Output.value = Number((e.target as HTMLSelectElement).value) }
  function pollTimers() {
    if (!timer) return
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { for (const item of queries) gl.deleteQuery(item.query); queries.length = 0; timings.length = 0; return }
    for (let i = queries.length - 1; i >= 0; --i) {
      const item = queries[i]
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue
      timings.push({ ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6, width: item.width, height: item.height, steps: item.steps, mode: item.mode, segmented: item.segmented, cloudStep: item.cloudStep })
      gl.deleteQuery(item.query); queries.splice(i, 1)
    }
    if (timings.length > 120) timings.splice(0, timings.length - 120)
  }
  function draw(target: THREE.WebGLRenderTarget) {
    const oldTarget = renderer.getRenderTarget(), auto = renderer.autoClear, tone = renderer.toneMapping
    try { renderer.setRenderTarget(target); renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.render(scene, camera); if (shaderError) throw new Error(shaderError) }
    finally { renderer.setRenderTarget(oldTarget); renderer.autoClear = auto; renderer.toneMapping = tone }
  }
  function validateRealMedium() {
    const target = new THREE.WebGLRenderTarget(64, 36, { type: THREE.FloatType, depthBuffer: false })
    const u = candidate.uniforms
    const saved = { steps: u.a1Steps.value, output: u.a1Output.value, mode: u.a1Mode.value, air: u.a1Air.value, cloud: u.a1Cloud.value, segmented: u.a1Segmented.value, cloudStep: u.a1CloudStep.value, terminate: u.a1Terminate.value, lightingStep: u.a1LightingStep.value }
    const samples = (steps: number, output: number, method: number, segmented = false, cloudStep = 0, terminate = false, lightingStep = 0) => { u.a1Terminate.value = terminate; u.a1LightingStep.value = lightingStep
      u.a1CloudStep.value = cloudStep
      u.a1Segmented.value = segmented
      u.a1Steps.value = steps; u.a1Output.value = output; u.a1Mode.value = method
      draw(target)
      const pixels = new Float32Array(64 * 36 * 4)
      renderer.readRenderTargetPixels(target, 0, 0, 64, 36, pixels)
      return pixels
    }
    const difference = (a: Float32Array, b: Float32Array) => {
      const values: number[] = []; let nonFinite = 0, worstIndex = -1, worst = -1
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) {
        const d = Math.abs(a[i] - b[i]); if (Number.isFinite(d)) values.push(d); else nonFinite++
        if (Number.isFinite(d) && d > worst) { worst = d; worstIndex = i }
      }
      values.sort((a, b) => a - b)
      return { p95: values[Math.floor(values.length * 0.95)] ?? null, max: values[values.length - 1] ?? null, nonFinite,
        worstPixel: worstIndex < 0 ? null : { x: Math.floor(worstIndex / 4) % 64, yFromBottom: Math.floor(worstIndex / 256), channel: worstIndex % 4 } }
    }
    try {
      const rows = [1, 2].map(output => {
        const reference = samples(8192, output, 0, true)
        return { output: output === 1 ? 'T' : 'S',
          steps64: difference(samples(64, output, 0), reference),
          steps128: difference(samples(128, output, 0), reference),
          segmented64: difference(samples(64, output, 0, true), reference),
          segmented128: difference(samples(128, output, 0, true), reference),
          segmented512: difference(samples(512, output, 0, true), reference),
          reference1024: difference(samples(1024, output, 0, true), reference),
          reference4096: difference(samples(4096, output, 0, true), reference),
          cloudStep10: difference(samples(64, output, 0, true, 10), reference),
          cloudStep5: difference(samples(64, output, 0, true, 5), reference),
          candidate: difference(samples(64, output, 0, true, 5, true, 100), reference),
          cloudStep2: difference(samples(64, output, 0, true, 2), reference),
          airFirst: difference(samples(8192, output, 1, true), reference),
          cloudFirst: difference(samples(8192, output, 2, true), reference) }
      })
      u.a1Air.value = true; u.a1Cloud.value = false
      const airAgainstLut = {
        transmittance: difference(samples(512, 1, 0), samples(512, 3, 0)),
        scattering: difference(samples(512, 2, 0), samples(512, 4, 0)),
        scope: u.a1AirModel.value === 0 ? 'Direct single scattering versus full upstream LUT; not integration-only error' : 'Finite-interval effective source versus full upstream LUT; not exact local multiple-scattering coupling',
      }
      return { resolution: [64, 36], reference: '8192-step plus shell boundaries without termination; inspect reference4096; not physical ground truth', air: saved.air, cloud: saved.cloud, rows, airAgainstLut }
    } finally { u.a1LightingStep.value = saved.lightingStep; u.a1Terminate.value = saved.terminate; u.a1CloudStep.value = saved.cloudStep; u.a1Segmented.value = saved.segmented; u.a1Steps.value = saved.steps; u.a1Output.value = saved.output; u.a1Mode.value = saved.mode; u.a1Air.value = saved.air; u.a1Cloud.value = saved.cloud; target.dispose() }
  }
  const wrapper: ThreeEffectPass & { enabled: boolean; needsSwap: boolean } = {
    enabled: true, needsSwap: original.needsSwap !== false,
    setSize(width, height) { original.setSize(width, height) }, dispose() {},
    render(raw, write, read, delta) {
      if (integratedActive !== (mode === 'integrated')) {
        integratedActive = mode === 'integrated'
        cloudMaterial.fragmentShader = integratedActive ? integratedCloudShader : originalCloudShader
        cloudMaterial.needsUpdate = true
        shadowMaterial.fragmentShader = integratedActive ? integratedShadowShader : originalShadowShader
        shadowMaterial.needsUpdate = true
      }
      // Keep upstream resource preparation as a control path; replace its color result only.
      original.render(raw, write, read, delta, false)
      ready = !!clouds.scatteringTexture && ['localWeatherTexture', 'shapeTexture', 'shapeDetailTexture', 'turbulenceTexture', 'stbnTexture', 'transmittance_texture', 'scattering_texture', 'irradiance_texture'].every(name => !!cloudMaterial.uniforms[name]?.value)
      if (!ready) return
      const key = JSON.stringify(clouds.cloudsPass.currentMaterial.defines)
      if (key !== lastDefines) { candidate.sync(); candidate.material.needsUpdate = true; lastDefines = key }
      candidate.uniforms.a1Scene.value = read.texture
      candidate.uniforms.inverseProjectionMatrix.value.copy(viewer.camera.raw.projectionMatrixInverse)
      candidate.uniforms.a1Mode.value = mode === 'air-first' ? 1 : mode === 'cloud-first' ? 2 : 0
      if (pending) {
        const job = pending; pending = null
        try { lastValidation = { analytic: verifyMediumGPU(renderer), realMedium: validateRealMedium(), cloudComposition: verifyCloudComposition(renderer, clouds, originalCloudShader) }; job.resolve(lastValidation) }
        catch (error) { job.reject(error) }
      }
      if (mode === 'upstream' || mode === 'integrated') return
      pollTimers()
      const query = timer && queries.length < 4 && frame % 2 === 0 ? gl.createQuery() : null
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
      try { draw(write) } finally {
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push({ query, width: write.width, height: write.height, steps: candidate.uniforms.a1Steps.value, mode, segmented: candidate.uniforms.a1Segmented.value, cloudStep: candidate.uniforms.a1CloudStep.value }) }
      }
    },
  }
  renderer.setEffects = effects => { base = effects ?? []; oldSetEffects.call(renderer, base.map(effect => effect === original ? wrapper : effect)) }
  internal.postProcessing.applyEffects()
  const report = () => ({ phase: 'A1', frame, ready: ready && !shaderError, shaderError, mode, steps: candidate.uniforms.a1Steps.value,
    segmented: candidate.uniforms.a1Segmented.value, cloudStepMeters: candidate.uniforms.a1CloudStep.value,
    airModel: candidate.uniforms.a1AirModel.value, sourceSpanMeters: candidate.uniforms.a1SourceSpan.value, terminationThreshold: 1e-6,
    air: candidate.uniforms.a1Air.value, clouds: candidate.uniforms.a1Cloud.value, output: candidate.uniforms.a1Output.value,
    domainMeters: candidate.uniforms.a1Distance.value, framebuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    clock: viewer.clock.currentTime.toISOString(),
    physicalState: { camera: viewer.camera.raw.matrixWorld.toArray(), projection: viewer.camera.raw.projectionMatrix.toArray(),
      weather: clouds.localWeatherOffset.toArray(), shape: clouds.shapeOffset.toArray(), detail: clouds.shapeDetailOffset.toArray(),
      sun: cloudMaterial.uniforms.sunDirection.value.toArray(), coverage: clouds.coverage, quality: viewer.scene.clouds.quality ?? 'default',
      cloudSampling: ['maxIterationCount', 'minStepSize', 'maxStepSize', 'minDensity', 'minExtinction', 'minTransmittance', 'maxIterationCountToSun', 'mipLevelScale'].map(name => [name, cloudMaterial.uniforms[name]?.value]) },
    weatherMotion: 'frozen; local sampling jitter fixed to 0.5',
    dependencies: { three: THREE.REVISION, atmosphere: '0.19.1', clouds: '0.7.6' },
    scope: 'Joint view-ray integration with selectable direct/finite-LUT-effective air and upstream cloud lighting; no full coupling claim',
    camera: viewer.camera.raw.matrixWorld.toArray(), projection: (viewer.camera.raw as THREE.PerspectiveCamera).projectionMatrix.toArray(),
    environment: { userAgent: navigator.userAgent, gpu: debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), timerAvailable: !!timer },
    gpuSamples: [...timings], frameGpuSamples: [...frameTimings], validation: lastValidation })
  const hasFrameSamples = (sampleMode: string, afterFrame: number, count: number) => {
    if (shaderError) throw new Error(shaderError)
    let matches = 0
    for (const sample of frameTimings) if (sample.mode === sampleMode && sample.frame > afterFrame && ++matches >= count) return true
    return false
  }
  const verify = () => {
    if (disposed) return Promise.reject(new Error('A1 disposed'))
    if (!ready) return Promise.reject(new Error('LUT/cloud textures not ready'))
    if (pending) return Promise.reject(new Error('Validation already pending'))
    return new Promise<unknown>((resolve, reject) => { pending = { resolve, reject } })
  }
  element('verify').onclick = async () => {
    element('verify').setAttribute('disabled', '')
    try { await verify() } catch (error) { element('status').textContent = String(error) }
    finally { element('verify').removeAttribute('disabled') }
  }
  element('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'a1-medium-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function tick(time: number) {
    if (disposed) return
    if (timer) {
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT)
      for (let i = frameQueries.length - 1; i >= 0; --i) {
        const item = frameQueries[i]
        if (!disjoint && !gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue
        if (!disjoint) frameTimings.push({ ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6, cpuMs: item.cpuMs, frame: item.frame, mode: item.mode, cloudStep: item.cloudStep })
        gl.deleteQuery(item.query); frameQueries.splice(i, 1)
      }
      if (disjoint) frameTimings.length = 0
      if (frameTimings.length > 180) frameTimings.splice(0, frameTimings.length - 180)
    }
    // Alternate full-frame and integration-only queries; WebGL timer queries cannot nest.
    const frameQuery = timer && !pending && frame % 2 === 1 && frameQueries.length < 4 ? gl.createQuery() : null
    if (frameQuery) gl.beginQuery(timer.TIME_ELAPSED_EXT, frameQuery)
    const cpuStart = performance.now()
    try { viewer.render(time) } catch (error) { element('status').textContent = `运行失败 / Failed: ${String(error)}`; pending?.reject(error); pending = null; return }
    finally { if (frameQuery) { gl.endQuery(timer.TIME_ELAPSED_EXT); frameQueries.push({ query: frameQuery, cpuMs: performance.now() - cpuStart, frame, mode, cloudStep: candidate.uniforms.a1CloudStep.value }) } }
    frame++
    if (frame % 15 === 0) {
      const current = timings.filter(sample => sample.steps === candidate.uniforms.a1Steps.value && sample.mode === mode && sample.segmented === candidate.uniforms.a1Segmented.value && sample.cloudStep === candidate.uniforms.a1CloudStep.value)
      element('status').textContent = JSON.stringify({ ready, mode, steps: candidate.uniforms.a1Steps.value, gpuSamples: current.length,
        lastDrawMs: current[current.length - 1]?.ms ?? null, validation: lastValidation }, null, 2)
    }
    raf = requestAnimationFrame(tick)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(raf); pending?.reject(new Error('A1 disposed')); pending = null
    renderer.setEffects = oldSetEffects; oldSetEffects.call(renderer, base)
    renderer.debug.onShaderError = oldShaderError
    cloudMaterial.fragmentShader = originalCloudShader; cloudMaterial.needsUpdate = true
    shadowMaterial.fragmentShader = originalShadowShader; shadowMaterial.needsUpdate = true
    cloudMaterial.onBeforeRender = oldCloudBeforeRender; shadowMaterial.onBeforeRender = oldShadowBeforeRender
    syncCloudSamplingDefines(cloudMaterial); syncCloudSamplingDefines(shadowMaterial)
    for (const item of queries) gl.deleteQuery(item.query)
    for (const item of frameQueries) gl.deleteQuery(item.query)
    candidate.dispose(); quad.geometry.dispose(); controls.remove()
    window.removeEventListener('pagehide', dispose); viewer.destroy()
  }
  window.addEventListener('pagehide', dispose)
  Object.assign(window, { viewer, mediumIntegration: { report, verify, dispose, hasFrameSamples } })
  viewer.flyToTarget({ longitude: 0, latitude: 0, height: 2500 }, { offset: { heading: 0, pitch: 5, distance: 5000 }, duration: 0 })
  raf = requestAnimationFrame(tick)
}
