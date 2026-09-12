// Usage: node examples/rendering-prototypes/benchmark-medium.mjs <server> <output-directory>
// ABBA/BAAB blocks, fixed warmup and unique frame IDs; keep all measured samples.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:5173'
const scenario = process.argv[4] ?? 'noon'
const uncapped = process.argv.includes('--uncapped')
const warmupFrames = uncapped ? 256 : 100, sampleCount = uncapped ? 128 : 60
const fixtures = { noon: {hour:12,height:2500,pitch:5,distance:5000}, sunset: {hour:18,height:2500,pitch:5,distance:5000}, night: {hour:0,height:2500,pitch:5,distance:5000}, above: {hour:12,height:0,pitch:-60,distance:7000} }
if (!fixtures[scenario]) throw Error(`Unknown scenario: ${scenario}`)
const directory = resolve(process.argv[3] ?? 'artifacts/a1-performance')
await mkdir(directory, { recursive: true })
const browser=await chromium.launch({channel:'chrome',headless:true,args:uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]})
try {
 const page=await browser.newPage({viewport:{width:1100,height:720}})
 const errors=[];page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(`${base}/rendering-medium-integration.html`)
 await page.waitForFunction(()=>window.mediumIntegration?.report().ready||window.mediumIntegration?.report().shaderError,undefined,{timeout:60000})
 await page.evaluate(test=>{
  window.viewer.clock.currentTime=new Date(`2026-03-20T${String(test.hour).padStart(2,'0')}:00:00Z`)
  window.viewer.flyToTarget({longitude:0,latitude:0,height:test.height},{offset:{heading:0,pitch:test.pitch,distance:test.distance},duration:0})
 },fixtures[scenario])
 const rows=[]
 for(const mode of ['upstream','integrated','integrated','upstream','integrated','upstream','upstream','integrated']){
  await page.selectOption('#a1-mode',mode)
  const start=await page.evaluate(()=>window.mediumIntegration.report().frame)
  await page.waitForFunction(({mode,start,warmupFrames,sampleCount})=>window.mediumIntegration.hasFrameSamples(mode,start+warmupFrames,sampleCount),{mode,start,warmupFrames,sampleCount},{timeout:60000})
  const report=await page.evaluate(()=>window.mediumIntegration.report())
  if(report.shaderError||errors.length)throw Error(JSON.stringify({shader:report.shaderError,errors}))
  const samples=report.frameGpuSamples.filter(s=>s.mode===mode&&s.frame>start+warmupFrames).slice(0,sampleCount)
  const values=samples.map(s=>s.ms).sort((a,b)=>a-b)
  const cpu=samples.map(s=>s.cpuMs).sort((a,b)=>a-b)
  const row={mode,physicalState:report.physicalState,clock:report.clock,p50:values[Math.floor(sampleCount*.5)],p95:values[Math.floor(sampleCount*.95)],cpuP50:cpu[Math.floor(sampleCount*.5)],cpuP95:cpu[Math.floor(sampleCount*.95)],samples};rows.push(row)
  if (rows.length > 1 && JSON.stringify(row.physicalState) !== JSON.stringify(rows[0].physicalState)) throw Error('Physical scene changed during paired benchmark')
  console.log(mode,row.p50,row.p95)
  await writeFile(resolve(directory, `performance-${scenario}.json`),JSON.stringify({scenario,fixture:fixtures[scenario],rows,environment:report.environment,framebuffer:report.framebuffer,camera:report.camera,projection:report.projection,warmupFrames,samplesPerBlock:sampleCount,uncapped},null,2))
 }
}finally{await browser.close()}
