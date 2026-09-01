# examples 架构说明

本文记录 `examples/` 目录的项目级架构。这里的内容面向维护者，不属于面向用户发布的文档页。

`examples/` 同时承担三个展示入口：

- 项目主页：`examples/index.html`
- 项目文档页：`docs/` 通过 VitePress 构建到 `examples/public/docs/`
- 项目 Sandcastle：`examples/sandcastle.html` 和 `examples/sandcastle/`

这三部分在开发时可以通过根目录 `pnpm dev`（`scripts/dev.mjs`）同时启动：优先使用 `http://127.0.0.1:5173/`（examples）与 `http://127.0.0.1:5174/`（docs）；若端口被占用则自动向后寻找空闲端口，并通过 `TELLUX_EXAMPLES_ORIGIN` / `VITE_TELLUX_DOCS_ORIGIN` 同步两侧交叉链接。发布示例时，`pnpm build:examples` 会先构建 VitePress 文档，再构建 `examples` Vite 多页应用。

## 整体构建关系

`examples/vite.config.ts` 以 `examples/` 作为 Vite root，并通过 `rollupOptions.input` 显式注册多个 HTML 入口，包括首页、各独立示例页、Sandcastle 主页面和 Sandcastle runner。

关键入口包括：

- `index.html`：项目主页。
- `gallery.html`：社区案例 gallery 页（独立展示社区作品，带搜索与标签筛选）。
- `basic.html`、`terrain.html`、`3d-tiles.html` 等：独立示例页。
- `sandcastle.html`：Sandcastle 编辑器页面。
- `sandcastle/runner.html`：Sandcastle iframe 运行页面。

示例代码默认从 `../src` 引入 Tellux，而不是从 `dist` 引入。这样开发示例可以直接验证源码行为，适合作为库功能开发时的反馈面。

`examples/public/` 是示例站点的静态资源根目录：

- `examples/public/draco/` 存放 Draco 解码器资源。根目录是 three.js 完整 decoder（mesh + 点云）；`gltf/` 子目录是体积更小的 glTF 专用 decoder，不能解点云。
- `examples/public/docs/` 是 VitePress 文档的构建输出目录。

Tellux 自身的云、STBN、星空等运行资源默认从源码内置资源模块进入 Vite 依赖图，不再通过
`examples/public/tellux/` 和 `tellux.baseUrl = '/tellux/'` 作为示例默认路径。

## 项目主页

项目主页由 `examples/index.html` 和 `examples/index.ts` 组成，主要目标是给访问者一个产品级第一印象，而不是只展示示例列表。

`examples/index.html` 负责页面结构和文案：

- 顶部导航包含 Tellux 品牌、能力、工作流、Sandcastle、社区作品和 GitHub 入口。
- Hero 区域展示 Tellux 的定位：基于 Three.js 的 3D Earth Engine。
- 页面中部介绍地球与相机、多源影像图层、3D Tiles、Cesium 地形、大气云和工程默认值。
- 后续展示真实地形、大气和体积云效果素材。
- `#showcase` 社区案例精选条：位于页面底部收尾，只展示最新 3 条 + 「查看全部」入口（指向 `gallery.html`），空数据时整块隐藏。数据来自 `examples/showcase-data.ts`，由 `examples/showcase.ts` 的 `mountFeaturedStrip()` 渲染；完整列表与搜索 / 标签筛选在 gallery 页（`mountGallery()`）。

`examples/gallery.html` 是社区案例 gallery 页：复用 portal 壳（品牌导航 + 语言切换 + 文档链接），页面主体为搜索框 + 标签筛选条 + 全量卡片网格，由 `examples/gallery.ts` 挂载。决策背景见 [notes/架构/adr/0001-community-showcase-gallery-page.md](adr/0001-community-showcase-gallery-page.md)。链接健康检查用 `scripts/check-showcase-links.mjs`（`pnpm check:showcase`）。

`examples/index.ts` 负责主页交互和 Hero 三维地球：

- 绑定锚点平滑滚动和顶部导航滚动状态。
- 调用 `mountFeaturedStrip()` 挂载首页社区案例精选条（空数据隐藏，语言切换重渲染）。
- 在 `#portal-globe-viewer` 中创建 `tellux.Viewer`。
- 使用 `examples/map-sources.config.ts` 配置示例 GIS 数据源，`examples/map-sources.ts` 据此生成 `exampleMapServiceConfig`。生产环境固定 `tianditu`；本地默认 `local`（ArcGIS 卫星影像 + Cesium Ion 地形），避免消耗天地图额度。改 `localMapSourceProfile` 可切换。走天地图时，`pnpm dev` 经 Vite 代理 `/tianditu-t/{n}` 转发到 `t{n}.tianditu.gov.cn`，并把 Referer 改写成 `TELLUX_TIANDITU_DEV_REFERER`（默认 `https://tellux.cyanfish.site/`）。密钥仍只放 `.env`。
- 开启云、大气、镜头光晕、SMAA 和曝光设置，让首页直接展示 Tellux 的渲染能力。

