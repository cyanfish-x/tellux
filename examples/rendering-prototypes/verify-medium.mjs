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
  await page.waitForTimeout(5000)
  const report = await page.evaluate(() => window.mediumIntegration.report())
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2))
  await page.screenshot({ path: resolve(directory, 'joint.png') })
  await page.selectOption('#a1-mode', 'air-first')
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(directory, 'air-first.png') })
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
  const rows = report.validation?.realMedium?.rows ?? []
  const finite = rows.length === 2 && rows.every(row => ['steps64', 'steps128', 'airFirst', 'cloudFirst'].every(key => row[key].nonFinite === 0))
  if (!report.validation?.analytic?.passed || !finite || errors.length) throw new Error(`GPU verification failed: ${JSON.stringify(errors)}`)
  const summary = { analyticPassed: true, realMediumFinite: true, sandcastleReady, errors, scope: 'Execution and numerical sanity only; no physical-quality acceptance', directory }
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally { await browser.close() }
