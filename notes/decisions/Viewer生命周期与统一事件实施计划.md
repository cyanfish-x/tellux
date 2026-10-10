# Viewer 生命周期与统一事件实施计划

> 2026-10-10：用户已确认设计方向，当前仅保存计划与此前已完成的优化。下文生命周期 API 尚未实现，不属于当前 0.3 的可用 API；此记录不安排 npm 发版。后续实施完成后再更新公开文档。

## 目标与已确认决策

首页目前在两次 requestAnimationFrame 后结束 loading，这个时间点无法证明地球所需资源已经就绪。目标是让应用通过 Viewer 生命周期准确关闭 loading，并提供同一个入口处理交互、帧阶段、错误与销毁。

已确认：

1. 使用 Mapbox 风格的 `viewer.on / once / off`，现有 `click / mousemove` 进入同一套强类型事件映射。
2. 删除公开的 `viewer.ready` Promise 属性；渲染器的异步初始化继续由内部负责。只移除 Viewer 上的属性，模型句柄 `ModelLayer.ready` 等其他领域 API 不在本次范围内。
3. `ready` 事件表示渲染器初始化完成；`load` 表示当前视角必要资源就绪并完成首次绘制。两者各触发一次，保持独立语义。
4. 使用 Cesium 风格的帧阶段：`preUpdate / postUpdate / preRender / postRender`。
5. 新增 `viewer.when('ready' | 'load')` 等待生命周期里程碑，不另加 `whenLoaded()`。它与事件使用同一份状态，阶段已完成时立即返回，阶段失败或完成前销毁时拒绝。
6. `on / once` 只监听注册后的通知，不补发历史事件。`ready` 通知安排在构造函数返回后，确保 `new Viewer()` 后可以注册监听。
7. `Viewer.create()` 继续等待初始化完成，失败时自动清理；不等待首次画面。手动渲染模式需要先取得实例再驱动帧，否则等待 `load` 会互相阻塞。
8. 首版包括 `error / destroy`。`idle` 和运行时资源加载进度留待后续设计，不把持续自转结束作为首页显示条件。

上述 `.ready` 移除属于公开 API 的破坏式变更，需要迁移说明；具体发布版本另行决定。

## 拟议公开形状

以下是实施目标，当前代码尚不支持：

```ts
const viewer = new Viewer(container, options);

viewer.on('ready', () => {
  // 渲染器初始化完成，可以开始手动渲染。
});
viewer.once('load', () => {
  // 当前视角必要资源就绪且完成首次绘制，关闭 loading。
});
const updateAnimation = (event: ViewerEventMap['preUpdate']) => {
  // 使用 event.deltaTime 更新自转或场景动画。
};
viewer.on('preUpdate', updateAnimation);
viewer.on('error', (event) => {
  // 根据阶段和是否致命显示错误或降级结果。
});

await viewer.when('ready');
await viewer.when('load');

viewer.off('preUpdate', updateAnimation);
viewer.destroy();
```

`when` 首版只接受一次性里程碑 `ready / load`，不用于持续帧事件。具体返回类型、链式返回与错误字段在阶段一明确，并补中英双语 JSDoc。

| 事件 | 条件 | 频率 |
| --- | --- | --- |
| `ready` | 渲染器初始化成功，Viewer 可以驱动渲染 | 一次 |
| `load` | 当前视角必要资源达到就绪条件，并完成包含它们的绘制 | 一次 |
| `preUpdate` | 开始本帧场景更新前 | 每个有效帧 |
| `postUpdate` | 本帧场景更新完成 | 每个有效帧 |
| `preRender` | 开始实际绘制前 | 每个实际绘制帧 |
| `postRender` | 主场景、后处理及符号合成绘制完成 | 每个实际绘制帧 |
| `error` | 初始化、必要资源加载或渲染发生错误 | 按错误发生 |
| `destroy` | 停止循环并完成资源清理 | 一次 |

正常帧顺序为：`preUpdate → 场景更新 → postUpdate → preRender → 绘制与合成 → postRender`。`load` 在满足条件的首次 `postRender` 后通知。渲染方法返回只证明 CPU 侧绘制提交完成，不保证 GPU 已完成或浏览器已经把 Canvas 合成到屏幕。

## 现状与代码入口

2026-10-10 静态核对：