主页中的 viewer 会挂到 `window.viewer` 和 `window.portalViewer`，便于开发调试。页面卸载时调用 `viewer.destroy()` 释放资源。

## 项目文档页

项目文档页不在 `examples/` 下编写源码，而是由根目录 `docs/` 管理，使用 VitePress 构建。

核心配置在 `docs/.vitepress/config.ts`：

- `base: '/docs/'`
- `outDir: '../examples/public/docs'`
- 导航包含指南、API、能力参考和 Sandcastle。
- `command === 'serve'` 时，Sandcastle 链接指向开发服务器 `${TELLUX_EXAMPLES_ORIGIN || 'http://127.0.0.1:5173'}/sandcastle.html`。
- 构建后，Sandcastle 链接使用相对路径 `../../sandcastle.html`，从静态文档页跳回示例站点中的 Sandcastle。

`docs/` 应只保留面向用户的文档内容，例如：

- `docs/index.md`
- `docs/guide/`
- `docs/api/`
- `docs/capabilities/`

项目级备忘、调研记录、架构草稿和源码阅读笔记应放在 `notes/`，避免被 VitePress 当作用户文档页面收录或搜索。

## 项目 Sandcastle

Sandcastle 是一个可编辑、可运行示例的交互页面，设计上分成主应用和运行器两层：

- 主应用：`examples/sandcastle.html` 加载 `examples/sandcastle/app.ts`
- 运行器：`examples/sandcastle/runner.html` 加载 `examples/sandcastle/runner.ts`

主应用负责示例目录、代码编辑、运行控制和日志展示；运行器在 iframe 中执行用户当前代码，隔离页面重写和示例运行副作用。

### 示例注册

`examples/sandcastle/registry.ts` 通过 `import.meta.glob` 扫描 `examples/*.html` 和 `examples/*.ts` 的源码文本，并生成 Sandcastle 示例列表。

注册流程大致是：

1. 扫描 HTML 示例文件。
2. 排除 `index.html`、`sandcastle.html` 和 `gallery.html`（社区作品 gallery 页，不是可编辑示例）。
3. 从 HTML 中找到对应的 `<script type="module" src="...">`。
4. 读取同名 TypeScript 示例源码。
5. 移除原始 module script，生成可编辑的 HTML 内容。
6. 从标题、页面内容和脚本中推断分类、描述和标签。

`blank` 示例作为默认隐藏示例使用，不出现在普通示例列表中，但可作为 Sandcastle 初始空白场景。

新增普通示例时，通常只需要新增一组 `examples/<id>.html` 和 `examples/<id>.ts`，并在必要时更新：

- `examples/vite.config.ts` 的 `htmlInputs`
- `examples/sandcastle/registry.ts` 的分类、标题、描述或标签规则

### 编辑器主应用

`examples/sandcastle/app.ts` 是 Sandcastle 的主界面控制器，主要职责包括：

- 初始化 Monaco Editor。
- 管理 JavaScript 和 HTML 两个编辑 pane。
- 展示示例列表、分类、标签和搜索结果。
- 根据 URL query 中的 `example` 恢复指定示例。
- 将当前 HTML 和 JavaScript 打包成运行 payload。
- 创建或刷新 preview iframe。
- 接收 runner 通过 `postMessage` 发回的 console 日志和错误。

运行 payload 会优先存入 `localStorage`，再通过 `run` query 参数把 key 传给 runner。payload 过大或存储失败时，代码会退回到 URL payload 方式。主应用还会定期清理旧的 stored runs，避免 localStorage 无限膨胀。

### iframe 运行器

`examples/sandcastle/runner.ts` 只负责执行一次当前 payload：

- 从 URL query 或 localStorage 读取 `SandcastleRunPayload`。
- 把示例 HTML 写入当前 document。
- 将 `styles.css` 链接替换为内联样式，保证 iframe 内样式完整。
- 注入 `<base href="../">`，让相对资源路径按示例目录解析。
- 移除 HTML 中原本的 module script。
- 去掉示例脚本中的 ESM import/export 声明。
- 用 `new Function(...)` 注入 Tellux、Three.js、GLTFLoader 和共享示例工具后执行示例代码。
- 劫持 console，将日志通过 `postMessage` 发回主应用。

