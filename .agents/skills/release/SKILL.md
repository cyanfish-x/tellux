---
name: release
description: Cut and publish a new tellux release — bump version, curate a changelog summary from recent commits, pause for the user to manually pnpm publish (browser 2FA), then push the tag and create the GitHub Release. Use whenever the user wants to release/publish a new version of tellux: "发版", "发布新版本", "release 一个版本", "publish tellux", "cut a release", or bump patch/minor/major. Wraps actions/release.js + release-finish.js and writes a human summary into CHANGELOG.md before releasing, so GitHub Release notes lead with highlights instead of a raw commit dump.
---

# Tellux 发版助手

把当前 `dev` 分支上的改动打包成一个新版本，发布到 npm + GitHub Release。

- **准备**（助手可跑）：`actions/release.js` — check / bump / changelog / commit / annotated tag
- **publish**（**必须用户本机手动**）：`pnpm publish` — npm 需浏览器跳转或密钥验证，助手**禁止代跑**
- **收尾**（用户 publish 成功后助手再跑）：`actions/release-finish.js` — push tag + GitHub Release

本 skill 负责**前置准备（撰写发版摘要）+ 编排 + 兜底**。

## 何时使用

用户要做以下任何一件事时启用：

- "发版"、"发布新版本"、"release 一下"、"publish tellux"、"cut a release"
- 升 patch / minor / major 版本号

补建历史版本的 Release 见文末「补建历史 Release」，不走下面的主流程。

## 前置条件（先全部满足，否则停下告诉用户）

1. **分支与工作区**：在 `dev` 分支，且 `git status` 干净。`release.js` 开头会校验，不干净直接退出。若有未提交改动，让用户先 commit 或 stash——**不要替用户提交无关改动**。
2. **包管理器**：必须 `pnpm`。`npm pack`/`npm publish` 会因 pnpm 符号链接 `node_modules` 触发 arborist 崩溃（`Cannot read properties of null`），打包发布都必须走 pnpm。
3. **gh CLI**：已 `gh auth login` 且 `gh repo set-default cyanfish-x/tellux`。收尾建 GitHub Release 依赖它；缺失只会告警，不影响 npm 发布与 tag 推送，但 Release 要后补。
4. **npm registry**：本机默认 registry 可能是 npmmirror；publish **必须**显式指定 `https://registry.npmjs.org/`。

## 主流程

### 1. 确认版本类型

patch / minor / major。可从 commit 推断建议（有 `feat:` → minor；只有 `fix:`/`refactor:` → patch；有 `!:` 破坏性 → major），但**发版不可逆，必须向用户确认后再继续**。

### 2. 撰写发版摘要（hybrid 模式核心）

`generate-changelog.js` 会从 commit 自动生成 `### Added/Changed/Fixed` 清单，但缺重点。发版前先在 CHANGELOG.md 的 `## [Unreleased]` 下写一段摘要，发版时它会成为版本段开头，GitHub Release 点进去先看到摘要。

起草：

```bash
git describe --tags --abbrev=0                    # 上一版本 tag，如 v0.1.8
git log v0.1.8..HEAD --pretty=format:"%h %s"      # 该 tag 到 HEAD 的 commit（含 merge，勿只过滤 feat/fix）
```

基于这些 commit 归纳 **3-5 条主题级亮点**（不是逐条罗列），写入 `## [Unreleased]` 下。格式硬性要求：

- 散文或 `-` bullet 均可，**不要用 `###` 标题**（会被 `generate-changelog.js` 误判为「全手写」而不追加自动清单）。
- 突出用户视角的主题（如「高性能 HISM 渲染」「统一拾取与高亮」），不复述实现细节。
- 可用 `**粗体**` 标主题词便于扫读。
- **扫 commit 时不要只看 `feat:`/`fix:`**：`merge:` 或无前缀的合入说明也可能是大特性（例如 HISM），漏掉会严重失真。

参考写法：

```markdown
## [Unreleased]

本版本重点：

- **高性能 HISM 渲染**：合入 HISM 实例化渲染能力，并支持单实例后处理描边高亮。
- **统一拾取与高亮**：收敛为 `pick` / `pickAll` API，落地统一高亮能力。
```

