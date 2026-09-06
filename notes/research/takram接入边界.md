# Takram 接入边界

> 2026-09-06 对照当前声明、WebGL / WebGPU manager、资源模块和后处理 stage 静态核对。以下只说明项目接入与升级风险；未重新验证历史性能、视觉结果或远程分支状态。

## 包与后端不要混为一谈

当前声明：core `0.9.1`、atmosphere `0.19.1`、clouds `0.7.6`、effects `0.6.4`。相同包中普通入口与 `/webgpu` 的能力并不对等。

| 领域 | Tellux 当前接入 | 关键边界 |
| --- | --- | --- |
| 地理基础 | core 的 STBN 加载；WebGPU 的高精度速度与 LensFlare 节点 | 相机 / 拾取的椭球来自 3d-tiles-renderer，大气使用 Takram 上下文；对外仍用 `LonLat*` 普通数据，避免两套第三方坐标类型扩散 |
| WebGL 大气 | `AtmosphereManager`：LUT、AerialPerspectiveEffect、太阳/月亮、光源、星空 | `post-process` 重建地表光照，`light-source` 保留场景已着色结果；不能重复照明 |
| WebGL 云 | CloudsEffect 经大气合成 overlay / shadow / shadowLength | 云影作用于地表依赖大气后处理光照，普通 Three.js 光源不会自动采样体积云阴影 |
| WebGPU 大气与星空 | `WebGPUAtmosphereManager`：AtmosphereContext、AtmosphereLight、SkyNode、StarsNode 与空气透视 | 星空已接入，体积云仍未接入；不能沿用早期“WebGPU 星空不渲染”的说明 |
| WebGL 后处理 | PostProcessingManager 中的 LensFlareEffect、DitheringEffect；SMAA 来自 postprocessing | 对外入口为 `viewer.postProcess`，不再是 `viewer.scene.postProcess` |
| WebGPU 后处理 | 共享图中的 Bloom、LensFlare、TAA | LensFlare order 100、TAA order 200；TAA 声明 velocity MRT 并管理 history；共享图不意味着 WebGL pass 自动兼容 |

当前能力限制以 [限制指南](../../docs/guide/limitations.md) 为入口。R3F 组件不是 Tellux 的 vanilla Viewer 接入层；上游类型和 Storybook helper 不能直接成为公共契约。

## 资源与状态所有权

大气、云、星空参数的用户态归 Scene；manager 可缓存应用后的值以驱动底层对象，不能让公开 getter 反向读取已 clamp 的底层值。细节见 [状态所有权](../engineering/Scene与AtmosphereManager双状态坑点.md)。

`src/assets.ts` 提供包内置天气、湍流、shape、shapeDetail、STBN 和星表 URL；`getTelluxAssetUrl(assetName)` 默认使用内置 URL，配置 `telluxConfig.baseUrl` 才按固定文件名覆盖。旧文档的“默认从 GitHub media 下载”不再描述 Tellux 默认行为。

WebGL 的 `PrecomputedTexturesGenerator` 生成大气 LUT，`AtmosphereTextureLoader` 管理额外纹理加载和失效处理。WebGPU 星空加载内置星表后替换 SkyNode 默认星表节点，并释放旧节点。取消、异步返回后的销毁状态与纹理释放需一起检查，不能只验证初次加载。

云质量 preset 先应用，随后 `applyCloudAppearanceState` 应用用户外观覆盖，否则改质量会悄悄重置用户参数。低云层组映射前两层，不等于公开任意 CloudLayer 数组。层数、噪声格式、纹理尺寸与采样边界从已安装上游实现查，不维护重复参数目录。

## 不能丢失的升级理由

- 当前本地 `@takram/three-atmosphere@0.19.1` 已导出 `LightingMaskPass`，类型也有 `lightingMask` 属性（2026-09-06 已用 Node ESM 导入核验）。Tellux 尚使用自己的 [LightingMaskPass](../../src/rendering/LightingMaskPass.ts) 与 shader patch。见 [局部光照决策](../decisions/0004-local-vs-globe-lighting.md)，1=globe、0=local 的方向不能接反。
- 后处理输出把点云显示色、局部模型 radiance 和地表 albedo 当同一种颜色，会造成洗白或夜间灯光被抹掉。升级必须保留 [点云输出边界](../decisions/0002-display-referred-point-cloud-colors.md)，不能靠材质 `toneMapped=false` 推断最终输出豁免。
- [WebGPU 单一后处理图](../decisions/0003-webgpu-post-processing-graph.md) 统一场景附件、stage 排序与最终输出；光源、大气节点和各 stage 的资源由各自所有者释放。
- WebGPU 光柱 / 阴影需要 CSM、shadow-length 与场景阴影责任划分；透明物体空气透视需要背景与深度语义。它们不是打开一个 shader 开关就能补齐的能力。
- Hald LUT、多云层、程序化天气和 debug G-buffer 是候选能力，尚无对应产品承诺。引入调色必须同时验证 display-referred 内容，不能只看普通地表画面。

## 查证入口

- [WebGL 大气](../../src/rendering/AtmosphereManager.ts)、[WebGPU 大气](../../src/rendering/WebGPUAtmosphereManager.ts)、[纹理加载](../../src/rendering/AtmosphereTextureLoader.ts)。
- [云外观映射](../../src/rendering/cloudAppearance.ts)、[WebGL 后处理](../../src/rendering/PostProcessingManager.ts)、[WebGPU 图](../../src/rendering/WebGPUPostProcessingManager.ts)。
- [LensFlare stage](../../src/rendering/WebGPULensFlareManager.ts)、[TAA stage](../../src/rendering/WebGPUTemporalAntialiasManager.ts)。
- [2026-08-23 上游调研](three-geospatial上游能力接入盘点.md)：只在查上游实验成熟度与原选择理由时展开；其中远程版本结论不是实时事实。

本记录替代四份以 API 罗列为主的 Takram 能力备忘。函数签名、参数清单可从安装包恢复；独有的坐标边界、云影条件、质量覆盖顺序、资产来源和后端差异在此保留。
