# 项目知识入口

`notes/` 保存维护者难以从代码可靠重建的理由、边界与排障证据；公开用法在 [docs](../docs/index.md)，应用代码写法在 [tellux skill](../.agents/skills/tellux/SKILL.md)。按任务读取下表对应记录，有未解问题再沿正文链接展开，无需预加载整个目录。

## 目录与归属

按记录的主要用途归类，混合用途由正文分节承载，不复制同一结论：

| 目录 | 收录内容 |
| --- | --- |
| `architecture/` | 当前职责、所有权、生命周期与实现链路 |
| `decisions/` | 已采纳选择的理由、取舍与重新评估条件，包括 ADR、Clock、稳定公开面和打包边界 |
| `engineering/` | 难以重建的根因、排障证据和工程陷阱 |
| `research/` | 外部依赖能力、版本调查与案例研究；包含的推测不因此成为事实 |
| `archive/` | 被取代的方案、旧评审和历史整改记录；保留独有理由与证据，不作为当前待办 |

行为契约继续在 `docs/api/`、`docs/guide/` 维护，不另建重复的 `spec/`。需要记录目的和范围时在现有主题中表达，暂不建立独立 `intent/`。目录是检索辅助，结论的状态与适用范围仍以正文证据为准。

## 按任务找知识

| 正在做什么 | 先读哪里 | 何时继续展开 |
| --- | --- | --- |
| 调整模块职责、装配或销毁 | [项目架构](architecture/项目架构.md) | 涉及具体渲染、采样或状态所有权时读对应专题 |
| 使用或修改公开 API | [0.3 迁移指南](../docs/guide/migration-0.3.md)、[API 文档](../docs/api/viewer.md) | 要理解舍弃旧 API 的理由时读 [稳定公开面设计背景](decisions/API稳定版设计决策.md) |
| 修改时间、Timeline 或昼夜联动 | [Clock 决策](decisions/Clock统一场景时钟.md) | 光照问题继续读 [光照指南](../docs/guide/lighting.md) 与下方渲染决策 |
| 排查高度结果、最高细节或卡顿 | [采样实现链路](architecture/sampleHeightMostDetailed实现链路.md) | 调度问题读 [采样抢占渲染](engineering/高度采样更新抢占渲染循环坑点.md) |
| 排查颜色、深度、大气、影像或精度 | [坑点入口](engineering/项目坑点记录.md) | 按症状选择专题，再核对实际 renderer、材质与输出路径 |
| Water Area 移动相机后缺水域或报 CORS | [新区域 MVT 加载排障](engineering/WaterArea新区域MVT加载503与CORS排查.md) | 先区分上游错误响应与跨域配置，再核对 Worker 请求、缓存及复现范围 |
| 修改 WebGPU 后处理组合 | [单一后处理图 ADR](decisions/0003-webgpu-post-processing-graph.md) | 再读 [渲染管线](../docs/design/rendering-pipeline.md) 与涉及的 effect 实现 |
| 审查统一场景、大气与透明合成重构 | [统一合成架构草案](decisions/统一场景渲染与大气透明合成架构.md) | 待审方案，非已采纳决策；先核对原型证据、云算法闸门和未决产品范围 |
| 验证空气与云重叠积分及上游源项 | [A1 首轮验证](research/A1联合介质积分验证.md) | 解析对照已通过，真实介质质量和性能尚未过闸门；附原始测量和复现脚本 |
| 修改点云颜色或局部灯光 | [点云显示色 ADR](decisions/0002-display-referred-point-cloud-colors.md)、[局部与地球光照 ADR](decisions/0004-local-vs-globe-lighting.md) | 结合对应坑点、当前材质与输出链核验 |
| 修改高亮 | [高亮指南](../docs/guide/highlight.md) | 只有追查后端选择理由时读 [0.2 高亮背景](archive/highlight统一高亮方案.md) |
| 修改主页、文档站或 Sandcastle | [examples 架构](architecture/examples文档与Sandcastle架构.md) | 社区案例布局理由见 [gallery ADR](decisions/0001-community-showcase-gallery-page.md) |
| 调整 external、peer 或发布面 | [打包策略](decisions/前置依赖打包策略备忘.md) | 核对 `package.json`、`vite.config.ts` 与打包检查，勿复用旧体积测量 |
| 评估上游能力或升级依赖 | 下方依赖调研入口 | 核对锁定版本与实际使用的子入口后，再读相关上游源码 |

