import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { expandLocalLibImports } from "./expand-local-lib-imports"

describe("expandLocalLibImports", () => {
  it("inlines ./lib modules inside an IIFE to avoid name clashes", () => {
    const libs = {
      "../lib/ocean-shore.ts": `
import * as THREE from "three"
export const SLOPE = 0.15
const GRAVITY = 9.81
export class ChainSim {
  constructor() { void GRAVITY }
}
export function buildCoastFromWaterMask() { return SLOPE }
`,
    }
    const code = `
import { exampleMapServiceConfig } from "./shared"
import { SLOPE, ChainSim, buildCoastFromWaterMask } from "./lib/ocean-shore"
const GRAVITY = 1
const x = new ChainSim()
console.log(SLOPE, GRAVITY, x, buildCoastFromWaterMask(), exampleMapServiceConfig)
`
    const out = expandLocalLibImports(code, libs)
    expect(out).toContain("__sandcastleLib_")
    expect(out).toMatch(/return \{[^}]*SLOPE[^}]*\}/)
    expect(out).toContain("const { SLOPE, ChainSim, buildCoastFromWaterMask } =")
    expect(out).not.toContain('from "./lib/ocean-shore"')
    expect(out).toContain('from "./shared"')
    // 剩余 import 必须在 IIFE 之前，避免 TS emit 打乱
    expect(out.indexOf('from "./shared"')).toBeLessThan(out.indexOf("__sandcastleLib_"))
    expect(out).toMatch(/const GRAVITY = 9\.81[\s\S]*return \{/)
    expect(out).toMatch(/const GRAVITY = 1/)
  })

  it("keeps imports above IIFE for real ocean.ts", () => {
    const code = readFileSync(new URL("../ocean.ts", import.meta.url), "utf8")
    const libs = {
      "../lib/ocean-shore.ts": readFileSync(
        new URL("../lib/ocean-shore.ts", import.meta.url),
        "utf8"
      ),
    }
    const out = expandLocalLibImports(code, libs)
    expect(out).not.toContain('from "./lib/ocean-shore"')
    expect(out).toContain('from "./shared"')
    expect(out.indexOf('from "./shared"')).toBeLessThan(out.indexOf("__sandcastleLib_"))
    expect(out).toContain("buildCoastFromWaterMask")
    expect(out).toContain("const GRAVITY = 9.81")
  })
})
