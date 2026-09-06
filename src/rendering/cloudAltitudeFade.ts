/**
 * 体积云随相机椭球高度淡出，避免高空硬切 pass。
 *
 * Takram `CloudsEffect.coverage === 0` 时仍会做完整 ray march，因此淡到 0 后仍要
 * 卸下云 pass；下降时用回差重新挂上，避免在淡出终点来回 recompile。
 *
 * Volumetric clouds fade with ellipsoid height so the effect pass is not hard-cut.
 * Takram still ray-marches when `coverage` is 0, so the pass is removed after the
 * fade reaches 0, then reattached with hysteresis on the way down.
 */

/** 低于此高度时按用户 coverage 全量显示。Full user coverage below this height. */
export const CLOUD_ALTITUDE_FADE_START = 20_000

/** 达到此高度时完全淡出，并允许卸下云 pass。Fully faded; pass may be removed. */
export const CLOUD_ALTITUDE_FADE_END = 40_000

/** 下降时提前这么多米重新挂上云 pass。Meters below fade-end to reattach the pass. */
export const CLOUD_PASS_ENABLE_HYSTERESIS = 2_000

function saturate(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = saturate((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * 高度淡出系数：`1` 全量，`0` 不可见。非法 / 缺失高度视为高空（`0`）。
 *
 * Altitude fade: `1` is full, `0` is hidden. Missing or non-finite height is treated as space (`0`).
 */
export function cloudAltitudeFade(height: number | null): number {
  if (height === null || !Number.isFinite(height)) return 0
  if (height <= CLOUD_ALTITUDE_FADE_START) return 1
  if (height >= CLOUD_ALTITUDE_FADE_END) return 0
  return 1 - smoothstep(CLOUD_ALTITUDE_FADE_START, CLOUD_ALTITUDE_FADE_END, height)
}

/**
 * 是否把体积云留在后处理链里。上升在淡出终点卸下，下降提前 {@link CLOUD_PASS_ENABLE_HYSTERESIS} 挂回。
 *
 * Whether the clouds pass should stay in the effect chain. Removed at fade-end going up,
 * reattached {@link CLOUD_PASS_ENABLE_HYSTERESIS} earlier going down.
 */
export function shouldRenderCloudPass(height: number | null, currentlyRendering: boolean): boolean {
  if (height === null || !Number.isFinite(height)) return false
  if (currentlyRendering) return height < CLOUD_ALTITUDE_FADE_END
  return height < CLOUD_ALTITUDE_FADE_END - CLOUD_PASS_ENABLE_HYSTERESIS
}
