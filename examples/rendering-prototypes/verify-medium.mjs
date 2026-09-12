// Run against an already running example server. Does not launch a server or change dependencies.
// Usage: node examples/rendering-prototypes/verify-medium.mjs http://localhost:5173 G:/Cache/Temp/a1
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const directory = resolve(process.argv[3] ?? 'artifacts/a1-medium')
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const keys = ['steps64', 'steps128', 'segmented64', 'segmented128', 'segmented512', 'reference1024', 'reference4096', 'cloudStep10', 'cloudStep5', 'cloudStep2', 'candidate', 'airFirst', 'cloudFirst']
function assertReport(report) {
  const rows = report.validation?.realMedium?.rows ?? []
  if (report.shaderError || !report.validation?.analytic?.passed || rows.length !== 2 ||
      !rows.every(row => keys.every(key => row[key]?.nonFinite === 0 && Number.isFinite(row[key]?.max)))) {
    throw new Error('GPU execution or numerical sanity check failed')
  }
  const composition = report.validation.cloudComposition
  if (!composition || Object.values(composition).some(row => row.nonFinite || row.referenceEnergy <= 0) || composition.centroid.alphaFromOptimized > 1e-6) {
    throw new Error('Cloud composition reference invalid or centroid changed opacity')
  }
  for (const name of ['sampleOptimization', 'parameterFallback']) {
    if (!composition[name] || composition[name].max > 1e-4 || composition[name].alphaMax > 1e-4 || composition[name].p95 > 1e-6) throw new Error(`Sampling equivalence regression: ${name}`)
  }
  // Regression limits for this fixed fixture, not a declaration of physical accuracy.
  if (rows.some(row => row.candidate.max > (row.output === 'T' ? 0.02 : 0.005))) {
    throw new Error('Fixed-scene joint integration sampling regression')
  }
}
async function captureTimings(surface, segmented) {
  await surface.locator('#a1-segmented').setChecked(segmented)
  await surface.locator('#a1-cloud-step').selectOption(segmented ? '5' : '0')
  await surface.waitForFunction(segmented => window.mediumIntegration.report().gpuSamples.filter(s => s.cloudStep === (segmented ? 5 : 0) && s.segmented === segmented && s.steps === 64 && s.mode === 'joint').length >= 30, segmented, { timeout: 60000 })
  const report = await surface.evaluate(() => window.mediumIntegration.report())
  const samples = report.gpuSamples.filter(s => s.cloudStep === (segmented ? 5 : 0) && s.segmented === segmented && s.steps === 64 && s.mode === 'joint').slice(-30)
  const sorted = samples.map(s => s.ms).sort((a, b) => a - b)
  return { segmented, samples, p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1), scope: 'Extra integration draw only; includes warmup, not full-frame cost' }
}
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGL|A1/.test(message.text())) errors.push(message.text())
  })
  await page.goto(`${base}/rendering-medium-integration.html`)
  await page.waitForFunction(() => window.mediumIntegration?.report().ready || window.mediumIntegration?.report().shaderError, undefined, { timeout: 60000 })
  const initial = await page.evaluate(() => window.mediumIntegration.report())
  if (initial.shaderError) throw new Error(initial.shaderError)
  await page.evaluate(() => window.mediumIntegration.verify())
  const uniformTiming = await captureTimings(page, false)
  const report = await page.evaluate(() => window.mediumIntegration.report())
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2))
  await page.screenshot({ path: resolve(directory, 'joint.png') })
  const segmentedTiming = await captureTimings(page, true)
  await writeFile(resolve(directory, 'timings.json'), JSON.stringify([uniformTiming, segmentedTiming], null, 2))
  await page.screenshot({ path: resolve(directory, 'joint-segmented.png') })
  await page.selectOption('#a1-mode', 'air-first')
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(directory, 'air-first.png') })
  await page.selectOption('#a1-mode', 'integrated')
  const settleFrame = await page.evaluate(() => window.mediumIntegration.report().frame)
  await page.waitForFunction(start => window.mediumIntegration.report().frame >= start + 100, settleFrame, { timeout: 60000 })
  if (!await page.locator('#a1-air').isDisabled()) throw new Error('Reference-only controls remain enabled')
  await page.screenshot({ path: resolve(directory, 'centroid.png') })
  // Check the actual Sandcastle binding, not just the standalone page.
  await page.goto(`${base}/sandcastle.html?example=rendering-medium-integration`)
  let frame
  for (let i = 0; i < 30; i++) {
    frame = page.frames().find(frame => frame.url().includes('/sandcastle/runner.html'))
    if (frame && await frame.evaluate(() => !!window.mediumIntegration?.report().ready).catch(() => false)) break
    await page.waitForTimeout(1000)
  }
  const sandcastleReady = !!frame && await frame.evaluate(() => !!window.mediumIntegration?.report().ready)
  if (!sandcastleReady) throw new Error('Sandcastle medium binding did not become ready')
  await frame.locator('#a1-segmented').check()
  await frame.evaluate(() => window.mediumIntegration.verify())
  const sandcastleReport = await frame.evaluate(() => window.mediumIntegration.report())
  await writeFile(resolve(directory, 'sandcastle-report.json'), JSON.stringify(sandcastleReport, null, 2))
  await page.screenshot({ path: resolve(directory, 'sandcastle-segmented.png') })
  await frame.locator('#a1-mode').selectOption('integrated')
  const iframeSettle = await frame.evaluate(() => window.mediumIntegration.report().frame)
  await frame.waitForFunction(start => window.mediumIntegration.report().frame >= start + 100, iframeSettle, { timeout: 60000 })
  if (!await frame.locator('#a1-air').isDisabled()) throw new Error('Sandcastle reference controls remain enabled')
  await page.screenshot({ path: resolve(directory, 'sandcastle-centroid.png') })
  assertReport(report); assertReport(sandcastleReport)
  if (!sandcastleReport.segmented || errors.length) throw new Error(`GPU verification failed: ${JSON.stringify(errors)}`)
  const summary = { analyticPassed: true, realMediumFinite: true, sandcastleReady, sandcastleValidated: true, errors, centroidOpacityPreserved: true, fixedSceneSamplingRegressionPassed: true, scope: 'Execution and fixed-fixture numerical regression; no full-pipeline quality or performance acceptance', directory }
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally { await browser.close() }
