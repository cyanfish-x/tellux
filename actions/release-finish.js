/**
 * release-finish.js
 * 功能：npm 包已由用户手动 publish 后，推送 commit/tag 并创建 GitHub Release。
 *
 * 用法：node actions/release-finish.js [版本号]
 *       省略版本号时读取 package.json 的 version。
 *
 * 前置：本地已有对应 annotated tag（v<版本>），且 npm 上该版本已发布。
 */
import { execSync, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = resolve(projectRoot, 'package.json')

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd: projectRoot, stdio: 'inherit' })
}

function git(args) {
  console.log(`\n> git ${args.join(' ')}`)
  execFileSync('git', args, { cwd: projectRoot, stdio: 'inherit' })
}

function gitRead(args) {
  return execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function readVersion() {
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version
}

function main() {
  const version = process.argv[2] || readVersion()
  const tag = `v${version}`

  const tagExists = gitRead(['tag', '-l', tag])
  if (!tagExists) {
    console.error(`❌ 本地不存在 annotated tag ${tag}，请先完成 release 准备步骤。`)
    process.exit(1)
  }

  console.log(`📌 收尾版本: ${version}`)

  console.log('\n📤 [1/2] 推送 commit + tag...')
  git(['push', '--follow-tags'])

  console.log('\n🔖 [2/2] 创建 GitHub Release（gh）...')
  try {
    run(`node actions/github-release.js ${version}`)
  } catch {
    console.warn('⚠️  GitHub Release 创建失败（gh 未安装或未登录？）。tag 已推送。')
    console.warn(`   稍后补建：先 gh auth login，再  node actions/github-release.js ${version}`)
  }

  console.log(`\n🎉 已完成 v${version} 收尾（push + GitHub Release）`)
}

main()
