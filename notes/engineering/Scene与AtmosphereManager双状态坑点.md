# Scene 与 AtmosphereManager 双状态坑点

> 2026-09-06 复核范围：核对 applyAtmosphereState、manager 状态缓存及 syncMaterialEnvironment；修正“禁止缓存”的过强描述，保留环境贴图所有权条件。


本文记录 `Scene` 运行时控制对象和 `AtmosphereManager` 底层渲染管理器之间曾经存在的双状态风险。核心经验是：公开运行时控制层应该表达用户状态，渲染 manager 应通过 adapter 接收完整状态快照或明确 patch，而不是两个对象各自维护一套相似状态。

## 背景

Tellux 的大气能力横跨多个对象：

- `src/Scene.ts`：暴露 `viewer.scene.atmosphere` 运行时控制入口，面向用户表达大气、光照、散射、天空、云影等状态。
- `src/rendering/AtmosphereManager.ts`：封装 `AerialPerspectiveEffect`、`CloudsEffect`、`SunDirectionalLight`、`SkyLightProbe`、星空材质和大气 LUT 资源。
- `src/Viewer.ts`：组合根，负责把 `Scene`、`AtmosphereManager`、`PostProcessingManager` 等模块装配起来。

早期实现里，`Scene` 的控制类保存一份用户态，同时 `AtmosphereManager` 也暴露大量 getter/setter，并持有 `currentLightingMode`、`isSunLightEnabled`、`isSkyLightEnabled` 等运行时状态。字段较少时，这种 setter/apply 同步可以工作；但随着大气参数继续增加，双状态会变成长期维护风险。

## 现象

旧结构里同一类状态有多条同步路径：

- 大部分字段在 `viewer.scene.atmosphere.*` setter 中直接写入 `AtmosphereManager` 的对应 setter。
- `scattering.intensity`、`horizonBlend`、`horizonRange` 一度通过 `Viewer.render()` 每帧补同步到底层 uniform。
- `AtmosphereManager` 同时通过自己的 getter 反查底层 effect/light 状态，`Scene` 的 getter 又可能从 manager 读取值。

这会让代码表面上“能跑”，但实际很容易出现以下问题：

- 新增字段时漏掉某一条同步路径。
- getter 读到的是底层被 clamp 后的值，还是用户设置值，语义不稳定。
- 初始化应用、运行时 setter、每帧 render 补同步三者职责混在一起。
- `Scene` 和 `AtmosphereManager` 都像状态拥有者，边界不清晰。

## 根因

1. 把 manager setter 当成了状态同步边界。

   单字段 setter 适合封装局部底层副作用，但不适合作为跨模块状态协议。字段变多后，setter 调用点会分散到多个控制类和渲染循环里。

2. 用户态和底层实际态没有明确区分。

   `Scene` 面向用户，应该表达“用户希望的状态”；`AtmosphereManager` 面向渲染实现，应该负责把状态转换成 effect/light/uniform 的实际写入。旧结构让两边都保存相似状态，导致谁是事实来源不清楚。

3. 缺少完整快照或 patch 协议。

   当底层大气状态需要多字段共同决定时，例如光照模式同时影响后处理光照和 Three.js 光源可见性，用一组散落 setter 更容易产生中间态和遗漏。

## 当前修复策略

1. `Scene` 成为用户态的单一事实来源。

   `viewer.scene.atmosphere.*` 的 getter 只读 `Scene` 内部保存的用户状态，不再反查 `AtmosphereManager` 或底层 effect。

2. `AtmosphereSceneControls` 组装完整运行时快照。

   `Scene` 内部新增 `AtmosphereRuntimeState` 快照应用链路。大气、散射、天空、云影等控制项变更时，统一组装完整状态并交给 adapter。

3. `AtmosphereManager` 收敛为 adapter。

   `AtmosphereManager.applyAtmosphereState(state)` 负责把 Tellux 领域状态转换到底层对象：

   - `AerialPerspectiveEffect`
   - `SunDirectionalLight`
   - `SkyLightProbe`
   - `StarsMaterial`
   - shader patch uniforms
   - 大气散射系数 uniform

   manager 可以缓存已应用的 `currentLightingMode` 等值来驱动灯光和环境贴图。当前源码确有这类缓存；约束是用户态只由 Scene 控制、公开 getter 不反查底层，并非禁止 adapter 保存派生态。

