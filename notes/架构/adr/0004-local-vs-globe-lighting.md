# 局部光照 vs 地球后处理光照

**状态：已接受**

**日期：2026-09-03**

## 背景

地球大气管线把场景缓冲当作地表反照率，再用 `dayLightFactor` 把太阳/天光在夜里关掉。这对地形是对的，但会把城市模型里已经 forward 着色的点光、窗灯、广告牌自发光一起乘到接近 0。结果是：灯在 Three.js 里是亮的，出画却全黑。

上游 `@takram/three-atmosphere` 较新版本提供 `LightingMaskPass`：mask=1 走后处理大气光照，mask=0 保留 `inputColor`。Tellux 当前依赖 `0.19.1` **没有**导出 `lightingMask` / `LightingMaskPass`，不能把 RT 接到 `aerialPerspectiveEffect.lightingMask`。

Cesium for Unreal / CesiumSunSky 用正午 111000 lux 做太阳语义锚。Tellux 只把该锚映射成 Takram 太阳强度缩放（默认仍是 1），**不要**把 Cesium「UE 默认方向光约 10 lux → 111000 lux」的 ×11100 写进点光或 `emissiveIntensity`。Takram 太阳 GPU intensity 已经是约 1；再乘 11100 会让窗灯 HDR 到几千，Bloom 强度 0.05 仍核爆。夜里靠人眼适应（曝光）让灯成为主体，而不是关太阳或按昼夜改 Bloom。

## 决策

1. **光照域**：`addModel({ lighting: 'globe' | 'local' })`。`preserve` 默认 `local`，`auto` 默认 `globe`。`local` 在 `post-process` 下强制保留 glTF 材质。
2. **Shader 契约**：`light-source` 已着色 radiance **不**乘 `dayLightFactor`，不用 luma 猜自发光，不用 albedo 月光替换局部像素。`post-process` 的太阳/天光重建仍乘日夜因子。自写 `LightingMaskPass` + `telluxLightingMaskBuffer`：1=globe，0=local 保留 `inputColor`。
3. **光度**：`scene.atmosphere.lighting.photometric.{ enabled, sunIlluminance: 111000 }`。内部 `TakramScale = sunIlluminance / 111000`，禁止 `SunDirectionalLight.intensity = 111000`。该 API **只缩放太阳**，不改点光或自发光。局部灯 / `emissiveIntensity` 与 Takram 太阳同一套场景单位（约 O(1)～几）。默认关闭。
4. **自动曝光**：`scene.postProcess.autoExposure.{ enabled, min, max, speed }`，用已有 `nightFactor`（太阳高度）平滑插值 `toneMappingExposure`。默认关闭。地球主光是太阳，不用直方图。
5. **验收形态**：`examples/threejs-interop.ts` 必须同时打开 photometric、local lighting、autoExposure。对齐上游 Non-geospatial：**不开 Bloom / 镜头光晕**。其它示例保持旧默认。
6. **WebGPU**：同一套 photometric 换算和 `getNightFactor()`；lighting mask 仍是 WebGL `setEffects` 路径。不在 WebGPU 复制一份 GLSL mask。

## 被否决的方案

- **关 `sunLight` / 拉月光 / AmbientLight**：把夜暗伪装成“灯亮了”，白天冲淡不成立。
- **`emissiveIntensity: 20` 硬扛 dayLightFactor**：治标，和太阳不在同一套 HDR。
- **luma 猜自发光**：白天墙面也会被当成灯。
- **全球默认打开 photometric / 自动曝光**：未改灯的旧地球示例会过曝。
- **直方图自动曝光**：地球主光是太阳；对着霓虹拉曝光不是本方案目标。
- **丢掉 AgX 换 Neutral**：只为对标 Non-geospatial 故事书，破坏 Tellux 输出链。
- **等上游 `LightingMaskPass` 进 0.19.x**：当前包没有该 API；自写 RT 与 shader 采样语义对齐 Takram 文档。

## 后果与维护要求

- 升级 `@takram/three-atmosphere` 时核对其是否新增 `lightingMask`；若已有，可把自写 pass 接到官方属性，但 **mix 方向必须保持 1=globe / 0=local**。
- `sunLightIntensity` 在未开 photometric 时仍是无量纲倍率；打开光度后变为「用户倍率 × lux 锚缩放」。
- Bloom `intensity` 是亮部提取之后的混合系数，不是画面亮度百分比。阈值挡不住的 HDR（例如自发光 5550）乘 0.05 仍然是一团白。
- 自动曝光开启时每帧会覆盖 `viewer.toneMappingExposure`；调曝光请改 `autoExposure.min` / `max`。
- WebGPU 没有 lighting mask，`lighting: 'local'` 在 WebGPU 上只保证材质 preserve 与光度换算，不能在 `post-process` 下按像素排除大气光照。
