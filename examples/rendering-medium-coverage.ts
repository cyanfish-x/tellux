import { startMediumCoverage } from './rendering-prototypes/startMediumCoverage'

// A3：解析介质区间与低分辨率有效域，不属于公开渲染 API。
// A3: analytic medium intervals and low-resolution validity, not a public rendering API.
startMediumCoverage(document.querySelector<HTMLElement>('#viewer')!)
