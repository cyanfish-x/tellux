// Stage 0: real entry baselines plus a native Three.js submission contract.
// Usage: node examples/rendering-prototypes/verify-stages.mjs <Vite-dev-server> <output-directory>
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
const out = resolve(process.argv[3] ?? 'artifacts/stage0')
const visualOnly = process.argv.includes('--visual-only')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const summaries = []
try {
  for (const hosted of [false, true]) {
    for (const id of ['rendering-stages', 'rendering-splat-atmosphere', 'rendering-cloud-transparency', 'gaussian-splat-3d-tiles']) {
      const name = `${hosted ? 'sandcastle' : 'standalone'}-${id}`
      const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
      const errors = [], resources = []
      page.on('pageerror', error => errors.push(String(error)))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('response', response => {
        if (response.status() >= 400) resources.push({ url: response.url().split('?')[0], status: response.status() })
      })
      // Pause the example's animation only while measuring. Keep a native frame scheduler.
      await page.addInitScript(() => {
        const native = requestAnimationFrame.bind(window)
        let paused = false
        const pending = new Map()
        window.requestAnimationFrame = callback => native(time => {
          if (paused) pending.set(callback, true)
          else callback(time)
        })
        window.stage0Scheduler = {
          frame: () => new Promise(native),
          pause: () => { paused = true },
          resume: () => { paused = false; for (const callback of pending.keys()) native(callback); pending.clear() },
        }
      })
      try {
        await page.goto(hosted ? `${base}/sandcastle.html?example=${id}` : `${base}/${id}.html`)
        let frame = page.mainFrame()
        if (hosted) {
          await page.waitForSelector('iframe[src*="runner.html"]', { timeout: 60000 })
          frame = await (await page.$('iframe[src*="runner.html"]')).contentFrame()
        }
        await frame.waitForFunction(() => !!window.viewer?.renderer?.raw, null, { timeout: 60000 })
        await frame.evaluate(actual => {
          const viewer=window.viewer
          viewer.clock.shouldAnimate=false
          if(actual)viewer.clock.currentTime=new Date('2026-09-12T02:00:00Z')
          viewer.scene.clouds.speed=0
          const clouds=viewer.atmosphere.cloudsEffect
          clouds.localWeatherOffset.set(0,0)
          clouds.shapeOffset.set(0,0,0);clouds.shapeDetailOffset.set(0,0,0)
          clouds.shapeVelocity.set(0,0,0);clouds.shapeDetailVelocity.set(0,0,0)
        }, id === 'gaussian-splat-3d-tiles')
        if (id !== 'gaussian-splat-3d-tiles') {
          await frame.waitForFunction(() => window.renderingPrototype?.report().depthAvailable
            && !!window.viewer.atmosphere.aerialPerspectiveEffect.scatteringTexture, null, { timeout: 60000 })
          if (id === 'rendering-splat-atmosphere') {
            await frame.waitForFunction(() => window.viewer.scene.raw.children.some(o => o.constructor.name.includes('SparkRenderer')), null, { timeout: 60000 })
          }
        } else {
          await frame.waitForFunction(() => /可见瓦片：\d+|Visible tiles: \d+/.test(document.body.innerText), null, { timeout: 90000 })
          await frame.waitForFunction(() => !!window.viewer.atmosphere.aerialPerspectiveEffect.scatteringTexture, null, { timeout: 60000 })
        }
        await frame.evaluate(() => { window.viewer.clock.shouldAnimate = false })
        await page.waitForTimeout(1500)
        let contract
        if (id === 'rendering-stages') {
          // Test-only module: do not ship the GPU fixture in the example runtime graph.
          contract = await frame.evaluate(async () => {
            const { verifyStageSubmission } = await import('/rendering-prototypes/verifyStageSubmission.ts')
            return verifyStageSubmission()
          })
          for (const row of contract.results) {
            await writeFile(resolve(out, `${name}-${row.mode}-${row.swap}.png`), Buffer.from(row.image.split(',')[1], 'base64'))
            delete row.image
          }
          if (!contract.passed) throw Error('Submission contract failed')
        }
        const views = []
        for (const mode of id === 'gaussian-splat-3d-tiles' ? ['existing', 'atmosphere-off'] : ['baseline', 'after', 'before']) {
          if (mode === 'atmosphere-off') await frame.evaluate(() => { window.viewer.scene.atmosphere.show = false })
          else if (mode !== 'existing') await frame.selectOption('#prototype-mode', mode)
          await page.waitForTimeout(500)
          await page.screenshot({ path: resolve(out, `${name}-${mode}.png`) })
          if (hosted && id !== 'gaussian-splat-3d-tiles') {
            // The small iframe's controls cover the test object; retain an unobstructed capture too.
            await frame.evaluate(() => { document.querySelector('#prototype-mode').closest('aside').style.visibility='hidden' })
            try { await page.screenshot({ path: resolve(out, `${name}-${mode}-scene.png`) }) }
            finally { await frame.evaluate(() => { document.querySelector('#prototype-mode').closest('aside').style.visibility='' }) }
          }
          views.push(await frame.evaluate(() => window.renderingPrototype?.report() ?? {
            camera: window.viewer.camera.raw.matrixWorld.toArray(),
            atmosphere: window.viewer.scene.atmosphere.show,
            status: document.body.innerText.match(/可见瓦片：[^\n]*|Visible tiles: [^\n]*/)?.[0],
          }))
        }
        if (id === 'gaussian-splat-3d-tiles') await frame.evaluate(() => { window.viewer.scene.atmosphere.show = true })
        // Measure only standalone: iframe dimensions differ, so never pool both surfaces.
        const performance = hosted || visualOnly ? null : await frame.evaluate(async actual => {
          const viewer = window.viewer, renderer = viewer.renderer.raw, gl = renderer.getContext()
          const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
          const debug = gl.getExtension('WEBGL_debug_renderer_info')
          const scheduler = window.stage0Scheduler
          const rows = []
          const modes = actual ? ['existing'] : ['baseline', 'after', 'after', 'baseline', 'after', 'baseline', 'baseline', 'after']
          scheduler.pause()
          await scheduler.frame()
          const camera = viewer.camera.raw.matrixWorld.toArray()
          const clock = viewer.clock.currentTime.toISOString()
          const physical = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, dpr: devicePixelRatio,
            camera, projection: viewer.camera.raw.projectionMatrix.toArray(), clock,
            clouds: { show: viewer.scene.clouds.show, quality: viewer.scene.clouds.quality,
              coverage: viewer.scene.clouds.coverage, speed: viewer.scene.clouds.speed,
              altitude: viewer.scene.clouds.layer.altitude, height: viewer.scene.clouds.layer.height,
              shadowQuality: viewer.scene.clouds.shadow.quality,
              localWeatherOffset: viewer.atmosphere.cloudsEffect.localWeatherOffset.toArray(),
              shapeOffset: viewer.atmosphere.cloudsEffect.shapeOffset.toArray(),
              shapeDetailOffset: viewer.atmosphere.cloudsEffect.shapeDetailOffset.toArray() },
            gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, userAgent: navigator.userAgent }
          let sampleTime = performance.now()
          try {
            for (const mode of modes) {
              if (!actual) {
                const select = document.querySelector('#prototype-mode')
                select.value = mode; select.dispatchEvent(new Event('change'))
              }
              for (let i = 0; i < 30; i++) { await scheduler.frame(); viewer.render(sampleTime += 16.6667) }
              const samples = []
              for (let i = 0; i < 20; i++) {
                await scheduler.frame()
                const query = ext ? gl.createQuery() : null
                const draw = renderer.renderBufferDirect
                let draws = 0
                renderer.renderBufferDirect = function (...args) { draws++; return draw.apply(this, args) }
                let cpuMs
                try {
                  if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
                  const start = performance.now()
                  viewer.render(sampleTime += 16.6667)
                  cpuMs = performance.now() - start
                } finally {
                  if (query) gl.endQuery(ext.TIME_ELAPSED_EXT)
                  renderer.renderBufferDirect = draw
                }
                let gpuMs = null, disjoint = false
                if (query) {
                  try {
                    const deadline = performance.now() + 5000
                    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
                      if (performance.now() > deadline) throw Error('GPU timer timeout')
                      await scheduler.frame()
                    }
                    disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT)
                    if (!disjoint) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
                  } finally { gl.deleteQuery(query) }
                }
                const glError = gl.getError()
                if (glError) throw Error(`GL error ${glError} during ${mode}`)
                samples.push({ cpuMs, gpuMs, disjoint, draws })
              }
              if (JSON.stringify(camera) !== JSON.stringify(viewer.camera.raw.matrixWorld.toArray()) || clock !== viewer.clock.currentTime.toISOString()) {
                throw Error('Camera or clock changed during paired measurement')
              }
              const stats = key => {
                const values = samples.map(s => s[key]).filter(v => v !== null).sort((a,b) => a-b)
                return values.length ? { p50: values[Math.floor(values.length*.5)], p95: values[Math.floor(values.length*.95)] } : null
              }
              rows.push({ mode, cpu: stats('cpuMs'), gpu: stats('gpuMs'), samples })
            }
          } finally { scheduler.resume() }
          return { physical, warmupPerBlock: 30, samplesPerBlock: 20, rows,
            scope: 'Frame-paced Viewer.render CPU/GPU, existing prototypes only. Excludes tileset.update outside Viewer. No production candidate or performance acceptance.' }
        }, id === 'gaussian-splat-3d-tiles')
        // Favicon failures are retained as resource diagnostics, not rendering failures.
        const renderErrors = errors.filter(e => !e.startsWith('Failed to load resource:'))
        const report = { name, contract, views, performance, errors, resources, renderErrors }
        await writeFile(resolve(out, `${name}.json`), JSON.stringify(report, null, 2))
        if (renderErrors.length) throw Error(JSON.stringify(renderErrors))
        summaries.push({ name, executed: true, contract: contract?.passed ?? null,
          resourceFailures: resources.length, gpu: performance?.rows.map(r => ({ mode: r.mode, gpu: r.gpu, cpu: r.cpu })) })
      } catch (error) {
        summaries.push({ name, executed: false, error: String(error), errors, resources })
        await page.screenshot({ path: resolve(out, `${name}-failure.png`) }).catch(() => {})
      } finally { await page.close() }
      await writeFile(resolve(out, 'summary.json'), JSON.stringify(summaries, null, 2))
      console.log(JSON.stringify(summaries.at(-1)))
    }
  }
} finally { await browser.close() }
if (summaries.some(s => !s.executed)) process.exitCode = 1
