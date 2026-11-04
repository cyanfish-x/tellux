// Visual horizon/cutout fixture. Freeze loaded tile selection while relocating it
// so screenshots cover the same loaded content, independently of asynchronous LOD changes.
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/pipeline-horizon')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[]
try {
  for(const hosted of [false,true]) {
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[],resources=[]
    page.on('pageerror',e=>errors.push(String(e)))
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))resources.push({url:r.url().split('?')[0],status:r.status()})})
    await page.addInitScript(()=>{
      const native=requestAnimationFrame.bind(window)
      window.horizonFrame=()=>new Promise(native)
      window.requestAnimationFrame=callback=>native(time=>{if(!window.horizonPaused)callback(time)})
    })
    await page.goto(hosted?`${base}/sandcastle.html?example=gaussian-splat-3d-tiles`:`${base}/gaussian-splat-3d-tiles.html`)
    let frame=page.mainFrame()
    if(hosted){await page.waitForSelector('iframe[src*="runner.html"]');frame=await(await page.$('iframe[src*="runner.html"]')).contentFrame()}
    await frame.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture&&!window.viewer.camera.isFlying&&/可见瓦片：[1-9]\d*/.test(document.body.innerText),null,{timeout:90000})
    await page.waitForTimeout(12000)
    const result=await frame.evaluate(async()=>{
      window.horizonPaused=true
      const v=window.viewer
      v.useDefaultRenderLoop=false
      v.clock.shouldAnimate=false
      v.clock.currentTime=new Date('2026-09-12T02:00:00Z')
      v.scene.clouds.show=false
      const {installHorizonFixture}=await import('/rendering-prototypes/installMixedTransparencyFixture.ts')
      const fixture=installHorizonFixture(v)
      for(let i=0;i<240;i++){await window.horizonFrame();v.render(performance.now())}
      let visibleSplats=0
      v.scene.raw.traverseVisible(o=>{if(o.userData.gaussianSplat)visibleSplats++})
      let bounds
      const sparks=[]
      v.scene.raw.traverseVisible(o=>{
        if(o.userData.gaussianSplat&&o.getBoundingBox){const box=o.getBoundingBox().clone().applyMatrix4(o.matrixWorld);if(bounds)bounds.union(box);else bounds=box}
        if(o.activeSplats!==undefined)sparks.push({active:o.activeSplats,origin:o.display?.viewOrigin?.toArray()})
      })
      return {fixture,visibleSplats,projectedCenter:bounds.getCenter(v.camera.raw.position.clone()).project(v.camera.raw).toArray(),sparks,camera:v.camera.getState(),glError:v.renderer.raw.getContext().getError()}
    })
    await page.screenshot({path:resolve(out,`${hosted?'sandcastle':'standalone'}.png`)})
    report.push({hosted,...result,errors,resources})
    console.log(JSON.stringify(report.at(-1)))
    await page.close()
  }
  await writeFile(resolve(out,'horizon.json'),JSON.stringify(report,null,2))
}finally{await browser.close()}
if(report.some(r=>r.errors.length||r.resources.length||r.glError||!r.visibleSplats
  ||r.projectedCenter.slice(0,2).some(value=>!Number.isFinite(value)||Math.abs(value)>0.01)))process.exitCode=1
