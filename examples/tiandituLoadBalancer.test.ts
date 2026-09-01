import { describe, expect, it } from "vitest"
import {
  rewriteTiandituUrlToDevProxy,
  shouldUseTiandituDevProxy,
} from "./tiandituLoadBalancer"

describe("rewriteTiandituUrlToDevProxy", () => {
  it("rewrites a DataServer tile URL onto the matching subdomain proxy path", () => {
    expect(
      rewriteTiandituUrlToDevProxy(
        "https://t3.tianditu.gov.cn/DataServer?T=img_w&x=1&y=2&l=4&tk=abc"
      )
    ).toBe("/tianditu-t/3/DataServer?T=img_w&x=1&y=2&l=4&tk=abc")
  })

  it("rewrites a swdx terrain URL onto the matching subdomain proxy path", () => {
    expect(
      rewriteTiandituUrlToDevProxy(
        "https://t0.tianditu.gov.cn/mapservice/swdx?T=elv_c&tk=abc"
      )
    ).toBe("/tianditu-t/0/mapservice/swdx?T=elv_c&tk=abc")
  })

  it("leaves non-Tianditu tile hosts unchanged", () => {
    const url = "https://api.tianditu.gov.cn/v2/administrative?tk=abc"
    expect(rewriteTiandituUrlToDevProxy(url)).toBe(url)
  })
})

describe("shouldUseTiandituDevProxy", () => {
  it("stays off in Node tests that have no location", () => {
    expect(typeof location).toBe("undefined")
    expect(shouldUseTiandituDevProxy()).toBe(false)
  })
})
