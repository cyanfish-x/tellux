import type { Viewer } from "../../Viewer"
import { mountDebugSettingsPanel, type DebugSettingsPanelHandle } from "./mount"
import type { DebugSettingsPanelOptions } from "./types"

/**
 * Viewer 调试设置面板控件。
 *
 * Debug settings panel widget for a Viewer.
 */
export class DebugSettingsPanel {
  private readonly handle: DebugSettingsPanelHandle

  constructor(viewer: Viewer, settings: DebugSettingsPanelOptions = {}) {
    this.handle = mountDebugSettingsPanel(viewer, settings)
  }

  update(deltaTime: number, time = performance.now()) {
    this.handle.update(deltaTime, time)
  }

  dispose() {
    this.handle.dispose()
  }
}
