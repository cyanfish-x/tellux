import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { CESIUM_ION_WORLD_TERRAIN_ASSET_ID } from '../map-sources.config'

it('supplies the terrain asset constant in the actual runner execution scope', async () => {
  const runner = ts.createSourceFile('runner.ts', readFileSync(new URL('./runner.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  let scope: ts.NewExpression | undefined
  let invocation: ts.CallExpression | undefined
  let loader: ts.VariableDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(runner) === 'Function') scope = node
    if (ts.isCallExpression(node) && node.expression.getText(runner) === 'execute') invocation = node
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.name.elements.some(element => element.name?.getText(runner) === 'mapConfigModule')) loader = node
    ts.forEachChild(node, visit)
  }
  visit(runner)
  const parameters = scope!.arguments!.slice(0, -1)
  const name = 'CESIUM_ION_WORLD_TERRAIN_ASSET_ID'
  const slot = parameters.findIndex(node => ts.isStringLiteral(node) && node.text === name)
  expect(slot).toBeGreaterThanOrEqual(0)
  // This binding precedes the optional spread arguments, so its position is fixed.
  expect(invocation!.arguments[slot].getText(runner)).toBe(`mapConfigModule?.${name}`)
  const loads: string[] = []
  const load = async (path: string) => { loads.push(path); return {[name]: CESIUM_ION_WORLD_TERRAIN_ASSET_ID} }
  const loadBindings = new Function('source', 'load', `return (async () => ${loader!.initializer!.getText(runner).replace(/\bimport\(/g, 'load(')})()`)
  await loadBindings('const unused = 1', load)
  expect(loads).toEqual([])
  const [, mapConfigModule] = await loadBindings(`const asset = ${name}`, load)
  expect(loads).toEqual(['../map-sources.config'])
  const resolveArgument = new Function('mapConfigModule', `return ${invocation!.arguments[slot].getText(runner)}`)
  expect(resolveArgument(mapConfigModule)).toBe(CESIUM_ION_WORLD_TERRAIN_ASSET_ID)

  const terrain = ts.createSourceFile('terrain.ts', readFileSync(new URL('../terrain.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = terrain.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(terrain) === 'DEFAULT_ION_TERRAIN_ASSET_ID')!
  const initialize = new Function(name, `return ${declaration.initializer!.getText(terrain)}`)
  expect(initialize(CESIUM_ION_WORLD_TERRAIN_ASSET_ID)).toBe(String(CESIUM_ION_WORLD_TERRAIN_ASSET_ID))
})
