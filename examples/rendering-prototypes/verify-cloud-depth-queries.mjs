// Bounded stage-2 information test; no production cloud shader changes.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176', out=resolve(process.argv[3]??'artifacts/stage2-depth')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({viewport:{width:1100,height:720}}), errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.paused)cb(t)})})
  await page.goto(`${base}/rendering-cloud-transparency.html`)
  await page.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
  await page.evaluate(()=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date('2026-03-20T12:00:00Z');v.scene.clouds.speed=0})
  await page.waitForTimeout(10000)
  await page.screenshot({path:resolve(out,'scene.png')})
  const report=await page.evaluate(async options=>{window.paused=true;window.viewer.useDefaultRenderLoop=false;const m=await import('/rendering-prototypes/verifyCloudDepthQueries.ts');return m.verifyCloudDepthQueries(window.viewer,options)}, {capturePrefix:process.argv.includes('--capture-prefix'),stableUvControl:process.argv.includes('--stable-uv')})
  for(const row of report.observations){await writeFile(resolve(out,`prefix-${row.distance??'all'}.png`),Buffer.from(row.preview.split(',')[1],'base64'));delete row.preview}
  await writeFile(resolve(out,'queries.json'),JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,errors}))
  if(report.glError||errors.length)process.exitCode=1
}finally{await browser.close()}
