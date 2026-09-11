---
name: deploy
description: Deploy tellux examples/docs sites via project scripts — one local command (`pnpm run deploy`) rclone-syncs to the self-hosted site then Wrangler Direct Uploads to Cloudflare Pages. Use when the user wants to 部署, deploy, 同步到服务器, 刷新 CDN, 上 Cloudflare Pages / 文档站 / 示例站, or run actions/deploy.js. Does NOT publish the npm package (that is the release skill).
---

# Tellux 部署助手

把 **examples + docs 站点** 构建并发布到线上。真实动作由仓库脚本完成；本 skill 负责**校验前置条件、编排命令、解读失败**。

这不是发版：`npm`/`pnpm publish` 与 GitHub Release 走 [release](../release/SKILL.md)。

## 何时使用

用户要做以下任何一件事时启用：

- 「部署」「deploy」「同步到服务器」「刷新 CDN」
- 「上 Cloudflare Pages」「更新文档站 / 示例站」
- 运行 `actions/deploy.js`

## 一条本机链路

| 命令 | 产物去向 | URL |
|------|----------|-----|
| **`pnpm run deploy`** | 一次构建（`base=/`，docs=`/docs/`）→ rclone 自建站 → 可选腾讯云 CDN → Wrangler Direct Upload 到 Cloudflare Pages | 自建站 `https://tellux.cyanfish.site`；CF 为同一份产物的 Direct Upload 项目 |

> Windows / 本仓库请用 `pnpm run deploy`，不要写 `pnpm deploy`：后者是 pnpm 内置的 workspace deploy 子命令，会报 `ERR_PNPM_CANNOT_DEPLOY`。

GitHub Pages 已拆除，不要再推 `gh-pages` 或跑已删除的 `deploy:ghpages`。

## 前置条件

- 在仓库根目录执行。
- 建议工作区干净（未提交改动不会挡住部署，但脏工作区容易把未完成改动部署出去）。
- 使用 `pnpm` 调用 `package.json` scripts。
- **本机已安装 `rclone`**，且已 `rclone config` 建好 remote。
- **`actions/.env` 已存在**（可从 `actions/config-template.env` 复制）。脚本只读 `actions/.env`，不读根目录 `.env`。
- rclone 必填：`LOCAL_DIR`、`REMOTE_DIR`、`RCLONE_REMOTE`（与 `rclone config` 中一致，可带或不带末尾 `:`）。
- Cloudflare Pages 必填：`CLOUDFLARE_PAGES_PROJECT`。
  - 控制台项目必须是 **Direct Upload**（不要 Connect Git）。选了 Git 集成就不能再切 Direct Upload。
  - 本机优先 `pnpm exec wrangler login`（OAuth）。`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 只在无 login、或多账号需要钉死 account 时才填；填了 token 会盖掉 OAuth。
  - 可选 `CLOUDFLARE_PAGES_BRANCH`（默认 `main`）。Direct Upload 用这个名字选择 production / preview，**不是**仓库 git 分支；默认 `main` 是为了本机从 `dev` 部署仍打到 production。
- CDN 可选：同时配置 `CDN_SECRET_ID`、`CDN_SECRET_KEY`、`CDN_FLUSH_PATHS`（逗号分隔 URL）才会刷新；缺任一项则跳过 CDN，同步仍继续。CDN API 失败只打日志，**不**把整次部署标失败。
- **不要把 `actions/.env` 的密钥读进对话或写进 commit**。只检查文件是否存在、变量名是否齐全。

## 主流程

```bash
# 可选：确认前置
rclone version
rclone listremotes
# 确认 actions/.env 存在（不要 cat 出密钥）
Test-Path actions/.env   # PowerShell
# 或: test -f actions/.env

pnpm run deploy
```

`pnpm run deploy` = `build:examples`（VitePress docs → `examples/public/docs`，再 Vite 构建 examples）→ `node actions/deploy.js`：

1. `rclone mkdir` → `rclone sync`
2. 可选腾讯云 CDN purge
3. 本地 `wrangler pages deploy`（`--commit-dirty=true`，`--branch` 默认 `main`）

成功标志：日志出现 `🎉 部署全流程结束！`。若仅警告「跳过 CDN 刷新」，rclone 与 CF 仍算成功。若用户明确要刷 CDN，再补齐 `.env` 后单独：

```bash
node actions/refreshCDN.js
```

**失败语义：** 缺 rclone / Cloudflare 必填项、rclone 失败、Wrangler 失败 → 整次部署非 0 退出。CDN 跳过或 API 失败不中止。

## 回报结果

简短告知：

- 用了哪条命令
- 自建站 / CDN / Cloudflare 各自是成功、跳过还是失败
- 失败时贴关键错误（缺 env、rclone remote 不存在、Wrangler 鉴权、项目不是 Direct Upload 等）并给出下一步

## 禁止事项

- **不要**把部署当成发版去跑 `actions/release.js` / `pnpm publish`。
- **不要**为改 `base` 而设置带 `/` 的环境变量。发布面只有 `base=/`（docs=`/docs/`）。
- **不要**手写一套新的构建/同步流程；优先复用 `pnpm run deploy`。
- **不要**提交或打印 `actions/.env`、CDN 密钥、rclone 凭证、Cloudflare token。
- **不要**Connect Git 到 Cloudflare Pages，也不要再创建产物分支。
- **不要**对 `main` / `dev` 等协作分支做 force push 或删除。

## 常见失败

| 现象 | 处理 |
|------|------|
| `ERR_PNPM_CANNOT_DEPLOY` / `A deploy is only possible from inside a workspace` | 改用 `pnpm run deploy`，不要用 `pnpm deploy` |
| `缺少必要环境变量: LOCAL_DIR, ...` 或 Cloudflare 三项 | 按 `actions/config-template.env` 补全 `actions/.env` |
| `未找到 rclone` | 安装 rclone 并加入 PATH |
| `rclone remote 不存在` | `rclone config` 创建与 `RCLONE_REMOTE` 同名的 remote |
| `本地同步目录不存在` | 先保证 `build:examples` 成功，且 `LOCAL_DIR` 指向实际输出目录 |
| `未找到 wrangler` | 在仓库根目录 `pnpm install` |
| Wrangler 鉴权 / 找不到 Pages 项目 | 本机先 `pnpm exec wrangler login`；核对 `CLOUDFLARE_PAGES_PROJECT`；确认项目是 Direct Upload。只有无 login 时才查 token / account id |
| 部署进了 preview 而不是 production | 把 `CLOUDFLARE_PAGES_BRANCH` 设成该项目的 production 分支名（默认 `main`） |
| CDN 警告跳过 | rclone 与 CF 已完成；要刷缓存则补 `CDN_*` 后跑 `node actions/refreshCDN.js` |
| VitePress `dead link(s) found` | 文档链到示例站（`../../xxx.html`）需在 `docs/.vitepress/config.ts` 的 `ignoreDeadLinks` 中忽略跨站相对路径；或修正错误路径 |

## 与相关脚本对照

- `actions/deploy.js`：rclone + 可选 CDN + Wrangler；**不构建**。完整部署用 `pnpm run deploy`。
- `actions/refreshCDN.js`：仅刷新 CDN（依赖同一份 `actions/.env`）。
- `actions/config-template.env`：环境变量模板。