## 依赖调研入口

高斯案例出现底图错缝、或升级 Spark / Three.js 时，先读 [Spark 纹理上传状态缓存冲突](engineering/Spark纹理上传状态缓存冲突.md)，区分 URL 索引、上传状态缓存与 Vite 预构建；仅在相应路径变化时展开源码及回归测试。

两份接入边界记录按当前本地源码与安装包作静态核对；另两份调研保留原版本与实验边界。上游具备能力不代表 Tellux 已公开支持；文中的“当前”“latest”、测试数量和性能数字只覆盖原记录基线。版本变更或用于新决策时局部复核，不能因打开过文档就更新验证日期。

- 3D Tiles：[接入边界](research/3d-tiles-renderer接入边界.md)：插件、影像叠加、采样与资源所有权。
- Takram：[接入边界](research/takram接入边界.md)：两个 renderer 的支持范围、资源加载和升级检查。
- 接入优先级：[2026-08-23 上游盘点](research/three-geospatial上游能力接入盘点.md)。其中 npm 和上游分支状态不是实时信息。
- Water Area：[案例调研与落地记录](<research/three-geospatial WebGPU Water Area案例调研.md>)。保留案例级边界、共享瓦片几何限制及未完成的视觉验收；不据此承诺公共水面 API。

## 历史记录：需要理由时再读

旧评审和被取代方案移入 `archive/`，项目内引用同步到新位置；仍影响当前选择的公开 API 设计理由留在 `decisions/`。原问题、取舍和验证证据仍有价值；原待办及优先级不能直接驱动新任务。项目外的旧链接未核查。

- [第一次架构债务清理](archive/第一次架构债务清理.md)：早期拆分理由，部分“现状”已失效。
- [2026-07-30 引擎健康诊断](archive/引擎健康诊断-2026-07-30.md)：`7a1695b` 基线及后续整改记录，不是当前健康证明。
- [引擎能力边界与依赖策略](archive/engine-ownership-and-dependency-strategy.md)：PositionPipeline、HISM 和 vendor 的设计背景；原实施计划不代表当前进度。
- [稳定公开面设计原稿](archive/API稳定版破坏式变更原稿.md)、[0.2 高亮方案](archive/highlight统一高亮方案.md)：历史方案与讨论证据；已采纳的 API 理由见 [设计决策](decisions/API稳定版设计决策.md)。原稿曾以 1.0.0 为发版目标，该口径已取消，实际随 0.3 发布。
- [本次知识重建记录](archive/2026-09-06-知识重建记录.md)：逐篇去向、删减依据和 Git 恢复位置。

## 维护方式

- 修改知识前先定位具体陈述：事实、观察还是假设；要求、已采纳决策还是建议。源码可证明实现，不能代替运行证据或自行取消产品要求。
- 更新已有主题，避免另写同义总结。公开用法在 `docs/` 维护，记录里用链接引用；临时进度不混入知识正文。
- 新增有价值记录时说明适用模块、版本或场景、结论与理由、证据位置、仍未知的部分，再接入本入口或相关专题入口。不要求套固定模板，也不创建空目录。
- 局部复核只更新对应结论的证据范围。旧测试、浏览器观察和性能测量保留原条件；验证通过记录不能用作下一版自动验收。
- 重复内容先合并独有理由，再改入链；失效内容退出当前路由。仍有复发价值或来源不明的记录保留并标明边界。物理删除前检查引用与保留要求；依靠 Git 恢复时应先确认内容已提交且能定位。
- 交付前检查修改的链接、替代关系与未知项。本入口不提供后台巡检，也不表示所有链接指向的正文已在同一天重新验证。

本次重建（2026-09-06）逐篇评估 36 份记录的剩余价值，对照 `e849525` 的源码修订架构、采样契约和部分过期陈述，并检查本地 Markdown 文件链接；未重新执行历史运行实验或验证远程资料。
