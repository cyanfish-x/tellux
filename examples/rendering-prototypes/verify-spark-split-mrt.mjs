import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/stage2-spark-mrt')
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[]
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if((m.type()==='error'||/GL_INVALID|WebGL:|Framebuffer/.test(m.text()))&&!m.text().includes('404'))errors.push(m.text())})
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.paused)cb(t)})})
 await page.goto(`${base}/gaussian-splat-3d-tiles.html`)
 await page.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture&&!window.viewer.camera.isFlying&&/可见瓦片：[1-9]\d*|Visible tiles: [1-9]\d*/.test(document.body.innerText),null,{timeout:90000})
 await page.evaluate(()=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date('2026-09-12T02:00:00Z');v.scene.clouds.show=false;v.controls.adjustHeight=false})
 await page.waitForTimeout(7000)
 const report=await page.evaluate(async()=>{window.paused=true;const m=await import('/rendering-prototypes/verifySparkSplitMrt.ts');return m.verifySparkSplitMrt(window.viewer)})
 await writeFile(resolve(out,'mrt.json'),JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,blocks:report.blocks.map(({samples,...b})=>b),errors}))
 await page.screenshot({path:resolve(out,'scene.png')})
 if(report.glError||report.glErrors.length||errors.length)process.exitCode=1
}finally{await browser.close()}
