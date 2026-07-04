# 更新日志

本项目所有重要变更均记录于此文件。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.8] - 2026-07-04

### Added
- 实现 SymbolEntity 基本渲染
- 实现贴地多边形功能及案例
- 完成 Entity-gpu 贴地线功能
- 实现 entity 拾取优化，对于点、线实体增加容差拾取功能
- 完成 webgpu 基础瓦片地球渲染案例
- webgpu 渲染模式下添加大气效果
- 实现 entity 点线面矢量绘制功能
- 抽取相机运行时配置，可配置开启允许相机穿地
- 添加 ez-tree 集成案例

### Changed
- SymbolEntity 渲染管线优化，修复文字看上去糊、不清晰的问题
- 调整 toneMappingExposure 默认值，从 10 调整到 5

### Fixed
- 修复 SymbolEntity 锚点遮挡失效与 Symbol 案例 Effect 后处理失效的问题
- 优化 GlobeControl 相机交互逻辑，解禁 pitch 限制可以看向天空，并增加安全值回弹以解决看向天空后无法返回俯视视角的问题
- 参考 CesiumRTC 思路，修复程序化植被森林模型在大坐标下精度抖动问题
- 实现实体绘制 Pass 优化，修复透明实体深度排序乱跳的 bug
- 修复多边形绘制 fill 配置未生效的 bug
- 修复实体颜色被色调映射压扁导致偏色的 bug
- 修复时间条控件 spring 缓动效果导致 input 不跟手丢失的 bug
- 修复 webgpu 渲染模式下，地形开启时影像层级与相机高度对应不正确的 bug
- 修复 light-source 下，地球材质异常导致反射太阳光的 bug
- 修复主站点部署后文档页资源请求 404 报错的 bug
- 修复打包报错

## [0.1.7] - 2026-06-25

### Added
- 支持 Cesium Ion 地形
- 增加大气夜间光照系统与月光效果
- 支持 post-process 下保留 glTF 模型自带材质
- 瓦片材质支持运行时根据光照模式自动切换
- 增加 3dTiles 模型拾取与属性弹窗案例
- 添加高斯泼溅案例
- Viewer 初始化增加 id 字符串支持
- 添加文档页面

### Changed
- 预编译静态纹理加载方式优化，现代打包器改为零配置加载；同时保留配置可覆盖默认路径
- 默认光照模式改为 post-process
- widget 配置重构：删除 viewer 中被弃用的旧 widget 配置，新配置改为 widgets
- 增强高度采样健壮性

### Fixed
- 修复 flyToTarget 事件监听未正确卸载的 bug
- 修复瓦片材质不匹配 lightModel 的 bug
- 修复后处理模式下 3dtiles Pick 高亮效果渲染问题（临时改为 light-source 模式规避）

## [0.1.6] - 2026-06-08

无显著用户可见变更（快速修正发布）。

## [0.1.5] - 2026-06-08

### Added
- 添加 sandcastle（沙盒在线编辑器）
- 添加 3dtiles、地形混合场景高度采样案例；混合场景下高度采样性能优化

### Changed
- 高度采样性能优化，1000 个点采样时间从 4 秒优化到 0.2 秒

### Fixed
- 修复 threejs 模型加载案例单点高度采样不准确的 bug
- 修复 sandcastle 报错

## [0.1.4] - 2026-06-08

### Added
- 封装高度采样 API
- 添加 gltf 模型加载接口、示例、文档

### Changed
- 初始化时的图层配置方式优化

### Fixed
- 优化高度采样影响主渲染进程的 bug，改为 pass 异步采样

## [0.1.3] - 2026-06-07

无显著用户可见变更。

## [0.1.2] - 2026-06-07

内部变更：部署脚本更新（无用户可见变更）。

## [0.1.1] - 2026-06-07

首个发布版本。

### Added
- 大气散射效果：支持开关、参数调节、关注区域通透度
- 封装 flyToTarget 方法，支持传入 offset 参数控制看向目标的视角
- 设置面板：分组折叠、UTC 时间/dayOfYear 设置、更多大气参数
- 增加弹簧控制和云速调节
- 图层架构重构与数据源切换案例
- 默认开启星空

### Changed
- 光照架构优化，改由 takram 库提供
- 大气散射效果优化，增加关注区域通透度

### Fixed
- 修复 imageryLayer 瓦片请求层级受 terrainRange 限制的 bug
- 修复图层显隐藏控制时重新渲染所有图层的 bug
- 修复点击事件示例没有底图的 bug

[Unreleased]: https://github.com/cyanfish-x/tellux/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/cyanfish-x/tellux/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/cyanfish-x/tellux/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/cyanfish-x/tellux/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/cyanfish-x/tellux/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/cyanfish-x/tellux/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/cyanfish-x/tellux/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/cyanfish-x/tellux/releases/tag/v0.1.1
