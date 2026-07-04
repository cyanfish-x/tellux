/**
 * generate-changelog.js
 * 功能：发版时生成/迁移 CHANGELOG.md 版本段
 *
 * 用法：
 *   node actions/generate-changelog.js --dry-run          预览从 commit 自动生成的 [Unreleased] 段
 *   node actions/generate-changelog.js --version 0.1.8    写入版本段到 CHANGELOG.md
 *
 * 写入逻辑（--version）：
 *   - 若 [Unreleased] 段已有手写内容：将其标题改为 [版本] - 日期，并在其上方插入新的空 [Unreleased] 段
 *     （适合已手动整理的版本，如历史欠账）
 *   - 若 [Unreleased] 段为空：从上一个 tag 到 HEAD 的 commit 按 Conventional Commits 自动生成版本段
 *     （适合 commit 规范后的常规发版）
 *
 * 自动归类规则：feat→Added、fix→Fixed、refactor/perf→Changed、revert→Removed；
 *   含 `!:` 标注 ⚠️ BREAKING；docs/style/test/chore/build/ci 及不规范 commit 跳过（打印提示）；
 *   相同类别+消息的条目自动去重。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const changelogPath = resolve(projectRoot, 'CHANGELOG.md')

const TYPE_TO_CATEGORY = {
  feat: 'Added',
  fix: 'Fixed',
  refactor: 'Changed',
  perf: 'Changed',
  revert: 'Removed',
}
const SKIP_TYPES = ['docs', 'style', 'test', 'chore', 'build', 'ci']
const CATEGORY_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']

function git(args) {
  return execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function getLastTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0'])
  } catch {
    return null
  }
}

function getCommits(since) {
  const args = since
    ? ['log', `${since}..HEAD`, '--pretty=format:%h%x09%s']
    : ['log', '--pretty=format:%h%x09%s']
  const out = git(args)
  if (!out) return []
  return out.split('\n').map((line) => {
    const [hash, ...rest] = line.split('\t')
    return { hash, subject: rest.join('\t') }
  })
}

function classify(commits) {
  const categories = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []]))
  const skipped = []
  const seen = new Set()
  const re = /^(\w+)(\([^)]*\))?(!)?:\s*(.*)$/
  for (const { hash, subject } of commits) {
    const m = subject.match(re)
    if (!m) {
      skipped.push(`${hash} ${subject}`)
      continue
    }
    const type = m[1].toLowerCase()
    const breaking = !!m[3]
    const msg = m[4].trim()
    if (SKIP_TYPES.includes(type)) {
      skipped.push(`${hash} ${subject}`)
      continue
    }
    const cat = TYPE_TO_CATEGORY[type]
    if (!cat) {
      skipped.push(`${hash} ${subject}`)
      continue
    }
    const key = `${cat}:${msg}`
    if (seen.has(key)) continue // 去重
    seen.add(key)
    categories[cat].push(breaking ? `- ⚠️ BREAKING: ${msg}` : `- ${msg}`)
  }
  return { categories, skipped }
}

function renderBody(categories) {
  const parts = CATEGORY_ORDER
    .filter((c) => categories[c].length)
    .map((c) => `### ${c}\n${categories[c].join('\n')}`)
  return parts.length ? parts.join('\n\n') : '_无显著变更_'
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function generateFromCommits() {
  const lastTag = getLastTag()
  const commits = getCommits(lastTag)
  const { categories, skipped } = classify(commits)
  return { lastTag, commits, skipped, body: renderBody(categories) }
}

function unreleasedHasContent(lines, idx) {
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break
    if (lines[i].trim() && !lines[i].startsWith('<!--')) return true
  }
  return false
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const verIdx = args.indexOf('--version')
  const version = verIdx >= 0 ? args[verIdx + 1] : null

  // dry-run：预览从 commit 自动生成的效果
  if (dryRun) {
    const { lastTag, commits, skipped, body } = generateFromCommits()
    if (lastTag) console.log(`📌 上一版本 tag: ${lastTag}`)
    console.log(`📦 待处理 commit: ${commits.length} 条\n`)
    if (skipped.length) {
      console.log(`ℹ️ 已跳过 ${skipped.length} 条非规范/内部 commit：`)
      for (const s of skipped) console.log(`   ${s}`)
      console.log('')
    }
    console.log(`## [Unreleased]\n\n${body}\n`)
    return
  }

  if (!version) {
    console.error('用法: node actions/generate-changelog.js --dry-run | --version <ver>')
    process.exit(1)
  }

  const content = readFileSync(changelogPath, 'utf8')
  const lines = content.split('\n')
  const idx = lines.findIndex((l) => l.startsWith('## [Unreleased]'))
  if (idx === -1) {
    console.error('❌ CHANGELOG.md 中未找到 ## [Unreleased] 段')
    process.exit(1)
  }

  if (unreleasedHasContent(lines, idx)) {
    // 手写模式：[Unreleased] 已有内容，改名为版本段，上方插入空 [Unreleased]
    lines[idx] = `## [Unreleased]\n\n## [${version}] - ${today()}`
    writeFileSync(changelogPath, lines.join('\n'))
    console.log(`✅ 已将 [Unreleased] 手写内容迁移为 [${version}] 段，并新建空 [Unreleased]`)
  } else {
    // 自动模式：从 commit 生成版本段，插入 [Unreleased] 下方
    const { lastTag, commits, skipped, body } = generateFromCommits()
    if (lastTag) console.log(`📌 上一版本 tag: ${lastTag}`)
    console.log(`📦 待处理 commit: ${commits.length} 条`)
    if (skipped.length) {
      console.log(`ℹ️ 已跳过 ${skipped.length} 条非规范/内部 commit（建议补 commit 规范）`)
    }
    const section = `## [${version}] - ${today()}\n\n${body}\n`
    let endIdx = lines.length
    for (let i = idx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) { endIdx = i; break }
    }
    const newLines = [...lines.slice(0, endIdx), section.trimEnd(), '', ...lines.slice(endIdx)]
    writeFileSync(changelogPath, newLines.join('\n'))
    console.log(`✅ 已从 commit 自动生成 [${version}] 段并写入`)
  }
}

main()
