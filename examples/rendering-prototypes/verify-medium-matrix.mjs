// Usage: node examples/rendering-prototypes/verify-medium-matrix.mjs <server> <output-directory>
// Fixed-fixture regressions do not establish full-pipeline acceptance.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:5173'
const directory = resolve(process.argv[3] ?? 'artifacts/a1-matrix')
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
  page.on('pageerror', e => console.log(String(e)))
  await page.goto(`${base}/rendering-medium-integration.html`)
  await page.waitForFunction(() => window.mediumIntegration?.report().ready || window.mediumIntegration?.report().shaderError, undefined, { timeout: 60000 })
  const initial = await page.evaluate(() => window.mediumIntegration.report())
  if (initial.shaderError) throw Error(initial.shaderError)
  const results = []
  for (const test of [
    { name: 'noon', hour: 12, height: 2500, pitch: 5, air: true, cloud: true },
    { name: 'sunset', hour: 18, height: 2500, pitch: 5, air: true, cloud: true },
    { name: 'night', hour: 0, height: 2500, pitch: 5, air: true, cloud: true },
    { name: 'above', hour: 12, height: 0, pitch: -60, distance: 7000, air: true, cloud: true },
    { name: 'cloud-only', hour: 12, height: 2500, pitch: 5, air: false, cloud: true },
    { name: 'air-only', hour: 12, height: 2500, pitch: 5, air: true, cloud: false },
  ]) {
    await page.evaluate(test => {
      window.viewer.clock.currentTime = new Date(`2026-03-20T${String(test.hour).padStart(2, '0')}:00:00Z`)
      window.viewer.flyToTarget({ longitude: 0, latitude: 0, height: test.height }, { offset: { heading: 0, pitch: test.pitch, distance: test.distance ?? 5000 }, duration: 0 })
    }, test)
    await page.locator('#a1-air').setChecked(test.air)
    await page.locator('#a1-cloud').setChecked(test.cloud)
    await page.waitForTimeout(1000)
    await page.evaluate(() => window.mediumIntegration.verify())
    const report = await page.evaluate(() => window.mediumIntegration.report())
    results.push({ test, report })
    await page.screenshot({ path: resolve(directory, `${test.name}.png`) })
    await writeFile(resolve(directory, 'matrix.json'), JSON.stringify(results, null, 2))
    if (report.shaderError || !report.validation.analytic.passed || report.validation.cloudComposition.centroid.alphaFromOptimized > 1e-6 || report.validation.realMedium.rows.some(row => row.candidate.nonFinite || row.candidate.max > (row.output === 'T' ? 0.02 : 0.005))) throw Error(`Fixed-fixture regression: ${test.name}`)
    for (const name of ['sampleOptimization', 'parameterFallback']) {
      const row = report.validation.cloudComposition[name]
      if (!row || row.nonFinite || row.max > 1e-4 || row.alphaMax > 1e-4 || row.p95 > 1e-6) throw Error(`Sampling equivalence regression: ${test.name}/${name}`)
    }
    await page.selectOption('#a1-mode', 'integrated')
    const settle = await page.evaluate(() => window.mediumIntegration.report().frame)
    await page.waitForFunction(start => window.mediumIntegration.report().frame >= start + 100, settle, { timeout: 60000 })
    await page.screenshot({ path: resolve(directory, `${test.name}-centroid.png`) })
    await page.selectOption('#a1-mode', 'joint')
    console.log(test.name, report.validation.realMedium.rows.map(row => [row.output, row.candidate.max, row.reference4096.max]))
  }
} finally { await browser.close() }

