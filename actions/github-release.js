/**
 * github-release.js
 * 功能：为指定版本创建/更新 GitHub Release，Release notes 取自 CHANGELOG.md 对应版本段
 *
 * 用法：node actions/github-release.js <version> [--no-latest]   例如 0.1.8
 *   --no-latest  不标记为 Latest（补建旧版本时使用，避免抢占最新版的 Latest 徽章）
 *
 * 前置条件：
 *   - 已安装并登录 gh CLI（gh auth status 正常）
 *   - tag v<version> 已推送到 origin（脚本会校验，未推送会提示 git push origin v<version>）
 *
 * notes 来源：CHANGELOG.md 中 `## [<version>] - <date>` 段的正文（### Added/Changed/Fixed...）。
 * 若该版本已有 Release，则更新其 notes（便于补建时反复重跑）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const changelogPath = resolve(projectRoot, 'CHANGELOG.md')

const argv = process.argv.slice(2)
const noLatest = argv.includes('--no-latest')
const version = argv.find((a) => !a.startsWith('--'))
if (!version) {
  console.error('用法: node actions/github-release.js <version> [--no-latest]   例如 0.1.8')
  console.error('  --no-latest  不标记为 Latest（补建旧版本时使用）')
  process.exit(1)
}
const tag = `v${version}`

function gitRead(args) {
  return execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

// 从 CHANGELOG.md 提取 `## [<ver>] - <date>` 段正文（不含标题行）
function extractSection(content, ver) {
  const lines = content.split('\n')
  const escaped = ver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = lines.findIndex((l) => new RegExp(`^## \\[${escaped}\\]`).test(l))
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    // 版本段在下一个 ## 标题或链接引用定义（[name]: url）处结束
    if (lines[i].startsWith('## ') || /^\[[^\]]+\]:/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start + 1, end).join('\n').trim()
}

// 1. 校验 tag 已推送到远端（gh release create 会在默认分支新建 tag，避免误指向 main）
let remoteTag = ''
try {
  remoteTag = gitRead(['ls-remote', '--tags', 'origin', tag])
} catch {
  remoteTag = ''
}
if (!remoteTag) {
  console.error(`❌ 远端未找到 tag ${tag}。先推送：  git push origin ${tag}`)
  process.exit(1)
}

// 2. 提取 changelog 段
const body = extractSection(readFileSync(changelogPath, 'utf8'), version)
if (!body) {
  console.error(`❌ CHANGELOG.md 中未找到 ## [${version}] 段`)
  process.exit(1)
}

// 3. 写临时文件作为 --notes-file（避免命令行传多行文本的转义问题）
const tmpDir = mkdtempSync(join(tmpdir(), 'tellux-release-'))
const notesPath = join(tmpDir, 'notes.md')
writeFileSync(notesPath, body + '\n', 'utf8')

try {
  // 4. 已有 Release 则 edit，否则 create（便于补建时重跑）
  let exists = false
  try {
    execFileSync('gh', ['release', 'view', tag], { cwd: projectRoot, stdio: 'ignore' })
    exists = true
  } catch {
    exists = false
  }

  const latestArgs = noLatest ? ['--latest=false'] : []
  const args = exists
    ? ['release', 'edit', tag, '--notes-file', notesPath, ...latestArgs]
    : ['release', 'create', tag, '--title', tag, '--notes-file', notesPath, ...latestArgs]
  console.log(`\n🏷️  ${exists ? '更新' : '创建'} GitHub Release ${tag}...`)
  execFileSync('gh', args, { cwd: projectRoot, stdio: 'inherit' })
  console.log(`✅ GitHub Release ${tag} 已${exists ? '更新' : '创建'}`)
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}
