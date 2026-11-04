import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/stage2-resolved')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[]
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
 await page.addInitScript(()=>{const r=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>r(t=>{if(!window.paused)cb(t)})})
 await page.goto(`${base}/rendering-cloud-transparency.html`)
 await page.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
 await page.waitForFunction(()=>{const u=window.viewer.atmosphere.cloudsEffect.cloudsPass.currentMaterial.uniforms;return ['localWeatherTexture','shapeTexture','shapeDetailTexture','stbnTexture'].every(k=>u[k]?.value)},null,{timeout:90000})
 await page.evaluate(()=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date('2026-03-20T12:00:00Z');v.scene.clouds.speed=0;v.camera.cancelFlight();v.controls.adjustHeight=false;v.controls.enableDamping=false;const c=v.atmosphere.cloudsEffect;c.localWeatherOffset.set(0,0);c.localWeatherVelocity.set(0,0);c.shapeOffset.set(0,0,0);c.shapeDetailOffset.set(0,0,0);c.shapeVelocity.set(0,0,0);c.shapeDetailVelocity.set(0,0,0)})
 await page.waitForTimeout(5000)
 const report=await page.evaluate(async options=>{window.paused=true;const m=await import('/rendering-prototypes/verifyCloudPrefixResolved.ts');return m.verifyCloudPrefixResolved(window.viewer,options)}, {freshProgram:process.argv.includes('--fresh-program'),baselineOnly:process.argv.includes('--baseline-only')})
 for(const item of report.images)await writeFile(resolve(out,`${item.name}.png`),Buffer.from(item.image.split(',')[1],'base64'))
 delete report.images
 await writeFile(resolve(out,'resolved.json'),JSON.stringify({...report,errors},null,2))
 console.log(JSON.stringify({...report,blocks:report.blocks.map(b=>{const s=b.gpu.filter(Number.isFinite).sort((a,b)=>a-b);return{mode:b.mode,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)]}}),errors}))
 if(report.glError||errors.length)process.exitCode=1
}finally{await browser.close()}
