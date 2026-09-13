import { expect, it } from 'vitest'
import { stripRuntimeDocumentation } from '../build/stripRuntimeDocumentation'

it('strips runtime JSDoc without changing literals, license/pure comments or token locations', () => {
  const code = `/** API 文档 / API documentation */
export class Example {
  /** 字段文档 / Field documentation */
  value = '/** this is data */'
  expression = \`/** template data */\`
}
/** @license Keep this license */
export function licensed() { return 1 }
/** Copyright (c) 2026. All rights reserved. */
export const attributed = 2
export const pure = /* @__PURE__ */ new Example()
`
  const result = stripRuntimeDocumentation(code, 'example.ts')!
  expect(result).not.toContain('API documentation')
  expect(result).not.toContain('Field documentation')
  expect(result).toContain("'/** this is data */'")
  expect(result).toContain('`/** template data */`')
  expect(result).toContain('/** @license Keep this license */')
  expect(result).toContain('/** Copyright (c) 2026. All rights reserved. */')
  expect(result).toContain('/* @__PURE__ */')
  expect(result.length).toBe(code.length)
  expect(result.indexOf('export class')).toBe(code.indexOf('export class'))
  expect(result.split('\n').length).toBe(code.split('\n').length)
})
