/**
 * release.js
 * 功能：统筹发版流程——校验、升版本号、生成 changelog、提交、打 tag、发布、推送
 *
 * 用法：node actions/release.js [patch|minor|major]
 *
 * 流程：
 *   1. pnpm release:check（type-check + build + npm pack --dry-run）
 *   2. npm version <type> --no-git-tag-version（只改 package.json，不 commit/tag）
 *   3. node actions/generate-changelog.js --version <新版本>（写入 CHANGELOG.md）
 *   4. git add package.json CHANGELOG.md → commit → tag v<版本>
 *      （tag 指向的 commit 包含 changelog 改动）
 *   5. npm publish（触发 prepublishOnly 钩子再校验一次）
 *   6. git push --follow-tags
 *
 * 注意：本脚本会真实发布到 npm 并推送 tag，请在主分支且工作区干净时执行。
 */
import { execSync, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = resolve(projectRoot, 'package.json')

const type = process.argv[2] || 'patch'
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('用法: node actions/release.js [patch|minor|major]')
  process.exit(1)
}

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
  const status = gitRead(['status', '--porcelain'])
  if (status) {
    console.error('❌ 工作区不干净，请先提交或 stash 改动：')
    console.error(status)
    process.exit(1)
  }

  const oldVersion = readVersion()
  console.log(`📌 当前版本: ${oldVersion}`)

  console.log('\n🧪 [1/6] release:check（type-check + build + pack dry-run）...')
  run('pnpm release:check')

  console.log('\n🔧 [2/6] 升版本号...')
  run(`npm version ${type} --no-git-tag-version`)
  const newVersion = readVersion()
  console.log(`📌 新版本: ${oldVersion} → ${newVersion}`)

  console.log('\n📝 [3/6] 生成 CHANGELOG...')
  run(`node actions/generate-changelog.js --version ${newVersion}`)

  console.log('\n🏷️ [4/6] 提交版本 + 打 tag...')
  git(['add', 'package.json', 'CHANGELOG.md'])
  git(['commit', '-m', `发布 v${newVersion}`])
  git(['tag', `v${newVersion}`])

  console.log('\n🚀 [5/6] npm publish...')
  run('npm publish')

  console.log('\n📤 [6/6] 推送 commit + tag...')
  git(['push', '--follow-tags'])

  console.log(`\n🎉 已发布 v${newVersion}`)
}

main()
