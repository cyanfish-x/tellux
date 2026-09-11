import { describe, expect, it } from "vitest"

import { SYMBOL_ICON_URLS } from "./symbol-icons"

describe("SYMBOL_ICON_URLS", () => {
  it("resolves the four symbol icons from the example module graph", () => {
    expect(SYMBOL_ICON_URLS.locate).toMatch(/locate\.png$/)
    expect(SYMBOL_ICON_URLS.star).toMatch(/star\.png$/)
    expect(decodeURIComponent(SYMBOL_ICON_URLS.restaurant)).toMatch(/餐厅\.png$/)
    expect(decodeURIComponent(SYMBOL_ICON_URLS.bar)).toMatch(/酒吧\.png$/)
  })
})
