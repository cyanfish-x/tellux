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
- `basic.html`、`terrain.html`、`3d-tiles.html` 等：独立示例页。
- `sandcastle.html`：Sandcastle 编辑器页面。
- `sandcastle/runner.html`：Sandcastle iframe 运行页面。

示例代码默认从 `../src` 引入 Tellux，而不是从 `dist` 引入。这样开发示例可以直接验证源码行为，适合作为库功能开发时的反馈面。

`examples/public/` 是示例站点的静态资源根目录：

- `examples/public/draco/` 存放 Draco 解码器资源。
- `examples/public/docs/` 是 VitePress 文档的构建输出目录。

Tellux 自身的云、STBN、星空等运行资源默认从源码内置资源模块进入 Vite 依赖图，不再通过
`examples/public/tellux/` 和 `tellux.baseUrl = '/tellux/'` 作为示例默认路径。

## 项目主页

项目主页由 `examples/index.html` 和 `examples/index.ts` 组成，主要目标是给访问者一个产品级第一印象，而不是只展示示例列表。

`examples/index.html` 负责页面结构和文案：

- 顶部导航包含 Tellux 品牌、能力、工作流、Sandcastle 和 GitHub 入口。
- Hero 区域展示 Tellux 的定位：基于 Three.js 的 3D Earth Engine。
- 页面中部介绍地球与相机、多源影像图层、3D Tiles、Cesium 地形、大气云和工程默认值。
- 后续展示真实地形、大气和体积云效果素材。

`examples/index.ts` 负责主页交互和 Hero 三维地球：

- 绑定锚点平滑滚动和顶部导航滚动状态。
- 在 `#portal-globe-viewer` 中创建 `tellux.Viewer`。
- 使用天地图卫星影像 XYZ 瓦片（`examples/shared.ts` 中的 `tiandituImageryXYZUrl`）作为默认影像底图。
- 如果配置了 `VITE_CESIUM_TERRAIN_URL`，则加载 Cesium quantized-mesh 地形。
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
2. 排除 `index.html` 和 `sandcastle.html`。
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

runner 注入的共享工具包括 `mountLocationReadout`、`setupExamplePanels`、`exampleMapServiceConfig`、HISM demo helpers 等。新增被示例 `import` 的本地模块时，必须同步在 `runner.ts` 的 `new Function` 参数列表中注入，否则 Sandcastle 剥离 import 后会报 `ReferenceError`。

Tree、Gaussian Splat 与 HISM demo helpers 属于专用能力，不在 runner 基础依赖图中静态加载。[runtime-bindings.ts](../../examples/sandcastle/runtime-bindings.ts) 根据当前编译后源码实际使用的 binding 判定所需能力，runner 再通过动态 import 加载：

- `GaussianSplatPlugin` → `3d-tiles-rendererjs-3dgs-plugin`
- `Tree` → `@dgreenheck/ez-tree`
- HISM helper binding → `examples/hism/shared.ts`

普通示例只加载 Tellux / Three.js 和通用 helper；专用依赖加载失败会进入 runner 现有的错误回传通道。新增专用注入能力时，应同时更新 binding 检测测试，避免重新扩大所有 Sandcastle 运行的首屏依赖图。

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
| editor worker | worker 文件 | 300 KiB | 100 KiB |

入口预算只递归静态 `imports`，不把 `dynamicImports` 计入首屏；异步重能力有独立预算。这样既能阻止普通入口意外吃进专用依赖，又不会用整个多页站点的总产物体积掩盖责任边界。

预算超过或目标产物缺失时构建直接失败。调整上限前必须先说明增长来自哪个领域能力，并在本节更新基线；不要只提高 Vite 的通用 chunk warning 阈值。

### 示例控件面板

有控件的示例页统一使用 `.example-panel`（`examples/example-panel.ts` + `styles.css`）：

- HTML 声明式结构：标题栏折叠按钮 + 可折叠 `details.example-panel__folder` 分组。
- 示例脚本入口调用 `setupExamplePanels()` 绑定折叠动画。
- 主题色走 `:root` 的 `--tellux-accent*` 变量；面板主按钮与 Sandcastle Run 按钮共用。
- 不要再使用旧的 `.toolbar` / `.layer-manager` 外壳（图层列表内部仍可复用 `layer-manager__*` 条目样式）。

runner 的 iframe 使用 `sandbox="allow-scripts allow-same-origin"`。它隔离了示例对 document 的重写，同时允许脚本运行和同源 localStorage 读取。

## 维护约定

新增示例页面时，优先保证独立 HTML 页面本身可以直接运行；Sandcastle 只是复用这些独立页面和脚本源码。

普通示例不要默认设置 `tellux.baseUrl`。Tellux 自身静态资源应优先使用包内置资源；只有专门验证 CDN、内网静态目录或非打包环境的资源覆盖路径时，才把资源放到 `examples/public/tellux/` 并临时设置 `tellux.baseUrl = '/tellux/'`。

示例源码是面向用户的 API 教程，不要为了减少重复把关键 Viewer 配置隐藏到默认 helper 里。比如默认 Cesium Ion 地形配置应在每个示例的 `new tellux.Viewer(...)` 附近显式写出 `terrain: { type: 'cesium-ion', assetId, apiToken, ... }` 的形状，让用户打开单个示例文件时能直接看懂配置结构。公共 `examples/shared.ts` 只适合放通用资源 URL、简单展示文案等不会遮蔽核心 API 的内容。

面向用户的教程、API 和能力说明放在 `docs/`；维护者备忘、调研资料和项目架构说明放在 `notes/`。

文档站点构建输出会进入 `examples/public/docs/`，不要手动编辑该目录下的生成内容。

仅调整 notes 文档时通常不需要运行 `pnpm type-check` 或 `pnpm build`。
