/**
 * deploy-ghpages.mjs
 * 功能：构建 examples + docs，推送到 gh-pages 分支
 *
 * 用法：node actions/deploy-ghpages.mjs
 *
 * 流程：
 *   1. 构建 docs + examples → examples/dist-ghpages/
 *      base 由各 config 内部按 command/mode 判断（不通过环境变量传，见下注释）
 *   2. gh-pages 包将 dist-ghpages 提交到本地 gh-pages 分支
 *   3. fetch 后以 --force-with-lease 推送到 origin/gh-pages
 *      （gh-pages 是纯产物分支，每次部署用当前构建覆盖远程是正确流程；
 *       普通 fast-forward push 会在历史分叉时失败。force-with-lease
 *       比 --force 更安全：若 fetch 后远程又有新提交则拒绝覆盖。）
 *
 * 注意：不要用 DOCS_BASE / VITE_BASE 之类的环境变量传 base，
 *   Windows + Git Bash 的 MSYS2 会把 "/tellux/docs/" 改写成绝对路径。
 */

import { execSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = resolve(__dirname, "..")
const outDir = resolve(projectRoot, "examples/dist-ghpages")

const BRANCH = "gh-pages"

function run(cmd, extraEnv = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  })
}

async function main() {
  // base 通过 DEPLOY_TARGET=ghpages 标志区分部署目标（由各 config 内部判断）。
  // 不直接传带 / 的 base 环境变量：Windows + Git Bash 的 MSYS2 会把
  // "/tellux/docs/" 这种以 / 开头的值改写成 Windows 绝对路径
  // （如 D:/Program Files/Git/tellux/docs/）。DEPLOY_TARGET 不带 /，安全。
  console.log("📦 [1/4] 构建 VitePress 文档...")
  run("npx vitepress build docs", {
    DEPLOY_TARGET: "ghpages",
    DOCS_OUT_DIR: resolve(outDir, "docs"),
  })

  console.log("📦 [2/4] 构建 examples...")
  run(`npx vite build --config examples/vite.config.ts --mode ghpages --outDir ${outDir}`)

  console.log(`🚀 [3/4] 提交产物到本地 ${BRANCH} 分支...`)
  const { publish } = await import("gh-pages")
  await new Promise((resolve, reject) => {
    publish(outDir, {
      branch: BRANCH,
      repo: projectRoot,
      silent: false,
    }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })

  console.log(`🚀 [4/4] 推送到 origin/${BRANCH}...`)
  // gh-pages 是纯静态产物分支：每次部署应用当前构建整分支覆盖远程。
  // 先 fetch 再 --force-with-lease，避免与远程分叉时被拒，同时保留
  // 「远程在 fetch 后又被他人推送」时的保护。
  run(`git fetch origin ${BRANCH}`)
  run(`git push --force-with-lease -u origin ${BRANCH}`)

  console.log("\n🎉 gh-pages 部署完成！")
}

main().catch((err) => {
  console.error("❌ 部署失败:", err)
  process.exit(1)
})