runner 注入的共享工具包括 `mountLocationReadout`、`setupExamplePanels`、`exampleMapServiceConfig`、`t` / `bootExampleI18n`、HISM demo helpers 等。新增被示例 `import` 的本地模块时，必须同步在 `runner.ts` 的 `new Function` 参数列表中注入，否则 Sandcastle 剥离 import 后会报 `ReferenceError`。

### 中英文切换（i18n）

示例站（主页 / Sandcastle / 独立示例）使用自研轻量 i18n，模块在 `examples/i18n/`：

- 语言：`zh` | `en`
- 解析优先级：`?lang=` → `localStorage['tellux.locale']` → `navigator.language` → 回落 `en`
- **壳 / HTML**：catalog key + `data-i18n*`（主页、Sandcastle UI、示例面板静态文案）
- **示例 TS**：优先内联双语 `t({ zh: "…", en: "…" })`，避免抽象 key 损害教程可读性；`t(key)` 仍可用于壳层
- 词典源：`examples/i18n/_messages.json`，用 `examples/i18n/_gen-messages.mjs` 生成 `messages/zh.ts` 与 `messages/en.ts`（服务 HTML / 壳 / registry）
- Sandcastle 切语言只刷新壳 UI 与 gallery；Monaco 源码不改写；重新 Run 后 runner 对 iframe DOM 再 `applyTranslations`
- VitePress 文档站本期不做双语；日后可复用同一 `tellux.locale` key

Tree、Gaussian Splat 与 HISM demo helpers 属于专用能力，不在 runner 基础依赖图中静态加载。[runtime-bindings.ts](../../examples/sandcastle/runtime-bindings.ts) 根据当前编译后源码实际使用的 binding 判定所需能力，runner 再通过动态 import 加载：

- `GaussianSplatPlugin` → `3d-tiles-rendererjs-3dgs-plugin`
- `Tree` → `@dgreenheck/ez-tree`
- HISM helper binding → `examples/hism/shared.ts`
- Water Area helper、默认参数和归一化函数 → `examples/water-area/sandcastleBindings.ts`

普通示例只加载 Tellux / Three.js 和通用 helper；专用依赖加载失败会进入 runner 现有的错误回传通道。新增专用注入能力时，应把同一领域的运行时值成组维护在 `*_RUNTIME_BINDING_NAMES` 与专用 re-export 模块中，并同步更新 binding 检测测试。只注入入口函数、遗漏示例导入的默认参数或 helper，会在 import 被剥离后产生 `ReferenceError`。

## 构建体积预算

根 [vite.config.ts](../../vite.config.ts) 与 [examples/vite.config.ts](../../examples/vite.config.ts) 使用同一套构建期预算插件。预算在本地 `pnpm build` / `pnpm build:examples` 中直接执行，不依赖 CI。

核心库与示例站使用不同口径：

| 范围 | 预算口径 | raw 上限 | gzip 上限 |
| --- | --- | ---: | ---: |
| 核心 `index.js` | 单一库入口 | 600 KiB | 160 KiB |
| 首页 | 入口及其静态 JS import 图 | 2.8 MiB | 800 KiB |
| Sandcastle 编辑器 | 入口及其静态 JS import 图 | 5.25 MiB | 1.35 MiB |
| Sandcastle runner | 入口及其静态 JS import 图 | 3 MiB | 800 KiB |
| Tree | 包含 `@dgreenheck/ez-tree` 的异步能力 chunk | 4.25 MiB | 3.2 MiB |
| Gaussian Splat | 包含 3DGS plugin / Spark 的异步能力 chunk | 5.5 MiB | 2 MiB |
| TypeScript worker | worker 文件 | 6.25 MiB | 1.6 MiB |
| Water Area worker | 水域 MVT 解码与遮罩栅格化 worker 文件 | 256 KiB | 80 KiB |
| editor worker | worker 文件 | 300 KiB | 100 KiB |

入口预算只递归静态 `imports`，不把 `dynamicImports` 计入首屏；异步重能力有独立预算。这样既能阻止普通入口意外吃进专用依赖，又不会用整个多页站点的总产物体积掩盖责任边界。

预算超过或目标产物缺失时构建直接失败。调整上限前必须先说明增长来自哪个领域能力，并在本节更新基线；不要只提高 Vite 的通用 chunk warning 阈值。

### 示例控件面板

有控件的示例页分两类：