- [Viewer](../../src/Viewer.ts)：组合根；当前 `ready` 直接引用 renderer adapter 的 Promise；`on / off` 委托交互管理器；`renderFrame()` 包含更新、主绘制与后合成符号；`destroy()` 负责释放资源。
- [事件类型](../../src/types/events.ts)：目前只有 `click / mousemove`；事件基础字段为 `type / viewer`。
- [交互管理器](../../src/controls/ViewerInteractionManager.ts)：目前持有监听表，并按鼠标监听数量避免无用拾取；迁移时保留这一优化。
- [渲染循环](../../src/rendering/ViewerRenderLoop.ts)：默认循环与手动渲染的统一入口；高度采样另有调度，不能把采样预加载误算为首页资源未完成。
- [renderer adapter](../../src/rendering/RendererAdapter.ts)：WebGL 初始化立即完成，WebGPU 异步 `init()`；内部初始化 Promise 可以保留。
- [资源生命周期](../../src/lifecycle/ResourceLifecycle.ts)：`Viewer.create()` 当前通过 `awaitReadyOrDestroy` 读取公共 `.ready`；移除后需要调整调用方式，保留失败清理与原始错误。
- [瓦片管理器](../../src/tiles/TilesetManager.ts)：地球、影像和场景 3D Tiles 的接入与更新入口，需要核实实际依赖版本中的可视瓦片就绪信息。
- [大气管理器](../../src/rendering/AtmosphereManager.ts)、[WebGPU 大气](../../src/rendering/WebGPUAtmosphereManager.ts)：纹理与散射数据初始化目前不能简单等同于 renderer 初始化。
- [首页](../../examples/index.ts)：loading 使用两次 rAF；后续改成依据 `load`，并处理错误和页面卸载。

维护者背景见 [项目架构](../architecture/项目架构.md)、[examples 架构](../architecture/examples文档与Sandcastle架构.md)。

## 首次 load 判定：必须先核实的边界

原则已确认：判断当前视角与当前精度需要的资源，不等待整个地球、最高层级或所有未来资源。不能仅凭 renderer ready、任意一次 render 或全局网络队列为空发出 `load`。

具体接入点和纳入范围仍需在实施前核实：

- 地形与可见影像：下载结束之后，还需要检查解析、处理与可渲染状态；祖先瓦片兜底是否满足首次可用画面，需要明确契约。
- 大气：启用时所需散射数据必须完成；星空、共用 STBN 的必要性按实际渲染路径核实。
- 云：关闭时不计入就绪依赖。开启时参考当前四张按需贴图状态，不能重新引入无条件预加载。
- 场景 3D Tiles / 模型：明确首次绘制前已添加的可见内容是否阻塞 `load`，不要隐式等待后来添加的内容或整套数据集。
- 首帧着色器编译与纹理上传：若需要预热，必须按实际后端能力实施与验证；单纯添加生命周期不会消除这些耗时。
- 首次加载期间相机或效果配置改变：按实际待绘制视角重新检查资源；不能复用已经失效的就绪快照。
- 必要资源失败：决定致命失败与可降级失败的边界；停止无限等待，报告错误。降级条件和错误 payload 在本阶段明确，不在这里提前宣称已有实现。

优先建立内部、可测试的资源就绪摘要；避免把 Three.js LoadingManager 的“请求结束”直接当作 Viewer 首次画面完成。

## 实施顺序

### 阶段一：统一事件与初始化里程碑

- [ ] 明确事件 payload（公共字段、帧时间、错误阶段与 fatal），`when` 的返回与拒绝契约。
- [ ] 新建由 Viewer 持有的强类型事件分发器，统一 `on / once / off`；保留鼠标拾取的按需行为。
- [ ] 维护 `ready / load` 的完成、失败状态与等待者，避免监听器和等待者泄漏。
- [ ] 移除公开 `.ready`，接入 `ready` 事件及 `when('ready')`。
- [ ] 保留 `Viewer.create()` 等待初始化、失败清理的行为，调整辅助函数调用。
- [ ] 明确监听器异常、回调中销毁及重复销毁的处理；保证不会递归发出错误或销毁事件。

### 阶段二：帧阶段与销毁

- [ ] 在自动与手动渲染共用路径接入四个帧事件。
- [ ] `preUpdate` 放在 Clock、controls、动画与瓦片更新前；`postRender` 放在符号后合成之后。
- [ ] 初始化未完成、已销毁或没有执行绘制时，不虚构成功帧事件。
- [ ] 销毁时停止循环、拒绝尚未完成的里程碑等待者，完成清理后发出 `destroy`，最后清空监听器。
- [ ] 验证异步初始化与资源回调在销毁后不会继续产生生命周期事件。

### 阶段三：首次画面就绪

- [ ] 核实上节资源边界与 3d-tiles-renderer 当前锁定版本能力。
- [ ] 聚合当前视角的必要资源状态，在成功绘制后判断 `load`。
- [ ] 保证 `load` 一次性；相机移动与后续资源更新不重复触发。
- [ ] 处理必要资源失败、动态移除、切换效果和视角变化。
- [ ] `when('load')` 在事件之后调用立即返回，失败或完成前销毁则拒绝。

### 阶段四：首页接入与公开文档

