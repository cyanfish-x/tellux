#!/usr/bin/env node
/**
 * 同时启动 examples / docs 开发服务。
 *
 * 优先占用 5173（examples）与 5174（docs）；若被占用则向后寻找空闲端口，
 * 并通过环境变量把实际 origin 同步给两侧交叉链接，避免 --strictPort 直接失败。
 */

import { createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import concurrently from "concurrently"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")

const EXAMPLES_PREFERRED_PORT = 5173
const DOCS_PREFERRED_PORT = 5174
const PORT_SEARCH_LIMIT = 100

function canListen(port) {
  return new Promise((resolveListen) => {
    const server = createServer()
    server.unref()
    server.once("error", () => resolveListen(false))
    server.once("listening", () => {
      server.close(() => resolveListen(true))
    })
    server.listen(port, "0.0.0.0")
  })
}

async function findFreePort(preferred, occupied = new Set()) {
  for (let port = preferred; port < preferred + PORT_SEARCH_LIMIT; port += 1) {
    if (occupied.has(port)) continue
    if (await canListen(port)) return port
  }
  throw new Error(`No free port found near ${preferred}`)
}

const examplesPort = await findFreePort(EXAMPLES_PREFERRED_PORT)
const docsPort = await findFreePort(
  DOCS_PREFERRED_PORT,
  new Set([examplesPort])
)

const examplesOrigin = `http://127.0.0.1:${examplesPort}`
const docsOrigin = `http://127.0.0.1:${docsPort}`

if (
  examplesPort !== EXAMPLES_PREFERRED_PORT ||
  docsPort !== DOCS_PREFERRED_PORT
) {
  console.log(
    `[dev] preferred ports busy; using examples=${examplesPort}, docs=${docsPort}`
  )
}

const { result } = concurrently(
  [
    {
      name: "examples",
      command: `vite examples --host 0.0.0.0 --port ${examplesPort} --strictPort`,
      prefixColor: "cyan",
      env: {
        ...process.env,
        VITE_TELLUX_DOCS_ORIGIN: docsOrigin,
      },
    },
    {
      name: "docs",
      command: `vitepress dev docs --host 0.0.0.0 --port ${docsPort} --strictPort`,
      prefixColor: "green",
      env: {
        ...process.env,
        TELLUX_EXAMPLES_ORIGIN: examplesOrigin,
      },
    },
  ],
  {
    cwd: projectRoot,
    killOthersOn: ["failure", "success"],
  }
)

try {
  await result
} catch {
  process.exitCode = 1
}
