import * as THREE from 'three'
import { EnvironmentControls, GlobeControls as BaseGlobeControls } from '3d-tiles-renderer'

// 基类交互状态常量（EnvironmentControls.js 内部定义，未公开导出，此处镜像）。
// Base interaction-state constants — defined internally in EnvironmentControls.js and not
// re-exported by the package, mirrored here.
const NONE = 0
const DRAG = 1
const ROTATE = 2
const WAITING = 4

// 左键拖拽允许的最大 pitch（度，Cesium 约定：0=地平线，-90=朝下，+90=朝上）。仅当 pitch ≤ 此值
// （相机至少俯到地平线下 5°）才允许拖拽；pitch > 此值（看向地平线及上方、俯视不足）时禁拖，避免
// 低角度下射线切拖拽球面导致的"光速退远"。pitch 由 Viewer 注入的 pitchProvider 读取
// （= Camera.getPitch），用应用自身俯仰源判定，与点击位置无关。
//
// Maximum pitch (degrees; Cesium: 0=horizon, -90=down, +90=up) at which left-drag is allowed.
// Drag is allowed only when pitch ≤ this (camera at least 5° below the horizon); when pitch >
// this (looking at the horizon or above — not pitched down enough) drag is disabled to avoid
// the low-angle runaway where the ray skims the drag sphere and the camera "whips away". Pitch
// is read via pitchProvider (injected by the Viewer as Camera.getPitch), so the test uses the
// app's own pitch source and is independent of where you click.
const MAX_DRAG_PITCH_DEG = 10

// 闲置回弹速率（1/s）：相机被右键拖向太空后松手，将 pitch 弹回 MAX_DRAG_PITCH_DEG（可操作的安全值）。
// 越大回弹越快，8 ≈ 0.3s 基本到位。帧率无关：每帧用 1 - exp(-rate * dt) 衰减剩余超额量。
//
// Idle spring-back rate (1/s): after a right-drag toward space and release, pitch springs back to
// MAX_DRAG_PITCH_DEG (the operable safe value). Higher = faster; 8 ≈ settles in ~0.3s.
// Frame-rate independent: each frame decays the remaining excess by 1 - exp(-rate * dt).
const PITCH_SPRING_RATE = 8

type ControlsWithPivotMesh = BaseGlobeControls & {
  pivotMesh?: THREE.Mesh
}

// 公开 .d.ts 隐藏、但基类实现读写的内部字段。
// Internal fields the public .d.ts omits but the base implementation reads/writes.
type ControlsWithInternals = BaseGlobeControls & {
  state: number
  raycaster: THREE.Raycaster
  pivotPoint: THREE.Vector3
  pivotMesh: THREE.Mesh
  pointerTracker: {
    getPointerCount(): number
    getCenterPoint(target: THREE.Vector2): THREE.Vector2 | null
    isPointerTouch(): boolean
    isLeftClicked(): boolean
    isRightClicked(): boolean
  }
  _raycast(raycaster: THREE.Raycaster): { point: THREE.Vector3; distance: number } | null
  _getDeltaTime(): number
  rotationInertia: THREE.Vector2
  dragInertia: THREE.Vector3
  globeInertia: THREE.Quaternion
  globeInertiaFactor: number
}

const _centerPx = new THREE.Vector2()
const _dragFwd = new THREE.Vector3()
const _springFwd = new THREE.Vector3()
const _springAxis = new THREE.Vector3()
const _springQuat = new THREE.Quaternion()

export class TelluxGlobeControls extends BaseGlobeControls {
  // 解除默认视角上限：基类 maxAltitude = 0.45π（≈81°），右键向上拖动到接近地平线就被卡住，
  // 无法看向天空。此处放宽到接近天顶（留 1e-2 余量避开正上方叉积退化导致的抖动）。
  //
  // Lift the default view-angle ceiling: the base sets maxAltitude = 0.45π (≈81°), so a
  // right-drag up gets stuck near the horizon and can't look at the sky. Relax it to near
  // zenith (1e-2 margin avoids the cross-product singularity — and thus jitter — at exactly π).
  maxAltitude = Math.PI - 1e-2

  // 补充监听器引用，便于 detach 时注销。
  // Reference to the supplementary listener so detach can remove it.
  private _grazingPointerDown: ((e: PointerEvent) => void) | null = null

