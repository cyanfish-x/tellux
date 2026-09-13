import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/stage2-mixed')
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
 await page.route('**/__pipeline-fixture__.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Mixed transparency fixture</title>'}))
 await page.goto(`${base}/__pipeline-fixture__.html`)
 const report=await page.evaluate(async options=>{const m=await import('/rendering-prototypes/verifyMixedTransparency.ts');return m.verifyMixedTransparency(options)},{depthSplit:process.argv.includes('--depth-split'),traceGL:process.argv.includes('--trace-gl'),depthTexture:process.argv.includes('--depth-texture'),crossing:process.argv.includes('--crossing'),production:process.argv.includes('--production'),implicitEntity:process.argv.includes('--implicit-entity'),shells:process.argv.includes('--shells'),multi:process.argv.includes('--multi'),logDepth:process.argv.includes('--log-depth'),cutout:process.argv.includes('--cutout')})
 for(const row of report.rows){await writeFile(resolve(out,`${row.near}-${row.far}.png`),Buffer.from(row.preview.split(',')[1],'base64'));delete row.preview}
 await writeFile(resolve(out,'mixed.json'),JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,errors}))
 if(report.glError||report.glErrors.length||errors.length||(report.production&&report.rows.some(row=>row.over2)))process.exitCode=1
}finally{await browser.close()}
