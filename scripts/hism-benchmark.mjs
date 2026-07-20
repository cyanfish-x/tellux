#!/usr/bin/env node
/**
 * HISM vs Legacy 自动化基准（依赖 hism-compare 页面）。
 *
 * 前置：pnpm dev 已启动
 *
 * 用法：
 *   pnpm benchmark:hism
 *   pnpm benchmark:hism -- --counts 5000,10000 --modes legacy,hism
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const baseUrl =
  process.env.BENCHMARK_URL ?? "http://127.0.0.1:5173/hism-compare.html"

function parseList(argv, flag, fallback) {
  const index = argv.indexOf(flag)
  if (index === -1 || !argv[index + 1]) return fallback
  return argv[index + 1].split(",").map((value) => value.trim()).filter(Boolean)
}

function parseCounts(argv) {
  return parseList(argv, "--counts", ["5000", "10000", "20000", "50000"]).map(
    (value) => Number(value)
  ).filter((value) => Number.isFinite(value) && value > 0)
}

function parseModes(argv) {
  const modes = parseList(argv, "--modes", ["legacy", "hism"])
  return modes.filter((mode) => mode === "legacy" || mode === "hism")
}

function escapeCsv(value) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function ensureServerReachable() {
  const response = await fetch(baseUrl.split("?")[0], { method: "HEAD" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

async function runCase(page, treeCount, mode) {
  const timeoutMs = treeCount >= 20000 ? 900_000 : 300_000
  const url = `${baseUrl.split("?")[0]}?autorun=1&trees=${treeCount}&mode=${mode}`
  console.log(`\n▶ ${mode} · ${treeCount.toLocaleString()} trees`)

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(
    () => document.body.dataset.compareReady === "true",
    undefined,
    { timeout: timeoutMs }
  )

  const snapshot = await page.evaluate(() => window.__hismCompareSnapshot ?? null)
  if (!snapshot) throw new Error("missing snapshot")
  console.log(
    `  ✓ FPS ${snapshot.fpsAvg.toFixed(1)} · Visible ${snapshot.visiblePercent.toFixed(1)}% · Draw ${snapshot.drawCalls} · Load ${(snapshot.totalLoadMs / 1000).toFixed(1)}s`
  )
  return { ...snapshot, mode, error: "" }
}

async function main() {
  const argv = process.argv.slice(2)
  const counts = parseCounts(argv)
  const modes = parseModes(argv)
  if (counts.length === 0 || modes.length === 0) {
    throw new Error("无效的 --counts 或 --modes")
  }

  await ensureServerReachable()

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 720 })

  const results = []
  for (const treeCount of counts) {
    for (const mode of modes) {
      try {
        results.push(await runCase(page, treeCount, mode))
      } catch (error) {
        console.log(`  ✗ ${error instanceof Error ? error.message : error}`)
        results.push({
          mode,
          requestedCount: treeCount,
          actualCount: 0,
          placementMs: 0,
          samplingMs: 0,
          buildMs: 0,
          totalLoadMs: 0,
          fpsAvg: 0,
          drawCalls: 0,
          visibleInstances: 0,
          totalInstances: 0,
          visiblePercent: 0,
          clusterSummary: "-",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  await browser.close()

  const header = [
    "mode",
    "treeCount",
    "actualCount",
    "loadMs",
    "buildMs",
    "fpsAvg",
    "drawCalls",
    "visiblePercent",
    "visibleInstances",
    "totalInstances",
    "clusterSummary",
    "error",
    "timestamp",
  ].join(",")

  const csv =
    [
      header,
      ...results.map((row) =>
        [
          row.mode,
          row.requestedCount ?? row.treeCount,
          row.actualCount,
          row.totalLoadMs?.toFixed(0) ?? row.loadMs,
          row.buildMs?.toFixed(0) ?? "",
          row.fpsAvg?.toFixed(2),
          row.drawCalls,
          row.visiblePercent?.toFixed(2),
          row.visibleInstances,
          row.totalInstances,
          row.clusterSummary ?? "-",
          row.error ?? "",
          row.timestamp,
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ].join("\n") + "\n"

  const outputDir = resolve(projectRoot, "benchmark-results")
  await mkdir(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputPath = resolve(outputDir, `hism-compare-${stamp}.csv`)
  await writeFile(outputPath, csv, "utf8")
  console.log(`\nCSV 已写入 ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
