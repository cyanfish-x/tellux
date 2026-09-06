import * as THREE from 'three'
import type { Viewer } from '../../src'
import type { AtmosphereManager } from '../../src/rendering/AtmosphereManager'
import type { ThreeEffectPass, ThreeRendererWithEffects } from '../../src/effects'
import { createJointMediumMaterial } from './JointMediumMaterial'
import { verifyMediumGPU } from './verifyMediumGPU'

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
  const queries: Array<{ query: WebGLQuery; width: number; height: number; steps: number; mode: string }> = []
  const timings: Array<{ ms: number; width: number; height: number; steps: number; mode: string }> = []
  const controls = document.createElement('aside')
  controls.style.cssText = 'position:absolute;left:12px;top:12px;z-index:30;width:370px;max-height:92vh;overflow:auto;padding:16px;border-radius:8px;background:#112033ed;color:white;font:13px/1.5 sans-serif'
  controls.innerHTML = `<strong>A1 · 大气与云联合积分 / Joint media</strong>
<p>真实 Takram 云密度/云照明 + 大气直接单次散射。此实验不代表完整多次散射模型已通过。</p>
<label>对照 / Mode <select id="a1-mode"><option value="joint">联合消光 / Joint</option><option value="air-first">错误串接：空气在前 / Air first</option><option value="cloud-first">错误串接：云在前 / Cloud first</option><option value="upstream">现有上游 / Upstream</option></select></label>
<p><label><input id="a1-air" type="checkbox" checked>空气 / Air</label> <label><input id="a1-cloud" type="checkbox" checked>云 / Clouds</label></p>
<p><label>步数 / Steps <select id="a1-steps"><option>32</option><option selected>64</option><option>128</option><option>256</option><option>512</option></select></label></p>
<p><label>结果 / Output <select id="a1-output"><option value="0">场景 / Scene</option><option value="1">透射率 T</option><option value="2">散射 S</option></select></label></p>
<p>积分域 / Domain: 12 km；中点定步长，无提前终止。</p>
<p><button id="a1-verify">运行数值检查 / Verify</button> <button id="a1-export">导出报告 / Export</button></p>
<p>GPU 耗时仅统计新增积分 draw，不含现有云准备、读回和后处理。参考为同一照明近似的 512 步，不是物理真值。</p>
<pre id="a1-status" style="white-space:pre-wrap">加载 LUT 与云纹理… / Loading…</pre>`
  document.body.append(controls)
  const element = <T extends HTMLElement>(id: string) => controls.querySelector<T>(`#a1-${id}`)!
  element<HTMLSelectElement>('mode').onchange = e => { mode = (e.target as HTMLSelectElement).value }
  element<HTMLInputElement>('air').onchange = e => { candidate.uniforms.a1Air.value = (e.target as HTMLInputElement).checked }
  element<HTMLInputElement>('cloud').onchange = e => { candidate.uniforms.a1Cloud.value = (e.target as HTMLInputElement).checked }
  element<HTMLSelectElement>('steps').onchange = e => { candidate.uniforms.a1Steps.value = Number((e.target as HTMLSelectElement).value) }
  element<HTMLSelectElement>('output').onchange = e => { candidate.uniforms.a1Output.value = Number((e.target as HTMLSelectElement).value) }
  function pollTimers() {
    if (!timer) return
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { for (const item of queries) gl.deleteQuery(item.query); queries.length = 0; timings.length = 0; return }
    for (let i = queries.length - 1; i >= 0; --i) {
      const item = queries[i]
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue
      timings.push({ ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6, width: item.width, height: item.height, steps: item.steps, mode: item.mode })
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
    const saved = { steps: u.a1Steps.value, output: u.a1Output.value, mode: u.a1Mode.value, air: u.a1Air.value, cloud: u.a1Cloud.value }
    const samples = (steps: number, output: number, method: number) => {
      u.a1Steps.value = steps; u.a1Output.value = output; u.a1Mode.value = method
      draw(target)
      const pixels = new Float32Array(64 * 36 * 4)
      renderer.readRenderTargetPixels(target, 0, 0, 64, 36, pixels)
      return pixels
    }
    const difference = (a: Float32Array, b: Float32Array) => {
      const values: number[] = []; let nonFinite = 0
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) {
        const d = Math.abs(a[i] - b[i]); if (Number.isFinite(d)) values.push(d); else nonFinite++
      }
      values.sort((a, b) => a - b)
      return { p95: values[Math.floor(values.length * 0.95)] ?? null, max: values[values.length - 1] ?? null, nonFinite }
    }
    try {
      const rows = [1, 2].map(output => {
        const reference = samples(512, output, 0)
        return { output: output === 1 ? 'T' : 'S',
          steps64: difference(samples(64, output, 0), reference),
          steps128: difference(samples(128, output, 0), reference),
          airFirst: difference(samples(512, output, 1), reference),
          cloudFirst: difference(samples(512, output, 2), reference) }
      })
      u.a1Air.value = true; u.a1Cloud.value = false
      const airAgainstLut = {
        transmittance: difference(samples(512, 1, 0), samples(512, 3, 0)),
        scattering: difference(samples(512, 2, 0), samples(512, 4, 0)),
        scope: 'Direct single scattering versus full upstream LUT; scattering mismatch is not an integration-only error',
      }
      return { resolution: [64, 36], reference: '512-step same closure, not physical ground truth', air: saved.air, cloud: saved.cloud, rows, airAgainstLut }
    } finally { u.a1Steps.value = saved.steps; u.a1Output.value = saved.output; u.a1Mode.value = saved.mode; u.a1Air.value = saved.air; u.a1Cloud.value = saved.cloud; target.dispose() }
  }
  const wrapper: ThreeEffectPass & { enabled: boolean; needsSwap: boolean } = {
    enabled: true, needsSwap: original.needsSwap !== false,
    setSize(width, height) { original.setSize(width, height) }, dispose() {},
    render(raw, write, read, delta) {
      // Keep upstream resource preparation as a control path; replace its color result only.
      original.render(raw, write, read, delta, false)
      ready = !!clouds.scatteringTexture && !!clouds.localWeatherTexture && !!clouds.shapeTexture
      if (!ready) return
      const key = JSON.stringify(clouds.cloudsPass.currentMaterial.defines)
      if (key !== lastDefines) { candidate.sync(); candidate.material.needsUpdate = true; lastDefines = key }
      candidate.uniforms.a1Scene.value = read.texture
      candidate.uniforms.a1Mode.value = mode === 'air-first' ? 1 : mode === 'cloud-first' ? 2 : 0
      if (pending) {
        const job = pending; pending = null
        try { lastValidation = { analytic: verifyMediumGPU(renderer), realMedium: validateRealMedium() }; job.resolve(lastValidation) }
        catch (error) { job.reject(error) }
      }
      if (mode === 'upstream') return
      pollTimers()
      const query = timer && queries.length < 4 && frame % 10 === 0 ? gl.createQuery() : null
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
      try { draw(write) } finally {
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push({ query, width: write.width, height: write.height, steps: candidate.uniforms.a1Steps.value, mode }) }
      }
    },
  }
  renderer.setEffects = effects => { base = effects ?? []; oldSetEffects.call(renderer, base.map(effect => effect === original ? wrapper : effect)) }
  internal.postProcessing.applyEffects()
  const report = () => ({ phase: 'A1', ready: ready && !shaderError, shaderError, mode, steps: candidate.uniforms.a1Steps.value,
    air: candidate.uniforms.a1Air.value, clouds: candidate.uniforms.a1Cloud.value, output: candidate.uniforms.a1Output.value,
    domainMeters: candidate.uniforms.a1Distance.value, framebuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    clock: viewer.clock.currentTime.toISOString(), weatherMotion: 'frozen; local sampling jitter fixed to 0.5',
    dependencies: { three: THREE.REVISION, atmosphere: '0.19.1', clouds: '0.7.6' },
    scope: 'Joint view-ray integration with direct-single-scattering air and upstream cloud lighting; no full coupling claim',
    camera: viewer.camera.raw.matrixWorld.toArray(), projection: (viewer.camera.raw as THREE.PerspectiveCamera).projectionMatrix.toArray(),
    environment: { userAgent: navigator.userAgent, gpu: debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), timerAvailable: !!timer },
    gpuSamples: [...timings], validation: lastValidation })
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
    try { viewer.render(time) } catch (error) { element('status').textContent = `运行失败 / Failed: ${String(error)}`; pending?.reject(error); pending = null; return }
    frame++
    if (frame % 15 === 0) {
      const current = timings.filter(sample => sample.steps === candidate.uniforms.a1Steps.value && sample.mode === mode)
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
    for (const item of queries) gl.deleteQuery(item.query)
    candidate.material.dispose(); quad.geometry.dispose(); controls.remove()
    window.removeEventListener('pagehide', dispose); viewer.destroy()
  }
  window.addEventListener('pagehide', dispose)
  Object.assign(window, { viewer, mediumIntegration: { report, verify, dispose } })
  viewer.flyToTarget({ longitude: 0, latitude: 0, height: 2500 }, { offset: { heading: 0, pitch: 5, distance: 5000 }, duration: 0 })
  raf = requestAnimationFrame(tick)
}
