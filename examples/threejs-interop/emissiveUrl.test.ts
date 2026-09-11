import { describe, expect, it } from "vitest"

import { EMISSIVE_TEXTURE_URL } from "./emissiveUrl"

describe("EMISSIVE_TEXTURE_URL", () => {
  it("resolves the authored emissive map from the example module graph", () => {
    expect(EMISSIVE_TEXTURE_URL).toMatch(/emissive\.jpg$/)
  })
})
