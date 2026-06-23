export class SceneToggle {
  private isShown: boolean
  private readonly onChange: () => void

  constructor(isShown: boolean, onChange: () => void) {
    this.isShown = isShown
    this.onChange = onChange
  }

  /**
   * 是否显示。
   *
   * Whether this item is shown.
   */
  get show() {
    return this.isShown
  }

  set show(value: boolean) {
    if (this.isShown === value) return
    this.isShown = value
    this.onChange()
  }
}
