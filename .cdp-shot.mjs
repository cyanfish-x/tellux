const targetUrl = 'http://localhost:5173/ocean.html'
const port = 9222
const waitMs = 8000
const outFile = process.env.OUT || '.ocean-shot.png'
async function main() {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' })
  const target = await res.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = ++id
      pending.set(msgId, { resolve, reject })
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  }
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  }
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: targetUrl })
  await new Promise(r => setTimeout(r, waitMs))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'))
  console.log('saved', outFile)
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