### 3. 提交摘要（让工作区回到干净）

把上一步起草的摘要展示给用户确认后：

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): 补充发版摘要"
```

必须先提交摘要，否则 `release.js` 的干净工作区校验会失败。

### 4. 执行发版准备（到 tag 为止）

```bash
node actions/release.js <type>     # patch | minor | major
```

`release.js` 依次：`pnpm release:check` → 升版本号 → 生成 changelog（保留上一步摘要并追加自动分类清单）→ commit + annotated tag，然后**退出**并打印手动 publish 命令。

中途若 `release:check` 失败（类型/构建/打包），修完重跑。

**此时不要**代跑 `pnpm publish` / `git push` / GitHub Release。

### 5. 用户手动 publish（硬性规则）

助手**禁止**执行 `pnpm publish` / `npm publish`。原因：npm 账号发布需要浏览器跳转或密钥验证，非交互环境无法完成。

向用户给出确切命令并等待其确认「已发布」或「继续」：

```bash
pnpm publish --no-git-checks --registry https://registry.npmjs.org/
```

说明：

- 必须加 `--registry https://registry.npmjs.org/`（避免打到 npmmirror）。
- `--no-git-checks`：tag/commit 尚未 push，需跳过 pnpm 对未推送 commit 的拦截。
- 用户在本机终端跑，以便弹出浏览器完成验证。

### 6. 收尾（用户 publish 成功之后）

确认 npm 已有新版本后再执行：

```bash
node actions/release-finish.js <新版本>   # git push --follow-tags + GitHub Release
```

或等价拆开：

```bash
git push --follow-tags
node actions/github-release.js <新版本>
```

若 GitHub Release 失败（gh 没装/没登录），npm 包与 tag 推送仍可成功，按告警补：

```bash
gh auth login && gh repo set-default cyanfish-x/tellux
node actions/github-release.js <新版本>
```

### 7. 确认

```bash
npm view tellux version --registry https://registry.npmjs.org/   # 应为新版本号
gh release view v<新版本>                                         # 确认 notes 带摘要
```

## 半途恢复（准备已完成、publish 或收尾未做）

若本地已有 `chore(release): 发布 vX.Y.Z` 与 `vX.Y.Z` tag，**不要重跑** `release.js`（会再次升版本）。按缺口补：

1. 用户尚未 publish → 只让用户跑第 5 步命令。
2. npm 已发布、尚未 push/Release → 直接跑第 6 步 `release-finish.js`。

## 补建历史 Release

为已存在 tag 的旧版本补建 GitHub Release（不重发 npm）：

```bash
git push origin v<版本>                            # 先确保 tag 在远端
node actions/github-release.js <版本> --no-latest  # --no-latest 避免抢占最新版 Latest 徽章
```

notes 取自 CHANGELOG 对应版本段；已有 Release 则更新，可反复重跑。给已有版本补摘要：直接编辑 CHANGELOG 该版本段顶部加摘要，再跑一次 `node actions/github-release.js <版本>` 更新 notes。

## 关键坑点

- **publish 必须用户本机手动跑**，助手禁止代跑（浏览器 / 密钥验证）。
- **必须 pnpm**，不能用 npm（arborist 崩溃）。
- **publish 必须 `--registry https://registry.npmjs.org/`**，否则可能打到 npmmirror 并鉴权失败。
- **必须 annotated tag**：`release.js` 用 `git tag -a`；轻量 tag 不会被 `git push --follow-tags` 推送（历史上的 v0.1.4/5/6/8 曾因此漏推）。
- **`pnpm publish --no-git-checks`**：发版在 push 之前，需跳过 pnpm 对未推送 commit 的拦截。
- **commit message 遵守 Conventional Commits**（`feat:`/`fix:`/`refactor:` 等）：`generate-changelog.js` 按此归类，不规范的会被跳过而不进 changelog；写「版本重点」摘要时仍要阅读 merge / 无前缀 commit，避免漏掉大特性。