  // 外部注入的相机 pitch 读取（度，Cesium 约定）。由 Viewer 注入 Camera.getPitch，使低角度禁拖
  // 判定用应用自身的俯仰源。未注入时回退到 _derivePitchDeg 推算。
  // Externally injected camera-pitch reader in degrees (Cesium convention). Injected by the
  // Viewer as Camera.getPitch so the low-angle no-drag test uses the app's own pitch source.
  // Falls back to _derivePitchDeg when not set.
  pitchProvider?: () => number

  // 外部注入的"是否正在飞行"读取。由 Viewer 注入 Camera.isFlying，使闲置回弹在相机飞行期间不介入，
  // 避免与 flyTo 动画争抢相机控制。未注入时视为不飞行。
  // Externally injected "is currently flying" flag. Injected by the Viewer as Camera.isFlying so
  // the idle pitch spring-back stays out of the way during flyTo animations and doesn't fight
  // them for camera control. Treated as not-flying when not set.
  isFlyingProvider?: () => boolean

  useWebGPUCompatiblePivotMaterial() {
    const pivotMesh = (this as ControlsWithPivotMesh).pivotMesh
    if (!pivotMesh) return

    if (Array.isArray(pivotMesh.material)) {
      pivotMesh.material.forEach((material) => material.dispose())
    } else {
      pivotMesh.material?.dispose()
    }

    pivotMesh.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.75
    })
    pivotMesh.onBeforeRender = () => {}
  }

  _updateRotation(deltaTime: number) {
    ;(
      EnvironmentControls.prototype as unknown as {
        _updateRotation(this: TelluxGlobeControls, deltaTime: number): void
      }
    )._updateRotation.call(this, deltaTime)
  }

  // 调用基类 GlobeControls 的 _updatePosition（公开 .d.ts 未声明，走原型调用）。
  // Invoke the base GlobeControls _updatePosition (omitted from the public .d.ts) via the
  // prototype, matching the _updateRotation override's pattern.
  private _callBaseUpdatePosition(deltaTime: number) {
    ;(
      BaseGlobeControls.prototype as unknown as {
        _updatePosition(this: TelluxGlobeControls, deltaTime: number): void
      }
    )._updatePosition.call(this, deltaTime)
  }

  // 低角度下禁止左键拖拽。基类 DRAG 把指针射线投到以 pivotRadius 为半径的球面上求新锚点方向，
  // 再绕地心旋转相机使锚点跟随光标；射线近乎与球面相切时交点极不稳定，单帧旋转被放大成"光速
  // 退远"。视野落在地平线 ±MIN_DRAG_HORIZON_DEG 禁拖带内时直接 resetState 终止拖拽，从源头规避
  // runaway。右键旋转不受影响（_applyRotation 自带角度夹紧，稳定）。
  //
  // Disable left-drag at low angles. The base DRAG projects the pointer ray onto a sphere of
  // radius pivotRadius and rotates the camera about the globe centre to track the anchor; a
  // near-tangent ray makes the intersection unstable and a single frame's rotation blows up into
  // a "whip-away". When the view falls in the ±MIN_DRAG_HORIZON_DEG no-drag band around the
  // horizon, resetState cancels the drag at the source. Right-click rotation is unaffected
  // (_applyRotation already clamps its angles, so it stays stable).
  _updatePosition(deltaTime: number) {
    const self = this as unknown as ControlsWithInternals
    if (self.state === DRAG && this._isDragDisabledByPitch()) {
      this.resetState()
      return
    }
    this._callBaseUpdatePosition(deltaTime)
  }

  // 是否因 pitch 过高禁拖：pitch > MAX_DRAG_PITCH_DEG（看向地平线及上方、俯视不足）时返回 true。
  // 优先用注入的 pitchProvider（= Camera.getPitch，应用自身俯仰源）；未注入时回退到 _derivePitchDeg。
  // 判定纯基于相机俯仰，与点击位置无关。
  //
  // Whether drag should be blocked due to pitch: returns true when pitch > MAX_DRAG_PITCH_DEG
  // (looking at the horizon or above — not pitched down enough). Prefers the injected
  // pitchProvider (= Camera.getPitch, the app's own pitch source); falls back to _derivePitchDeg
  // when not set. Pure camera-pitch measure, independent of where you click.
  private _isDragDisabledByPitch() {
    return this._readPitchDeg() > MAX_DRAG_PITCH_DEG
  }

  // 读取当前 pitch（度）：优先注入的 pitchProvider（= Camera.getPitch），否则回退到 _derivePitchDeg。
  // Read the current pitch (degrees): prefers the injected pitchProvider (= Camera.getPitch),
  // else falls back to _derivePitchDeg.
  private _readPitchDeg(): number {
    return this.pitchProvider ? this.pitchProvider() : this._derivePitchDeg()
  }

  // 未注入 pitchProvider 时的回退推算：asin(forward · up)（低空近似 Cesium pitch）。仅供非装配场景
  // （如单测），正式运行由 Viewer 注入 pitchProvider。
  // Fallback derivation when no pitchProvider is injected: asin(forward · up) (approximates Cesium
  // pitch near the surface). Only for non-wired contexts (e.g. unit tests); at runtime the Viewer
  // injects pitchProvider.
  private _derivePitchDeg() {
    _dragFwd.set(0, 0, -1).transformDirection(this.camera.matrixWorld)
    const pitchRad = Math.asin(THREE.MathUtils.clamp(_dragFwd.dot(this.up), -1, 1))
    return (pitchRad * 180) / Math.PI
  }

  // 每帧更新：先跑基类，再在闲置（无交互、非飞行）且 pitch 超过安全上限时把 pitch 弹回
  // MAX_DRAG_PITCH_DEG。相机右键拖向太空后无法拾取锚点，松手即回弹到可操作俯仰。
  //
  // 关键：回弹在松手时立即执行 —— 检测到闲置且 pitch 超标时，先清掉残余惯性（不等惯性滑行结束），
  // 再跑基类、再回弹，避免"松手→等滑行→停顿→才回弹"的延迟感。
  //
  // Per-frame update: run the base, then — when idle (no interaction, not flying) and pitch exceeds
  // the safe ceiling — spring pitch back to MAX_DRAG_PITCH_DEG. After a right-drag toward space the
  // pivot can't be picked, so on release we bounce back to an operable pitch.
  //
  // Key: the bounce fires immediately on release — when idle with pitch over the ceiling, clear
  // residual inertia first (without waiting for the coast to finish), then run the base, then
  // spring, avoiding the "release → wait for coast → pause → only then bounce" lag.
  update(deltaTime: number = Math.min((this as unknown as ControlsWithInternals)._getDeltaTime(), 64 / 1000)) {
    const self = this as unknown as ControlsWithInternals
    const shouldSpring =
      this.enabled &&
      !!this.camera &&
      deltaTime > 0 &&
      self.state === NONE &&
      this.isFlyingProvider?.() !== true &&
      this._readPitchDeg() > MAX_DRAG_PITCH_DEG
    if (shouldSpring) {
      // 立即清掉残余惯性，让回弹接管，不等滑行结束。
      // Clear residual inertia immediately so the spring takes over without waiting for the coast.
      self.rotationInertia.set(0, 0)
      self.dragInertia.set(0, 0, 0)
      self.globeInertia.identity()
      self.globeInertiaFactor = 0
    }
    super.update(deltaTime)
    if (shouldSpring && this._springPitchBack(deltaTime)) {
      this.dispatchEvent({ type: 'change' })
    }
  }

  // 将过高的 pitch 弹回 MAX_DRAG_PITCH_DEG：绕"forward × up"水平轴原地旋转相机（位置不动、不引入
  // roll），每帧按 1 - exp(-rate·dt) 衰减剩余超额量。返回是否实际旋转了（用于决定是否派发 change）。
  //
  // Spring an excessive pitch back to MAX_DRAG_PITCH_DEG: rotate the camera in place about the
  // horizontal (forward × up) axis — position unchanged, no roll — decaying the remaining excess
  // by 1 - exp(-rate·dt) each frame. Returns whether a rotation was actually applied (used to
  // decide whether to dispatch 'change').
  private _springPitchBack(deltaTime: number): boolean {
    const pitchDeg = this._readPitchDeg()
    const excess = pitchDeg - MAX_DRAG_PITCH_DEG
    if (excess <= 0) return false
    const t = 1 - Math.exp(-PITCH_SPRING_RATE * deltaTime)
    const deltaRad = -((excess * t * Math.PI) / 180)
    _springFwd.set(0, 0, -1).transformDirection(this.camera.matrixWorld)
    _springAxis.crossVectors(_springFwd, this.up)
    if (_springAxis.lengthSq() < 1e-12) return false // forward ∥ up，无水平轴，跳过本帧
    _springAxis.normalize()
    _springQuat.setFromAxisAngle(_springAxis, deltaRad)
    this.camera.quaternion.premultiply(_springQuat)
    this.camera.updateMatrixWorld()
    return true
  }

  // 在基类 pointerdown 守卫之外补充锚点拾取。基类在 |ray·up| < 0.05（接近地平线）时直接
  // 返回：不 raycast、不设 pivotPoint、不进入 ROTATE/DRAG，表现即"低角度下相机无法移动"。
  // 此监听器注册在基类之后（同元素、同冒泡阶段），基类 bail 时 state 仍为 NONE —— 此时用
  // GlobeControls 自带的椭球兜底 _raycast 自行拾取锚点并进入交互态，恢复旋转/拖拽。
  //
  // Supplementary pivot pickup outside the base pointerdown guard. The base returns early when
  // |ray·up| < 0.05 (near horizon): no raycast, no pivot, no ROTATE/DRAG — the camera gets stuck
  // at low angles. This listener registers after the base (same target, same bubble phase); when
  // the base bails, state is still NONE, so we pick the pivot via GlobeControls' ellipsoid-fallback
  // _raycast and enter the interaction state ourselves, restoring rotate/drag.
  attach(domElement: HTMLElement) {
    super.attach(domElement)
    const handler = (e: PointerEvent) => this._recoverGrazingPick(e)
    this._grazingPointerDown = handler
    domElement.addEventListener('pointerdown', handler)
  }

  detach() {
    if (this._grazingPointerDown && this.domElement) {
      this.domElement.removeEventListener('pointerdown', this._grazingPointerDown)
      this._grazingPointerDown = null
    }
    super.detach()
  }

  private _recoverGrazingPick(e: PointerEvent) {
    const self = this as unknown as ControlsWithInternals
    if (!this.enabled) return
    // 基类已进入交互态说明未 bail，不干预。
    // If the base already entered a state it didn't bail — leave it alone.
    if (self.state !== NONE) return

    const { pointerTracker, raycaster, camera, domElement, pivotPoint, pivotMesh, scene } = self
    const count = pointerTracker.getPointerCount()
    if (count === 0 || count > 2) return

    // 复算中心指针射线（与基类一致：getCenterPoint 给出元素左上像素，再转 NDC）。
    // Re-derive the center-pointer ray exactly as the base does (getCenterPoint yields
    // element-relative pixels; convert to NDC).
    if (!pointerTracker.getCenterPoint(_centerPx)) return
    _centerPx.x = (_centerPx.x / domElement.clientWidth) * 2 - 1
    _centerPx.y = -(_centerPx.y / domElement.clientHeight) * 2 + 1
    raycaster.setFromCamera(_centerPx, camera)

    const hit = self._raycast(raycaster)
    if (!hit) return

    const isTouch = pointerTracker.isPointerTouch()
    const isRotate =
      count === 2 ||
      pointerTracker.isRightClicked() ||
      (pointerTracker.isLeftClicked() && e.shiftKey)
    const isDrag = !isRotate && pointerTracker.isLeftClicked()
    if (!isRotate && !isDrag) return

    // 左键拖拽按相机 pitch 门控：pitch > -5°（俯视不足、看向地平线及上方）不在恢复侧拾取 —— 基类
    // 若自行进了 DRAG 会被 _updatePosition 取消。旋转不限。故禁拖只取决于相机俯仰，与点击位置无关。
    // Left-drag is gated by camera pitch: when pitch > -5° (not pitched down enough — looking at
    // the horizon or above) we don't pick here — any base-initiated DRAG is cancelled by
    // _updatePosition. Rotation is unrestricted. So the disable depends only on camera pitch,
    // not on where on the map you click.
    if (isDrag && this._isDragDisabledByPitch()) return

    pivotPoint.copy(hit.point)
    pivotMesh.position.copy(hit.point)
    pivotMesh.visible = isTouch ? false : this.enabled
    pivotMesh.updateMatrixWorld()
    scene.add(pivotMesh)

    this.setState(isRotate ? (isTouch ? WAITING : ROTATE) : DRAG)
  }
}
