// Production stage-1 acceptance; baseline, submission-only and aerial perspective costs remain separate.
// node examples/rendering-prototypes/verify-pipeline.mjs [origin] [output-directory]
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const out = resolve(process.argv[3] ?? 'artifacts/stage1')
const continuous = process.argv.includes('--continuous')
const only = process.argv.find(arg => arg.startsWith('--id='))?.slice(5)
const cloudsEnabled = process.argv.includes('--clouds')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = []
try {
  for (const hosted of (process.argv.includes('--standalone-only') ? [false] : [false, true])) for (const id of (only ? [only] : ['rendering-stages', 'entities', 'gaussian-splat-3d-tiles'])) {
    const name = `${hosted ? 'sandcastle' : 'standalone'}-${id}`
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    const errors = [], failedResources = []
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()) })
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failedResources.push({ url: r.url().split('?')[0], status: r.status() }) })
    await page.addInitScript(() => {
      const frame = requestAnimationFrame.bind(window)
      window.pipelineFrame = () => new Promise(frame)
      window.requestAnimationFrame = callback => frame(time => { if (!window.pipelinePaused) callback(time) })
    })
    try {
      await page.goto(hosted ? `${base}/sandcastle.html?example=${id}` : `${base}/${id}.html`)
      let frame = page.mainFrame()
      if (hosted) {
        await page.waitForSelector('iframe[src*="runner.html"]', { timeout: 60000 })
        frame = await (await page.$('iframe[src*="runner.html"]')).contentFrame()
      }
      await frame.waitForFunction(() => !!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture, null, { timeout: 90000 })
      if (await frame.$('#prototype-mode')) await frame.selectOption('#prototype-mode', 'baseline')
      await frame.evaluate(clouds => {
        const viewer = window.viewer
        viewer.clock.shouldAnimate = false
        viewer.clock.currentTime = new Date('2026-09-12T02:00:00Z')
        viewer.scene.clouds.show = clouds
      },cloudsEnabled)
      if (id === 'gaussian-splat-3d-tiles') await frame.waitForFunction(() => /可见瓦片：[1-9]\d*|Visible tiles: [1-9]\d*/.test(document.body.innerText)&&!window.viewer.camera.isFlying, null, { timeout: 90000 })
      await page.waitForTimeout(6000)
      const result = await frame.evaluate(async ({ measure, continuous }) => {
        const viewer = window.viewer, renderer = viewer.renderer.raw, manager = viewer.postProcessing
        window.pipelinePaused = true
        viewer.useDefaultRenderLoop = false
        const gl = renderer.getContext(), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
        const debug = gl.getExtension('WEBGL_debug_renderer_info')
        const all = [...manager.activeEffects]
        const native = all.map(p => p === manager.sceneSubmission.opaque
          ? { needsSwap:false, setSize(){}, render(_r,_w,read){ manager.frame.publish(read) } }
          : p === manager.sceneSubmission.transparent
          ? { needsSwap:false, setSize(){}, render(r,_w,read){ manager.entityRenderer?.renderTransparency(r,read,manager.frame.require('native reference').depth) } }
          : p === manager.opaqueNormalAdapter ? manager.normalAdapter : p)
        const blocks = []
        const adapter = manager.transparentAtmosphere, update = adapter.update
        let currentMode = 'aerial'
        const opaqueRender = manager.sceneSubmission.opaque.render
        let opaqueEntries = 0
        manager.sceneSubmission.opaque.render = (...args) => { opaqueEntries++; return opaqueRender(...args) }
        adapter.update = function (...args) {
          update.apply(this, args)
          if (currentMode !== 'aerial') this.active.value = false
        }
        const setMode = mode => {
          currentMode = mode
          manager.sceneSubmission.atmosphereEnabled = mode === 'aerial'
          renderer.setEffects(mode === 'native' ? native : all)
        }
        const render = () => {
          // Symbol output restores manager.activeEffects after every frame; install the control
          // chain before EACH render, and assert that the intended main submission actually ran.
          renderer.setEffects(currentMode === 'native' ? native : all)
          if (currentMode === 'native') viewer.atmosphere.aerialPerspectiveEffect.normalBuffer = manager.normalTexture
          const before = opaqueEntries
          viewer.render(performance.now())
          if (opaqueEntries-before !== (currentMode === 'native' ? 0 : 1)) throw Error('Measured effects chain was replaced')
        }
        const summarize = values => {
          const sorted = values.filter(Number.isFinite).sort((a,b) => a-b)
          return { p50: sorted[Math.floor(sorted.length*.5)] ?? null, p95: sorted[Math.floor(sorted.length*.95)] ?? null }
        }
        const sequence = measure ? ['native','submission','aerial','aerial','submission','native','aerial','native','native','aerial'] : ['aerial']
        try {
          for (const mode of sequence) {
            setMode(mode)
          // Keep the frame owner and all scene content; only select the controlled effects chain.
            for (let i=0;i<30;i++) { if(!continuous)await window.pipelineFrame(); render() }
            const samples = []
            const queries = []
            for (let i=0;i<(measure ? 30 : 2);i++) {
              if(!continuous)await window.pipelineFrame()
              const q = timer && gl.createQuery()
              renderer.info.autoReset = false; renderer.info.reset()
              if(q) gl.beginQuery(timer.TIME_ELAPSED_EXT,q)
              const start = performance.now(); render(); const cpu = performance.now()-start
              if(q) gl.endQuery(timer.TIME_ELAPSED_EXT)
              const draws = renderer.info.render.calls
              if(continuous) { samples.push({cpu,gpu:null,draws,disjoint:null});queries.push(q);continue }
              if(q) while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)) await window.pipelineFrame()
              const disjoint = q ? gl.getParameter(timer.GPU_DISJOINT_EXT) : null
              const gpu = q && !disjoint ? gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6 : null
              if(q) gl.deleteQuery(q)
              samples.push({cpu,gpu,draws,disjoint})
            }
            if(continuous) {
              gl.flush()
              for(let i=0;i<queries.length;i++) {
                const q=queries[i]
                if(!q)continue
                while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))await window.pipelineFrame()
                samples[i].disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT)
                samples[i].gpu=samples[i].disjoint?null:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6
                gl.deleteQuery(q)
              }
            }
            blocks.push({ mode, cpu:summarize(samples.map(s=>s.cpu)),gpu:summarize(samples.map(s=>s.gpu)),samples })
          }
          setMode('aerial'); render()
          const shaders = renderer.info.programs.filter(p => gl.getAttachedShaders(p.program).some(s => gl.getShaderSource(s).includes('telluxEvaluateTransparentAtmosphere'))).length
          return { continuous,blocks, shaders, glError:gl.getError(),camera:viewer.camera.raw.matrixWorld.toArray(),width:renderer.domElement.width,height:renderer.domElement.height,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null }
        } finally { manager.sceneSubmission.opaque.render=opaqueRender;adapter.update=update;renderer.setEffects(all);renderer.info.autoReset=true }
      }, { measure: !hosted && !process.argv.includes('--visual-only'), continuous })
      await page.screenshot({ path: resolve(out, `${name}.png`) })
      const row = { name, cloudsEnabled, ...result, errors, failedResources }
      report.push(row)
      console.log(JSON.stringify({name,shaders:result.shaders,glError:result.glError,blocks:result.blocks.map(({mode,cpu,gpu})=>({mode,cpu,gpu})),errors,failedResources}))
    } catch (error) { report.push({name,error:String(error),errors,failedResources}); console.error(name,error) }
    await page.close()
    await writeFile(resolve(out,'pipeline.json'),JSON.stringify(report,null,2))
  }
} finally { await browser.close() }
if(report.some(r=>r.error||r.glError||r.errors.length||r.failedResources.length))process.exitCode=1