4. 移除渲染循环补同步。

   `Viewer.render()` 不再负责每帧同步 inscatter 参数。参数变更时已经通过完整快照应用到底层，render 只负责渲染当前状态。

## 使用语义变化

公开使用方式不变：

```ts
viewer.scene.atmosphere.lighting.mode = 'post-process'
viewer.scene.atmosphere.scattering.intensity = 0.7
viewer.scene.atmosphere.sky.sun = true
viewer.scene.atmosphere.shadow.sampleCount = 8
```

需要注意的语义是：

- `viewer.scene.atmosphere.*` getter 表示用户设置值。
- 底层渲染仍可以在 `AtmosphereManager` adapter 内做 clamp、fallback、类型保护和 effect 适配。
- 如果需要暴露“底层实际值”或调试态，应设计单独的只读 debug/status API，不要让用户控制 getter 混合承担这个职责。

## 后续设计准则

- 运行时控制对象与 manager 之间保持单向应用协议；派生态缓存不应成为第二个可独立修改的用户状态源。
- 用户态归 `Scene` 或对应公开控制对象；底层实际态归 manager/effect，但不反向成为公开 getter 的事实来源。
- 新增大气字段时优先补 `AtmosphereRuntimeState` 和 `AtmosphereManager.applyAtmosphereState()` 映射，不要新增散落的 manager setter 同步调用。
- 如果未来某类状态变更频率很高，可以引入显式 patch，例如 `applyAtmospherePatch(patch)`，但 patch 的来源仍应是用户态控制对象。
- 不要把渲染循环当成状态同步兜底。render/update 适合推进时间、相机、资源和渲染，不适合补齐用户参数同步。
- 当一个 manager 需要读取多个字段共同决定底层行为时，优先使用快照、adapter、manager/facade 边界，而不是让多个 setter 互相隐式依赖。

## 保留 PBR 模型的共享环境贴图边界

`viewer.models.add({ materialMode: 'preserve' })` 会保留 glTF 的 PBR 与 emissive 材质。WebGL 的 `post-process` 光照不会给这些 PBR 材质提供常规 Three.js 光源，因此 `AtmosphereManager` 会在场景上临时安装由 `RoomEnvironment` 生成的共享 PMREM 环境贴图。

这份环境贴图属于 `post-process + preserve` 的适配资源，不能只根据“场景中存在 preserve 模型”启用。`Scene.environment` 对整个 Three.js 场景生效；如果在 `light-source` 模式仍保留它，地形和影像瓦片也会持续收到 IBL，出现太阳、天空光和 Ambient 全部关闭后夜间瓦片仍然明亮的假象。

当前约束是：

- 仅当光照模式为 `post-process` 且模型管理器请求保留材质光源（preserve 或 local 模型）时安装共享环境贴图。
- 切换到 `light-source` 时立即清理这份内部环境贴图，白天由太阳方向光照亮，夜间只保留真实 emissive 内容。
- 清理时只移除 `AtmosphereManager` 自己安装的纹理，并恢复此前的 `environmentIntensity`，不能覆盖应用自行设置的 `Scene.environment`。
- 排查“关灯后材质仍亮”时，除了枚举 `Light`，还必须检查 `Scene.environment`、材质 `envMap` 和 `lightMap`。

## 设计评审清单

新增或调整 `Scene` 与 rendering manager 交互前，至少检查：

1. 这个状态的单一事实来源在哪里？
2. getter 返回的是用户设置值，还是底层实际值？这个语义是否稳定？
3. 是否存在 setter 同步、初始化 apply、render 每帧补同步三条路径并存？
4. 新字段是否只需要补一处状态快照和一处 adapter 映射？
5. manager 缓存是否仅由快照应用派生，是否另有入口绕过 Scene 修改用户态？
6. 如果底层需要 clamp 或 fallback，是否只发生在 adapter 边界，而不是反向污染用户态？

## 相关文件

- `src/Scene.ts`
- `src/Viewer.ts`
- `src/rendering/AtmosphereManager.ts`
- `src/rendering/PostProcessingManager.ts`