- **Leva 面板**（`createTelluxPanel` + `leva-vanilla`）：schema 驱动案例（water-area、fly-to、atmosphere、ground-clamp、3d-tiles、entities、symbol、vegetation、horses 系列、terrain、data-sources、threejs-interop、hism-forest、hism-compare 等）；Tellux accent 见 `styles.css` 的 `#leva__root` 变量覆盖。
- **遗留 HTML 声明式 `.example-panel`**（`examples/example-panel.ts`）：仅保留折叠 helper，供尚未改完的页面或 Sandcastle runner 注入；独立示例页已迁到 Leva。

通用约定：

- 示例脚本入口对 HTML 面板调用 `setupExamplePanels()` 绑定折叠动画。
- 主题色走 `:root` 的 `--tellux-accent*` 变量；Sandcastle Run 按钮等同源。
- 不要再使用旧的 `.toolbar` / `.layer-manager` 外壳（图层列表内部仍可复用 `layer-manager__*` 条目样式）。

**leva-vanilla 示例面板（`examples/example-panel-leva.ts`）**：

- 使用 `leva-vanilla` 原生 GUI（`mountDOM`）+ schema / `effect()` 状态引擎。
- Tellux accent 主题在 `examples/styles.css` 通过 `--leva-colors-accent*` 覆盖，对齐 `:root` 的 `--tellux-accent*`。
- `createTelluxPanel(schemaFactory, options)` 为薄封装；`title` 可传函数；locale 变化时按 factory 重建面板并恢复控件值。
- 需要页面级错误/成功提示（类似 Element UI Message）时使用 `examples/example-message.ts` 的 `ExampleMessage.error()` 等；Sandcastle runner 已注入 `showExampleMessage` / `ExampleMessage`。
- `onRebuild` 在初次挂载与每次 locale 重建后调用，用于注册 `effect()` / DOM 监听；`statusPath` 配合 `setStatus()` 写入 `hint` 字段。
- 已迁移案例：`water-area`、`fly-to`、`atmosphere`、`ground-clamp`、`ground-clamp-polygon`、`google-photorealistic-3d-tiles`、`3d-tiles`、`point-cloud-3d-tiles`、`gaussian-splat-3d-tiles`、`3d-tiles-picking`、`entities`、`symbol`（`setupSymbolPanel.ts`）、`vegetation`、`instanced-horses`、`mixed-height-sampling-horses`、`terrain`、`data-sources`、`threejs-interop`、`hism-forest`、`hism-compare`。
- `threejs-interop` 使用 Littlest Tokyo 原生 glTF PBR / emissive 材质和 `light-source` 场景光照展示夜景 Bloom；默认时钟设为武汉当地夜间，面板同时控制 Bloom 参数与模型 `emissiveIntensity`，不要用额外灯光或替换材质伪造窗灯。
- 无独立控件面板的示例：`basic`、`webgpu-basic`（以及主页 / gallery / Sandcastle 壳）。
- Sandcastle runner 基线注入含 `createTelluxPanel`（`example-panel-leva.ts`）。
- 依赖：根 `package.json` 的 `devDependencies.leva-vanilla` 通过 `link:../leva-vanilla` 指向本地 fork；Vite alias 解析到源码。

**遗留 HTML 声明式 `.example-panel`**：`setupExamplePanels()` 仍注入 Sandcastle runner，供旧 HTML 结构兼容；独立示例页已不再依赖该样式。

runner 的 iframe 使用 `sandbox="allow-scripts allow-same-origin"`。它隔离了示例对 document 的重写，同时允许脚本运行和同源 localStorage 读取。

## 维护约定

新增示例页面时，优先保证独立 HTML 页面本身可以直接运行；Sandcastle 只是复用这些独立页面和脚本源码。

普通示例不要默认设置 `tellux.baseUrl`。Tellux 自身静态资源应优先使用包内置资源；只有专门验证 CDN、内网静态目录或非打包环境的资源覆盖路径时，才把资源放到 `examples/public/tellux/` 并临时设置 `tellux.baseUrl = '/tellux/'`。

示例源码是面向用户的 API 教程，不要为了减少重复把关键 Viewer 配置隐藏到默认 helper 里。比如默认 Cesium Ion 地形配置应在每个示例的 `new tellux.Viewer(...)` 附近显式写出 `terrain: { type: 'cesium-ion', assetId, apiToken, ... }` 的形状，让用户打开单个示例文件时能直接看懂配置结构。公共 `examples/shared.ts` 只适合放通用资源 URL、简单展示文案等不会遮蔽核心 API 的内容。

面向用户的教程、API 和能力说明放在 `docs/`；维护者备忘、调研资料和项目架构说明放在 `notes/`。

文档站点构建输出会进入 `examples/public/docs/`，不要手动编辑该目录下的生成内容。

仅调整 notes 文档时通常不需要运行 `pnpm type-check` 或 `pnpm build`。
