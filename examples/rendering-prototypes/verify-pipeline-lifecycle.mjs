import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/pipeline-lifecycle')
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
 await page.route('**/__pipeline-fixture__.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Pipeline lifecycle</title>'}))
 await page.goto(`${base}/__pipeline-fixture__.html`)
 const report=await page.evaluate(async()=>{const m=await import('/rendering-prototypes/verifyPipelineLifecycle.ts');return m.verifyPipelineLifecycle({sharedMaterial:true})})
 await writeFile(resolve(out,'lifecycle.json'),JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors}))
 if(!report.passed||report.errors?.length||errors.length)process.exitCode=1
}finally{await browser.close()}
