/**
 * generate-changelog.js
 * 功能：发版时生成/迁移 CHANGELOG.md 版本段
 *
 * 用法：
 *   node actions/generate-changelog.js --dry-run          预览从 commit 自动生成的 [Unreleased] 段
 *   node actions/generate-changelog.js --version 0.1.8    写入版本段到 CHANGELOG.md
 *
 * 写入逻辑（--version）：
 *   - 全手写：[Unreleased] 已含标准分类标题（### Added/Changed/...），仅改名迁移，不追加自动内容
 *   - 混合（推荐）：[Unreleased] 已有摘要/亮点但无标准分类标题，保留摘要并追加自动分类清单
 *   - 自动：[Unreleased] 为空，从上一个 tag 到 HEAD 的 commit 按 Conventional Commits 生成版本段
 * 摘要写法：在 ## [Unreleased] 下写一段散文或几条 - 亮点 bullet（不要用 ### 标题），
 *   发版时摘要成为版本段开头，下方自动追加 ### Added/Changed/Fixed。
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

const CATEGORY_HEADERS = ['### Added', '### Changed', '### Deprecated', '### Removed', '### Fixed', '### Security']

// [Unreleased] 段是否已含标准分类标题（用于区分「全手写」与「混合摘要」）
function unreleasedHasStandardCategories(lines, idx) {
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break
    if (CATEGORY_HEADERS.includes(lines[i].trim())) return true
  }
  return false
}

// 去掉首尾空行
function trimBlankEdges(arr) {
  let s = 0
  let e = arr.length
  while (s < e && arr[s].trim() === '') s++
  while (e > s && arr[e - 1].trim() === '') e--
  return arr.slice(s, e)
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

  // [Unreleased] 段边界（到下一个 ## ）
  let endIdx = lines.length
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { endIdx = i; break }
  }

  const hasContent = unreleasedHasContent(lines, idx)
  const hasCategories = unreleasedHasStandardCategories(lines, idx)

  if (hasContent && hasCategories) {
    // 全手写：[Unreleased] 已含标准分类标题，仅改名迁移，不追加自动内容
    lines[idx] = `## [Unreleased]\n\n## [${version}] - ${today()}`
    writeFileSync(changelogPath, lines.join('\n'))
    console.log(`✅ 已将 [Unreleased] 手写内容迁移为 [${version}] 段，并新建空 [Unreleased]`)
    return
  }

  // 自动 / 混合：都需要从 commit 生成分类清单
  const { lastTag, commits, skipped, body } = generateFromCommits()
  if (lastTag) console.log(`📌 上一版本 tag: ${lastTag}`)
  console.log(`📦 待处理 commit: ${commits.length} 条`)
  if (skipped.length) {
    console.log(`ℹ️ 已跳过 ${skipped.length} 条非规范/内部 commit（建议补 commit 规范）`)
  }

  if (hasContent && !hasCategories) {
    // 混合：保留手写摘要，追加自动分类清单
    const summary = trimBlankEdges(lines.slice(idx + 1, endIdx))
    const versionBlock = [`## [${version}] - ${today()}`, '', ...summary, '', body].join('\n')
    const newLines = [...lines.slice(0, idx), '## [Unreleased]', '', versionBlock, '', ...lines.slice(endIdx)]
    writeFileSync(changelogPath, newLines.join('\n'))
    console.log(`✅ 已保留手写摘要并追加自动分类清单，生成 [${version}] 段`)
  } else {
    // 自动：从 commit 生成版本段，插入 [Unreleased] 下方
    const section = `## [${version}] - ${today()}\n\n${body}\n`
    const newLines = [...lines.slice(0, endIdx), section.trimEnd(), '', ...lines.slice(endIdx)]
    writeFileSync(changelogPath, newLines.join('\n'))
    console.log(`✅ 已从 commit 自动生成 [${version}] 段并写入`)
  }
}

main()
