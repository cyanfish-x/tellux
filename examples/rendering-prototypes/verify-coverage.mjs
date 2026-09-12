import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://localhost:5173',directory=resolve(process.argv[3]??'artifacts/a3-coverage')
await mkdir(directory,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[]
try{
 for(const dpr of [1,2]){
  const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:dpr}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  for(const sandbox of [false,true]){
   await page.goto(`${base}/${sandbox?'sandcastle.html?example=rendering-medium-coverage':'rendering-medium-coverage.html'}`)
   let surface=page
   if(sandbox){for(let i=0;i<60;i++){surface=page.frames().find(f=>f.url().includes('/sandcastle/runner.html'));if(surface)break;await page.waitForTimeout(250)}}
   await surface.waitForFunction(()=>window.mediumCoverage?.report().ready||window.mediumCoverage?.report().shaderError,undefined,{timeout:60000})
   for(const scale of ['4','2'])for(const size of [[256,144],[255,143]]){
    await surface.locator('#a3-scale').selectOption(scale)
    const validation=await surface.evaluate(size=>window.mediumCoverage.verify(...size),size),report=await surface.evaluate(()=>window.mediumCoverage.report())
    rows.push({dpr,sandbox,scale:Number(scale),size,report});await writeFile(resolve(directory,'report.json'),JSON.stringify(rows,null,2))
    if(!validation.passed||report.shaderError||errors.length)throw Error(JSON.stringify({validation,errors}))
    console.log({dpr,sandbox,scale,size,passed:validation.passed,conservativeMax:Math.max(...validation.rows.map(row=>row.conservative.max))})
   }
   await surface.locator('#a3-case').selectOption('3')
   const displayChecks=[]
   for(const mode of ['1','4','5']){
    await surface.locator('#a3-mode').selectOption(mode)
    await surface.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const png=await surface.locator('#viewer canvas').screenshot()
    const difference=await surface.evaluate(async({png,mode})=>{
     const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'}))
     const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height
     const context=canvas.getContext('2d');context.drawImage(bitmap,0,0)
     const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;bitmap.close()
     if(mode==='1'){window.__a3DisplayReference=pixels;return 0}
     let maximum=0
     for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width*.45;x++)for(let c=0;c<3;c++){
      const i=(y*canvas.width+x)*4+c;maximum=Math.max(maximum,Math.abs(pixels[i]-window.__a3DisplayReference[i]))
     }
     return maximum
    },{png:png.toString('base64'),mode})
    displayChecks.push({mode,maxByteDifference:difference})
   }
   if(displayChecks[1].maxByteDifference>2 || displayChecks[2].maxByteDifference<10)throw Error(`Canvas presentation regression: ${JSON.stringify(displayChecks)}`)
   await writeFile(resolve(directory,`display-${dpr}-${sandbox}.json`),JSON.stringify(displayChecks,null,2))
   await surface.locator('#a3-mode').selectOption('5')
   await page.screenshot({path:resolve(directory,`bad-history-${dpr}-${sandbox}.png`)})
   await surface.locator('#a3-mode').selectOption('4')
   await page.screenshot({path:resolve(directory,`valid-history-${dpr}-${sandbox}.png`)})
   await page.setViewportSize({width:777,height:513})
   await surface.waitForFunction(()=>window.mediumCoverage.report().framebuffer.every((v,i)=>Math.abs(v-[document.querySelector('#viewer').clientWidth*devicePixelRatio,document.querySelector('#viewer').clientHeight*devicePixelRatio][i])<=1),undefined,{timeout:10000})
   const size=await surface.evaluate(()=>({report:window.mediumCoverage.report(),expected:[document.querySelector('#viewer').clientWidth*devicePixelRatio,document.querySelector('#viewer').clientHeight*devicePixelRatio]}))
   if(size.report.framebuffer.some((v,i)=>Math.abs(v-size.expected[i])>1))throw Error('DPR/resize dimensions mismatch')
  }
  await page.close()
 }
 await writeFile(resolve(directory,'verification.json'),JSON.stringify({passed:true,entries:rows.length,scope:'Synthetic medium validity, DPR and resize; no real-cloud acceptance'},null,2))
}finally{await browser.close()}
