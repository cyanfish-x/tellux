# WebGPU 水域外观第一阶段任务清单

配套计划：[`tasks/plan.md`](plan.md)

## Task 1：ENU 波纹坐标验证

- [x] 在固定案例中心建立 ENU frame。
- [x] 使用 camera-relative/view-space 路径生成米制波纹坐标。
- [ ] 验证相机静止、移动、缩放时 phase 不游动。
- [ ] 验证 tile 边界和 LOD 切换没有相位接缝。
- [x] 运行 `pnpm type-check`。

## Task 2：双尺度动态法线与 PBR 外观

- [x] 固定并本地化 Three.js r184 Water2 双法线纹理，记录来源、许可证链接和校验值。
- [x] 实现两套尺度、方向、速度和相位的 normal 采样。
- [x] 在 ENU 切平面合成法线并转换到 view space。
- [x] 按 Water Area Mask 与椭球法线混合。
- [x] 增加远距离高频衰减。
- [ ] 确认现有 IOR/roughness/AtmosphereLight 能产生可接受的 Fresnel 和太阳高光。
- [x] 确认 `show = false` 一并关闭颜色、波纹和水域高光贡献。

## Task 3：共享 appearance 状态

- [x] 定义案例级 `WaterAreaAppearance` 参数和默认值。
- [x] 为所有运行时参数使用共享 TSL uniforms。
- [x] 对数值、范围和颜色输入进行归一化。
- [x] 让 `createWaterAreaDemo({ appearance })` 与 `demo.appearance` 同构。
- [x] 保证已加载和新加载材质共享同一状态。
- [x] 补充运行时修改和共享状态单元测试。
- [x] 运行 `pnpm test:run -- examples/water-area`。
- [x] 运行 `pnpm type-check`。

## Checkpoint A：材质链路

- [ ] ENU 波纹坐标稳定。
- [ ] 双尺度 normal 无 tile 接缝。
- [x] 现有 Mask、8 Worker、LIFO 和 cache 路径没有变化。
- [x] 聚焦测试与类型检查通过。

## Task 4：通用参数面板

- [x] 保留 Cesium Ion Token 输入框和 Enter 重载语义。
- [x] 将显隐文案调整为“显示水域外观”。
- [x] 增加水色、颜色混合和粗糙度控件。
- [x] 增加波浪强度、尺度、速度和方向控件。
- [x] 控件直接更新 uniforms，不重载 tileset。
- [x] Token 重载后保留当前 appearance 状态。
- [x] 同步 `examples/i18n/_messages.json`。
- [x] 重新生成中英文词典。
- [ ] 在独立示例和 Sandcastle 中检查通用面板。

## Task 5：完整验收

- [x] 运行 `pnpm test:run`。
- [x] 运行 `pnpm type-check`。
- [x] 运行 `pnpm build:examples`。
- [x] 运行 `git diff --check`。
- [ ] 检查默认、斜视、近景和相机运动四类视觉场景。
- [ ] 检查桥梁、码头、水坝和陆地没有水外观污染。
- [ ] 检查 LOD 切换、显隐和 Token 重载无状态滞留。
- [x] 确认没有新增 Worker、render pass、RenderTarget、draw call 或独立循环。
- [ ] 完成相同设备、分辨率、镜头下的基线/增强版 60 秒采样。
- [ ] 确认增强版 P95 帧时间增幅不超过 10%。
- [ ] 记录固定镜头、近景截图和控制台结果。
- [ ] 将最终实现、默认参数、性能和已知限制回填到 Water Area 调研文档。

## 完成条件

- [ ] 水域具有连续、稳定、可调的动态外观。
- [ ] 视觉、性能、生命周期和构建预算全部通过。
- [ ] 当前实现仍位于 `examples/`，未提前形成 Tellux 公开 API。
