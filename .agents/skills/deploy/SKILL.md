---
name: deploy
description: Deploy tellux examples/docs sites via project scripts — self-hosted rclone+CDN (`pnpm deploy`) or GitHub Pages (`pnpm deploy:ghpages`). Use when the user wants to 部署, deploy, 同步到服务器, 刷新 CDN, 推 gh-pages, 更新 GitHub Pages / 文档站 / 示例站, or run actions/deploy.js / actions/deploy-ghpages.mjs. Does NOT publish the npm package (that is the release skill).
---

# Tellux 部署助手

把 **examples + docs 站点** 构建并发布到线上。真实动作由仓库脚本完成；本 skill 负责**选对目标、校验前置条件、编排命令、解读失败**。

这不是发版：`npm`/`pnpm publish` 与 GitHub Release 走 [release](../release/SKILL.md)。

## 何时使用

用户要做以下任何一件事时启用：

- 「部署」「deploy」「同步到服务器」「刷新 CDN」
- 「推 gh-pages」「更新 GitHub Pages」「更新文档站 / 示例站」
- 运行 `actions/deploy.js` 或 `actions/deploy-ghpages.mjs`

## 两条部署目标（先问清再动手）

| 目标 | 命令 | 产物去向 | 典型 URL 形态 |
|------|------|----------|----------------|
| **自建站** | `pnpm deploy` | rclone 同步到服务器，可选腾讯云 CDN 刷新 | 自有域名，docs base=`/docs/` |
| **GitHub Pages** | `pnpm deploy:ghpages` | 构建到 `examples/dist-ghpages/`，提交并 push `gh-pages` 分支 | `https://<org>.github.io/tellux/`，docs base=`/tellux/docs/` |

用户没说清时，**先确认目标再执行**。两条链路的 `base` 不同，不能混用脚本。

## 前置条件

### 共用

- 在仓库根目录执行。
- 建议工作区干净（未提交改动不会挡住部署，但脏工作区容易把未完成改动部署出去）。
- 使用 `pnpm` 调用 `package.json` scripts。

### 自建站（`pnpm deploy`）额外要求

1. **本机已安装 `rclone`**，且已 `rclone config` 建好 remote。
2. **`actions/.env` 已存在**（可从 `actions/config-template.env` 复制）。脚本只读 `actions/.env`，不读根目录 `.env`。
3. 必填环境变量：
   - `LOCAL_DIR`：本地构建产物目录（通常为 examples 的 Vite 输出目录，如项目下的 `examples/dist` 绝对路径）
   - `REMOTE_DIR`：远端目录路径
   - `RCLONE_REMOTE`：rclone remote 名（与 `rclone config` 中一致，可带或不带末尾 `:`）
4. CDN 可选：同时配置 `CDN_SECRET_ID`、`CDN_SECRET_KEY`、`CDN_FLUSH_PATHS`（逗号分隔 URL）才会刷新；缺任一项则跳过 CDN，同步仍算成功。
5. **不要把 `actions/.env` 的密钥读进对话或写进 commit**。只检查文件是否存在、变量名是否齐全。

### GitHub Pages（`pnpm deploy:ghpages`）额外要求

1. `git` 远程可推送 `origin`，且有 `gh-pages` 分支写权限。
2. 依赖已安装（脚本会 `import("gh-pages")`）。
3. 不需要 rclone / `actions/.env`。

## 主流程

### 1. 确认目标

自建站 → 流程 A；GitHub Pages → 流程 B。

### 2A. 自建站部署

```bash
# 可选：确认前置
rclone version
rclone listremotes
# 确认 actions/.env 存在（不要 cat 出密钥）
Test-Path actions/.env   # PowerShell
# 或: test -f actions/.env

pnpm deploy
```

`pnpm deploy` = `build:examples`（VitePress docs → `examples/public/docs`，再 Vite 构建 examples）→ `node actions/deploy.js`（`rclone mkdir` → `rclone sync` → 可选 CDN purge）。

成功标志：日志出现 `🎉 部署全流程结束！`。若仅警告「跳过 CDN 刷新」，同步仍成功；若用户明确要刷 CDN，再补齐 `.env` 后单独：

```bash
node actions/refreshCDN.js
```

### 2B. GitHub Pages 部署

```bash
pnpm deploy:ghpages
```

脚本内部：

1. `DEPLOY_TARGET=ghpages` 下构建 VitePress → `examples/dist-ghpages/docs`
2. `vite build --mode ghpages` → `examples/dist-ghpages/`
3. `gh-pages` 包提交到本地 `gh-pages` 分支
4. **显式** `git push -u origin gh-pages`（包默认推送可能静默失败，脚本已兜底）

成功标志：日志出现 `🎉 gh-pages 部署完成！`。

### 3. 回报结果

简短告知：

- 用了哪条命令 / 哪个目标
- 是否成功；CDN 是刷新了还是跳过了
- 失败时贴关键错误（缺 env、rclone remote 不存在、push 权限等）并给出下一步

## 禁止事项

- **不要**把部署当成发版去跑 `actions/release.js` / `pnpm publish`。
- **不要**为改 `base` 而设置带 `/` 的环境变量（如 `DOCS_BASE=/tellux/docs/`）。Windows + Git Bash 的 MSYS2 会把以 `/` 开头的值改写成盘符路径。区分目标只用脚本已有的 `DEPLOY_TARGET=ghpages`。
- **不要**手写一套新的构建/同步流程；优先复用 `pnpm deploy` / `pnpm deploy:ghpages`。
- **不要**提交或打印 `actions/.env`、CDN 密钥、rclone 凭证。
- **不要**在未确认目标时默认推 `gh-pages` 或默认同步生产机。

## 常见失败

| 现象 | 处理 |
|------|------|
| `缺少必要环境变量: LOCAL_DIR, ...` | 按 `actions/config-template.env` 补全 `actions/.env` |
| `未找到 rclone` | 安装 rclone 并加入 PATH |
| `rclone remote 不存在` | `rclone config` 创建与 `RCLONE_REMOTE` 同名的 remote |
| `本地同步目录不存在` | 先保证 `build:examples` 成功，且 `LOCAL_DIR` 指向实际输出目录 |
| CDN 警告跳过 | 同步已完成；要刷缓存则补 `CDN_*` 后跑 `node actions/refreshCDN.js` |
| gh-pages push 失败 | 检查 `origin` 权限与网络；确认本地能 `git push origin gh-pages` |
| 站点资源 404 / 路径错乱 | 确认没混用两条链路的 base；自建站勿用 `deploy:ghpages` 产物，反之亦然 |

## 与相关脚本对照

- `actions/deploy.js`：只做 rclone 同步 + CDN；**不构建**。完整自建部署用 `pnpm deploy`。
- `actions/deploy-ghpages.mjs`：构建 + 发布 gh-pages；入口即 `pnpm deploy:ghpages`。
- `actions/refreshCDN.js`：仅刷新 CDN（依赖同一份 `actions/.env`）。
- `actions/config-template.env`：自建站环境变量模板。
