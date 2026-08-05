#!/usr/bin/env node
// @ts-check
/**
 * 社区案例展示链接健康检查。
 *
 * 读取 examples/showcase-data.ts 中的 `url` / `cover` 字段（受控单行字符串字面量），
 * 逐个发起 HEAD 请求（部分服务器不支持 HEAD 时回退 GET），输出失效链接并以非 0 码退出，
 * 便于本地维护或接入 CI 定期执行。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(__dirname, "..", "examples", "showcase-data.ts")

if (!fs.existsSync(dataFile)) {
  console.error(`[check-showcase] 找不到数据文件：${dataFile}`)
  process.exit(1)
}

const source = fs.readFileSync(dataFile, "utf8")
const urlPattern = /(?:url|cover)\s*:\s*["'`]([^"'`]+)["'`]/g
const urls = [...new Set([...source.matchAll(urlPattern)].map((match) => match[1]))]

if (urls.length === 0) {
  console.log("[check-showcase] 数据文件中没有 url / cover 链接，跳过。")
  process.exit(0)
}

const REQUEST_TIMEOUT_MS = 10_000
const CONCURRENCY = 4

async function request(url, method) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { method, signal: controller.signal, redirect: "follow" })
  } finally {
    clearTimeout(timer)
  }
}

async function requestWithBrowserHeaders(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // 图床防盗链常校验 Referer 与 UA，带浏览器标识以模拟真实页面访问。
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Referer: "https://tellux.cyanfish.site/",
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

async function checkUrl(url) {
  try {
    const response = await request(url, "HEAD")
    if (response.ok || (response.status >= 300 && response.status < 400)) {
      return { url, ok: true }
    }
    // 部分服务器不支持 HEAD（405/501），回退 GET 仅看状态码。
    if (response.status === 405 || response.status === 501) {
      const getResponse = await request(url, "GET")
      if (getResponse.ok || (getResponse.status >= 300 && getResponse.status < 400)) {
        return { url, ok: true }
      }
      return { url, ok: false, status: getResponse.status }
    }
    // 图床常见的 Referer / UA 防盗链会返回 403：资源存在但拒绝非浏览器请求，
    // 用浏览器标识 GET 确认一次，仍 403 视为受访问控制保护，不算失效。
    if (response.status === 403) {
      const getResponse = await requestWithBrowserHeaders(url)
      if (getResponse.ok || (getResponse.status >= 300 && getResponse.status < 400)) {
        return { url, ok: true }
      }
      if (getResponse.status === 403) {
        return { url, ok: true, protected: true }
      }
      return { url, ok: false, status: getResponse.status }
    }
    return { url, ok: false, status: response.status }
  } catch (error) {
    return {
      url,
      ok: false,
      error: error?.name === "AbortError" ? "timeout" : String(error),
    }
  }
}

const failed = []
const protectedLinks = []
let index = 0
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (index < urls.length) {
    const url = urls[index++]
    const result = await checkUrl(url)
    if (result.ok && result.protected) protectedLinks.push(url)
    else if (!result.ok) failed.push(result)
  }
})
await Promise.all(workers)

for (const url of protectedLinks) {
  console.warn(
    `[check-showcase] 受访问控制保护的链接（HTTP 403，假定可访问）：${url}`
  )
}

for (const failure of failed) {
  console.error(
    `[check-showcase] 失效链接：${failure.url}（${failure.status ?? failure.error}）`
  )
}

if (failed.length > 0) {
  console.error(`[check-showcase] 共 ${failed.length} 个失效链接。`)
  process.exit(1)
}

console.log(`[check-showcase] 全部 ${urls.length} 个链接正常。`)
