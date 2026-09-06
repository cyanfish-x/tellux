import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { CESIUM_ION_WORLD_TERRAIN_ASSET_ID } from '../map-sources.config'

it('supplies the terrain asset constant in the actual runner execution scope', () => {
  const runner = ts.createSourceFile('runner.ts', readFileSync(new URL('./runner.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  let scope: ts.NewExpression | undefined
  let invocation: ts.CallExpression | undefined
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(runner) === 'Function') scope = node
    if (ts.isCallExpression(node) && node.expression.getText(runner) === 'execute') invocation = node
    ts.forEachChild(node, visit)
  }
  visit(runner)
  const parameters = scope!.arguments!.slice(0, -1)
  const name = 'CESIUM_ION_WORLD_TERRAIN_ASSET_ID'
  const slot = parameters.findIndex(node => ts.isStringLiteral(node) && node.text === name)
  expect(slot).toBeGreaterThanOrEqual(0)
  // This binding precedes the optional spread arguments, so its position is fixed.
  expect(invocation!.arguments[slot].getText(runner)).toBe(name)
  expect(runner.statements.some(node => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text === '../map-sources.config'
    && node.importClause?.namedBindings?.getText(runner).includes(name))).toBe(true)

  const terrain = ts.createSourceFile('terrain.ts', readFileSync(new URL('../terrain.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = terrain.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(terrain) === 'DEFAULT_ION_TERRAIN_ASSET_ID')!
  const initialize = new Function(name, `return ${declaration.initializer!.getText(terrain)}`)
  expect(initialize(CESIUM_ION_WORLD_TERRAIN_ASSET_ID)).toBe(String(CESIUM_ION_WORLD_TERRAIN_ASSET_ID))
})
