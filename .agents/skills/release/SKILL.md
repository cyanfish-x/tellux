---
name: release
description: Cut and publish a new tellux release — bump version, curate a changelog summary from recent commits, publish to npm, push the tag, and create the GitHub Release. Use whenever the user wants to release/publish a new version of tellux: "发版", "发布新版本", "release 一个版本", "publish tellux", "cut a release", or bump patch/minor/major. Wraps actions/release.js and writes a human summary into CHANGELOG.md before releasing, so GitHub Release notes lead with highlights instead of a raw commit dump.
---

# Tellux 发版助手

把当前 `dev` 分支上的改动打包成一个新版本，发布到 npm + GitHub Release。真实发版动作由 `actions/release.js` 完成；本 skill 负责**前置准备（撰写发版摘要）+ 编排 + 兜底**。

## 何时使用

用户要做以下任何一件事时启用：

- "发版"、"发布新版本"、"release 一下"、"publish tellux"、"cut a release"
- 升 patch / minor / major 版本号

补建历史版本的 Release 见文末「补建历史 Release」，不走下面的主流程。

## 前置条件（先全部满足，否则停下告诉用户）

1. **分支与工作区**：在 `dev` 分支，且 `git status` 干净。`release.js` 开头会校验，不干净直接退出。若有未提交改动，让用户先 commit 或 stash——**不要替用户提交无关改动**。
2. **包管理器**：必须 `pnpm`。`npm pack`/`npm publish` 会因 pnpm 符号链接 `node_modules` 触发 arborist 崩溃（`Cannot read properties of null`），打包发布都必须走 pnpm。
3. **gh CLI**：已 `gh auth login` 且 `gh repo set-default cyanfish-x/tellux`。第 7 步建 GitHub Release 依赖它；缺失只会在最后告警，不影响 npm 发布，但 Release 要后补。

## 主流程

### 1. 确认版本类型

patch / minor / major。可从 commit 推断建议（有 `feat:` → minor；只有 `fix:`/`refactor:` → patch；有 `!:` 破坏性 → major），但**发版不可逆，必须向用户确认后再继续**。

### 2. 撰写发版摘要（hybrid 模式核心）

`generate-changelog.js` 会从 commit 自动生成 `### Added/Changed/Fixed` 清单，但缺重点。发版前先在 CHANGELOG.md 的 `## [Unreleased]` 下写一段摘要，发版时它会成为版本段开头，GitHub Release 点进去先看到摘要。

起草：

```bash
git describe --tags --abbrev=0                    # 上一版本 tag，如 v0.1.8
git log v0.1.8..HEAD --pretty=format:"%h %s"      # 该 tag 到 HEAD 的 commit
```

基于这些 commit 归纳 **3-5 条主题级亮点**（不是逐条罗列），写入 `## [Unreleased]` 下。格式硬性要求：

- 散文或 `-` bullet 均可，**不要用 `###` 标题**（会被 `generate-changelog.js` 误判为「全手写」而不追加自动清单）。
- 突出用户视角的主题（如「SymbolEntity 矢量标注体系」「WebGPU 渲染模式」），不复述实现细节。
- 可用 `**粗体**` 标主题词便于扫读。

参考 v0.1.8 的写法：

```markdown
## [Unreleased]

本版本重点：

- **SymbolEntity 矢量标注**：落地基本渲染与管线，优化文字清晰度，修复锚点遮挡。
- **WebGPU 渲染模式**：完成基础瓦片地球案例，接入大气效果。
```

### 3. 提交摘要（让工作区回到干净）

把上一步起草的摘要展示给用户确认后：

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): 补充发版摘要"
```

必须先提交摘要，否则 `release.js` 的干净工作区校验会失败。

### 4. 执行发版

```bash
node actions/release.js <type>     # patch | minor | major
```

`release.js` 依次：`pnpm release:check` → 升版本号 → 生成 changelog（保留上一步摘要并追加自动分类清单）→ commit + annotated tag → `pnpm publish --no-git-checks` → `git push --follow-tags` → `gh release create`。

中途若 `release:check` 失败（类型/构建/打包），修完重跑。若最后一步 GitHub Release 失败（gh 没装/没登录），npm 包与 tag 已发布成功，按告警补：

```bash
gh auth login && gh repo set-default cyanfish-x/tellux
node actions/github-release.js <新版本>
```

### 5. 确认

```bash
npm view tellux version          # 应为新版本号
gh release view v<新版本>        # 确认 notes 带摘要
```

## 补建历史 Release

为已存在 tag 的旧版本补建 GitHub Release（不重发 npm）：

```bash
git push origin v<版本>                            # 先确保 tag 在远端
node actions/github-release.js <版本> --no-latest  # --no-latest 避免抢占最新版 Latest 徽章
```

notes 取自 CHANGELOG 对应版本段；已有 Release 则更新，可反复重跑。给已有版本补摘要：直接编辑 CHANGELOG 该版本段顶部加摘要，再跑一次 `node actions/github-release.js <版本>` 更新 notes。

## 关键坑点

- **必须 pnpm**，不能用 npm（arborist 崩溃）。
- **必须 annotated tag**：`release.js` 用 `git tag -a`；轻量 tag 不会被 `git push --follow-tags` 推送（历史上的 v0.1.4/5/6/8 曾因此漏推）。
- **`pnpm publish --no-git-checks`**：发版在 push 之前，需跳过 pnpm 对未推送 commit 的拦截。
- **commit message 遵守 Conventional Commits**（`feat:`/`fix:`/`refactor:` 等）：`generate-changelog.js` 按此归类，不规范的会被跳过而不进 changelog。