- [ ] 首页用 `load` 结束 loading，替换两次 rAF 的时间猜测；补错误反馈与卸载清理。
- [ ] 需要统一驱动首页自转时，迁移到 `preUpdate`，避免另一条动画循环。
- [ ] 更新 `docs/api/viewer.md`、`docs/guide/viewer.md`、renderer 使用说明与迁移说明。
- [ ] 同步 `README*.md`、`.agents/skills/tellux/`、公开导出及架构说明；当前计划中的 API 示例不要提前写成已发布能力。

## 验收与验证

- 事件订阅顺序、重复订阅、`once` 在回调重入前移除、`off` 取消和监听清理。
- WebGL 快速初始化与 WebGPU 异步初始化：构造后注册可收到 `ready`；迟到等待不会挂起；失败保留原始错误。
- 自动与手动渲染时序一致；手动模式 `Viewer.create()` 可以返回，首次绘制后才可能达到 `load`。
- 资源未完成时不发 `load`，成功绘制就绪画面后只发一次；云关闭不阻塞，后续运行时加载不重发。
- 初始化中销毁、资源加载中销毁、回调中销毁、重复销毁：等待者正确结束，晚到回调不再使用已释放对象。
- 运行 `pnpm type-check` 和相关回归测试；修改公开导出后运行 `pnpm build`，首页接入后运行 `pnpm build:examples`。
- 浏览器验证需要用户明确要求后执行，检查 WebGL / WebGPU、慢网络、请求失败、手动循环和首页实际显示。性能改善需测量，不能用单元测试或生命周期定义替代。

## 换电脑接续上下文

这部分记录本次工作状态，不代表生命周期已实现。

已完成并随本次交接提交：

1. 首页瓦片方案：经用户后续确认采用第一版，首页改用随站点提供的 `/blue-marble/{z}/{x}/{y}.jpg`，z0–z1 共 10 张 JPEG，总计 114,231 字节。`data.cyanfish.site` 仍是用户自有资源源站；此项只让首页避开远端代理的 502 / 响应中断，没有修改云服务器或 Cloudflare 配置。
2. WebGL 云贴图按需加载：仅延迟天气、湍流、形状、细节四类贴图；云效果对象仍在初始化时创建，共用 STBN 正常加载。大气与云同时开启、散射纹理就绪后请求，进行中及成功项复用，失败项在再次开启时重试；销毁后忽略晚到结果，3D 请求可中止。
3. 本文设计已确认，所有生命周期实施清单尚未完成；不要将其误读为代码已落地。

代码检查点：`f73add1`（云贴图按需加载）、`0024fee`（首页静态瓦片）。当前分支还包含此前的 `7b090f5`（首页默认视角切换），一起同步到远端；计划本身另作文档提交。

此前本会话验证记录（本次只保存文档和提交，没有重新跑这些验证）：

- 首页瓦片修改：type-check、13 项相关测试、`build:examples` 通过；当时开发与预览的 10 张瓦片均返回 HTTP 200，响应字节与本地文件一致。
- 云贴图修改：type-check 通过；包括新增 9 项云贴图测试在内的 5 个相关测试文件、共 30 项测试通过。没有进行浏览器性能测量。
- 上述结果仅覆盖当时源码与环境；换电脑继续修改后按本次改动范围重新验证。

当前分支 `dev`，远端 `origin` 为 `git@github.com:cyanfish-x/tellux.git`。换电脑先确认本地无未保存改动，再切换并同步 `dev`、执行 `pnpm install --frozen-lockfile`。若另一台电脑有分叉或未提交内容，先检查，保留各自工作后再合并。

接续建议：先读本文与根目录 `AGENTS.md`，从阶段一开始实施；首轮不重新排查 Cloudflare、Browser 插件或改写云按需加载范围。用户曾明确要求排查和设计阶段不要直接改源码；本文交接任务本身只写计划并提交，后续实现需要新的执行指令。

## 参考依据

- Three.js：[LoadingManager](https://threejs.org/docs/pages/LoadingManager.html)、[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)：资源加载、预编译和绘制是分离的能力。
- Cesium：[Scene](https://cesium.com/learn/cesiumjs/ref-doc/Scene.html)、[Globe](https://cesium.com/learn/cesiumjs/ref-doc/Globe.html)、[Cesium3DTileset](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html)：四阶段帧事件、当前视角瓦片就绪、首次所需瓦片完成。
- Mapbox：[事件定义](https://github.com/mapbox/mapbox-gl-js/blob/main/src/ui/events.ts)、[Map 实现](https://github.com/mapbox/mapbox-gl-js/blob/main/src/ui/map.ts)：统一事件入口，首次完整画面的 `load` 与运行时 `idle` 分开。引用用于设计理由，不表示 Tellux 已实现对应能力。
