const targetUrl = 'http://localhost:5173/ocean.html'
const port = 9222
const waitMs = 8000

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
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      console.log('EXCEPTION:', d.text, d.exception?.description || '')
      if (d.stackTrace) {
        for (const f of d.stackTrace.callFrames || []) {
          console.log(`  at ${f.functionName} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
        }
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const args = (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ')
      console.log('CONSOLE ERROR:', args)
    }
  }
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: targetUrl })
  await new Promise(r => setTimeout(r, waitMs))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
