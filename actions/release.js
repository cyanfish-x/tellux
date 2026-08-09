/**
 * release.js
 * 功能：发版准备——校验、升版本号、生成 changelog、提交、打 annotated tag。
 *       npm publish 需要浏览器 2FA，由用户本机手动执行；push / GitHub Release 见 release-finish.js。
 *
 * 用法：node actions/release.js [patch|minor|major]
 *
 * 流程：
 *   1. pnpm release:check（type-check + build + pnpm pack --dry-run）
 *   2. npm version <type> --no-git-tag-version（只改 package.json，不 commit/tag）
 *   3. node actions/generate-changelog.js --version <新版本>（写入 CHANGELOG.md）
 *   4. git add package.json CHANGELOG.md → commit → 打 annotated tag v<版本>
 *      （annotated tag 才会被 git push --follow-tags 推送；tag 指向含 changelog 的 commit）
 *   5. 打印用户手动 publish 命令后退出（不自动 publish / push）
 *
 * 用户本机完成后：
 *   pnpm publish --no-git-checks --registry https://registry.npmjs.org/
 *   node actions/release-finish.js <新版本>
 *
 * 注意：请在工作区干净时执行；本脚本不会发布到 npm。
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

  console.log('\n🧪 [1/4] release:check（type-check + build + pack dry-run）...')
  run('pnpm release:check')

  console.log('\n🔧 [2/4] 升版本号...')
  run(`npm version ${type} --no-git-tag-version`)
  const newVersion = readVersion()
  console.log(`📌 新版本: ${oldVersion} → ${newVersion}`)

  console.log('\n📝 [3/4] 生成 CHANGELOG...')
  run(`node actions/generate-changelog.js --version ${newVersion}`)

  console.log('\n🏷️ [4/4] 提交版本 + 打 annotated tag...')
  git(['add', 'package.json', 'CHANGELOG.md'])
  git(['commit', '-m', `chore(release): 发布 v${newVersion}`])
  git(['tag', '-a', `v${newVersion}`, '-m', `发布 v${newVersion}`])

  console.log(`\n✅ 发版准备完成：v${newVersion}（本地 commit + annotated tag 已就绪）`)
  console.log('\n下一步请你在本机手动 publish（需浏览器 / 密钥验证，助手不要代跑）：')
  console.log(`  pnpm publish --no-git-checks --registry https://registry.npmjs.org/`)
  console.log('\n发布成功后告诉助手「继续」，或自行收尾：')
  console.log(`  node actions/release-finish.js ${newVersion}`)
}

main()
