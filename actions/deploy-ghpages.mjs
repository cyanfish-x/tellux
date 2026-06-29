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
 *   3. 显式 push 到 origin/gh-pages（gh-pages 包默认推送可能静默失败）
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
  // base 通过 vitepress/vite 内置的 command/mode 判断，不走环境变量。
  // 原因：Windows + Git Bash 的 MSYS2 会把 "/tellux/docs/" 这种以 / 开头的
  // 环境变量值改写成 Windows 绝对路径（如 D:/Program Files/Git/tellux/docs/）。
  console.log("📦 [1/4] 构建 VitePress 文档...")
  run("npx vitepress build docs", {
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
  // gh-pages 包默认可能不推送（取决于 push.default / 远程跟踪配置），
  // 这里显式 push，确保远程分支更新。
  run(`git push -u origin ${BRANCH}`)

  console.log("\n🎉 gh-pages 部署完成！")
}

main().catch((err) => {
  console.error("❌ 部署失败:", err)
  process.exit(1)
})
