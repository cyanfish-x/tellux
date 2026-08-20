const targetUrl = process.env.TARGET_URL || 'http://localhost:5173/ocean.html'
const port = 9222
const waitMs = Number(process.env.WAIT_MS || 15000)

async function main() {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' })
  const target = await res.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const logs = []

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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ')
      logs.push({ type: msg.params.type, text: args, ts: Date.now() })
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      logs.push({ type: 'exception', text: d.text + ' ' + (d.exception?.description || ''), ts: Date.now() })
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry
      logs.push({ type: e.level, text: e.text + ' ' + (e.url || ''), ts: Date.now() })
    }
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: targetUrl })

  await new Promise(r => setTimeout(r, waitMs))

  const result = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
  console.log('TITLE:', result.result?.value)
  for (const log of logs) {
    console.log(`[${log.type}] ${log.text}`)
  }
  ws.close()
}

main().catch(e => { console.error(e); process.exit(1) })
