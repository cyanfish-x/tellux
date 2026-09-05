import type { Viewer } from '../Viewer'
import type { DebugSettingsPanelOptions, TimelineOptions, ViewerWidgetOptions } from '../types'
import {
  applyInitialDebugSettings,
  DebugSettingsPanel,
  loadStoredDebugSettings
} from './DebugSettingsPanel'
import { mergeDebugSettings } from './DebugSettingsPanel'
import { Timeline } from './Timeline'

export class WidgetManager {
  private readonly debugSettings: DebugSettingsPanelOptions | null
  private readonly timelineOptions: TimelineOptions | null
  private debugSettingsPanel: DebugSettingsPanel | null = null
  private timeline: Timeline | null = null

  constructor(private readonly viewer: Viewer, options: ViewerWidgetOptions = {}) {
    this.debugSettings = this.resolveSettingsPanelOptions(options.settingsPanel)
    this.timelineOptions = this.resolveTimelineOptions(options.timeline)
  }

  applyInitialSettings() {
    if (this.debugSettings) {
      applyInitialDebugSettings(this.viewer, this.debugSettings)
    }
  }

  mount() {
    if (this.debugSettings) {
      this.debugSettingsPanel = new DebugSettingsPanel(this.viewer, this.debugSettings)
    }
    if (this.timelineOptions) {
      this.timeline = new Timeline(this.viewer, this.timelineOptions)
    }
  }

  update(deltaTime: number, time: number) {
    this.debugSettingsPanel?.update(deltaTime, time)
    this.timeline?.update(deltaTime)
  }

  dispose() {
    this.debugSettingsPanel?.dispose()
    this.timeline?.dispose()
    this.debugSettingsPanel = null
    this.timeline = null
  }

  private resolveSettingsPanelOptions(
    options: ViewerWidgetOptions['settingsPanel']
  ): DebugSettingsPanelOptions | null {
    if (!options) return null

    const storedSettings = loadStoredDebugSettings()
    if (options === true) return storedSettings

    return mergeDebugSettings(options, storedSettings)
  }

  private resolveTimelineOptions(options: ViewerWidgetOptions['timeline']): TimelineOptions | null {
    if (!options) return null
    return options === true ? {} : options
  }
}
