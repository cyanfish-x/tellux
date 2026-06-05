/**
 * deploy.js
 * 功能：使用 rclone 增量同步本地构建产物到服务器 -> 刷新 CDN
 *
 * 依赖：
 * - 本机需要可执行 rclone
 * - 先通过 rclone config 创建固定 remote，再在 .env 中配置 RCLONE_REMOTE
 */

import fs from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

const dotenv = require("dotenv")
const tencentcloud = require("tencentcloud-sdk-nodejs-cdn")

dotenv.config({ path: path.resolve(__dirname, ".env") })

const CONFIG = {
  // 本地需要同步的目录
  localDir: process.env.LOCAL_DIR,
  // 远程部署路径
  remoteDir: process.env.REMOTE_DIR,
  rclone: {
    remote: process.env.RCLONE_REMOTE,
    transfers: process.env.RCLONE_TRANSFERS || "8",
    checkers: process.env.RCLONE_CHECKERS || "16",
  },
  // CDN 配置
  cdn: {
    secretId: process.env.CDN_SECRET_ID,
    secretKey: process.env.CDN_SECRET_KEY,
    flushPaths: parseCdnFlushPaths(process.env.CDN_FLUSH_PATHS),
  },
}

function parseCdnFlushPaths(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function assertConfig() {
  const requiredFields = [
    ["LOCAL_DIR", CONFIG.localDir],
    ["REMOTE_DIR", CONFIG.remoteDir],
    ["RCLONE_REMOTE", CONFIG.rclone.remote],
  ]

  const missingFields = requiredFields
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missingFields.length > 0) {
    throw new Error(`缺少必要环境变量: ${missingFields.join(", ")}`)
  }

  if (!fs.existsSync(CONFIG.localDir)) {
    throw new Error(`本地同步目录不存在: ${CONFIG.localDir}`)
  }

  assertCommandAvailable("rclone", "未找到 rclone，请先安装 rclone 并确认它已加入 PATH")
  assertRcloneRemoteExists(CONFIG.rclone.remote)
}

function assertCommandAvailable(command, message) {
  const result = spawnSync(command, ["version"], {
    stdio: "ignore",
    shell: false,
  })

  if (result.error || result.status !== 0) {
    throw new Error(message)
  }
}

function assertRcloneRemoteExists(remote) {
  const remoteName = normalizeRcloneRemoteName(remote)
  const result = spawnSync("rclone", ["listremotes"], {
    encoding: "utf8",
    shell: false,
  })

  if (result.error || result.status !== 0) {
    throw new Error("无法读取 rclone remote 列表，请先确认 rclone config 可用")
  }

  const remotes = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/:$/, ""))
    .filter(Boolean)

  if (!remotes.includes(remoteName)) {
    throw new Error(`rclone remote 不存在: ${remoteName}，请先执行 rclone config 创建它`)
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} 执行失败，退出码: ${code}`))
    })
  })
}

function normalizeRcloneRemoteName(remote) {
  return String(remote).trim().replace(/:$/, "")
}

function createRemoteTarget() {
  return `${normalizeRcloneRemoteName(CONFIG.rclone.remote)}:${CONFIG.remoteDir}`
}

async function ensureRemoteDir() {
  console.log(`🔌 正在确认远程目录 ${CONFIG.remoteDir}...`)
  await runCommand("rclone", [
    "mkdir",
    createRemoteTarget(),
  ])
  console.log("✅ 远程目录已就绪")
}

async function syncFilesByRclone() {
  const localSource = path.resolve(CONFIG.localDir)
  const remoteTarget = createRemoteTarget()

  console.log(`🚀 正在增量同步 ${localSource} -> ${remoteTarget}`)
  await runCommand("rclone", [
    "sync",
    localSource,
    remoteTarget,
    "--exclude=.user.ini",
    "--progress",
    "--transfers",
    CONFIG.rclone.transfers,
    "--checkers",
    CONFIG.rclone.checkers,
    "--fast-list",
  ])
  console.log("✅ rclone 增量同步完成")
}

// 刷新 CDN 缓存
async function refreshCDN() {
  if (!CONFIG.cdn.secretId || !CONFIG.cdn.secretKey) {
    console.warn("⚠️ 未配置 CDN_SECRET_ID 或 CDN_SECRET_KEY，跳过 CDN 刷新")
    return
  }

  if (CONFIG.cdn.flushPaths.length === 0) {
    console.warn("⚠️ 未配置 CDN_FLUSH_PATHS，跳过 CDN 刷新")
    return
  }

  console.log("🔄 正在刷新 CDN 缓存...")

  const CdnClient = tencentcloud.cdn.v20180606.Client

  const clientConfig = {
    credential: {
      secretId: CONFIG.cdn.secretId,
      secretKey: CONFIG.cdn.secretKey,
    },
    region: "ap-chengdu",
    profile: {
      httpProfile: {
        endpoint: "cdn.tencentcloudapi.com",
      },
    },
  }

  const client = new CdnClient(clientConfig)
  const params = {
    Paths: CONFIG.cdn.flushPaths,
    FlushType: "flush",
  }

  try {
    const data = await client.PurgePathCache(params)
    console.log("✅ CDN 刷新请求提交成功:", data)
  } catch (err) {
    console.error("❌ CDN 刷新失败", err)
  }
}

// --- 主执行流程 ---
async function main() {
  try {
    assertConfig()
    await ensureRemoteDir()
    await syncFilesByRclone()
    await refreshCDN()
    console.log("🎉 部署全流程结束！")
  } catch (error) {
    console.error("❌ 部署过程中止:", error)
    process.exitCode = 1
  }
}

main()
