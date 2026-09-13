import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/stage2-query-cost')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[]
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.paused)cb(t)})})
 await page.goto(`${base}/rendering-cloud-transparency.html`)
 await page.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
 await page.waitForFunction(()=>{const u=window.viewer.atmosphere.cloudsEffect.cloudsPass.currentMaterial.uniforms;return ['localWeatherTexture','shapeTexture','shapeDetailTexture','stbnTexture'].every(k=>u[k]?.value)},null,{timeout:90000})
 await page.evaluate(()=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date('2026-03-20T12:00:00Z');v.scene.clouds.speed=0;v.camera.cancelFlight();v.controls.adjustHeight=false})
 await page.waitForTimeout(5000)
 const result=await page.evaluate(async()=>{window.paused=true;const m=await import('/rendering-prototypes/verifyCloudQueryCost.ts');return m.verifyCloudQueryCost(window.viewer)})
 await writeFile(resolve(out,'cost.json'),JSON.stringify({...result,errors},null,2))
 console.log(JSON.stringify({...result,blocks:result.blocks.map(({samples,...b})=>b),errors}))
 if(result.glError||errors.length)process.exitCode=1
}finally{await browser.close()}
