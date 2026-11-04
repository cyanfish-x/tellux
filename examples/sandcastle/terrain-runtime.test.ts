import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { CESIUM_ION_WORLD_TERRAIN_ASSET_ID } from '../map-sources.config'

function runnerFunctionParameterNames() {
  const runner = ts.createSourceFile('runner.ts', readFileSync(new URL('./runner.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  let scope: ts.NewExpression | undefined
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node) && node.expression.getText(runner) === 'Function') scope = node
    ts.forEachChild(node, visit)
  }
  visit(runner)
  return (scope!.arguments ?? [])
    .slice(0, -1)
    .flatMap((node) => ts.isStringLiteral(node) ? [node.text] : [])
}

function sandcastleExampleScripts() {
  const examplesDir = new URL('../', import.meta.url)
  const collect = (dir: URL, prefix = '') =>
    readdirSync(dir)
      .filter((name) => extname(name) === '.ts' && !name.endsWith('.test.ts'))
      .filter((name) => existsSync(new URL(name.replace(/\.ts$/, '.html'), dir)))
      .map((name) => `${prefix}${name}`)

  return [
    ...collect(examplesDir),
    ...collect(new URL('../hism/', import.meta.url), 'hism/'),
  ]
}

function topLevelValueDeclarations(source: ts.SourceFile) {
  const names: string[] = []
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text)
    }
    if (ts.isClassDeclaration(statement) && statement.name) {
      names.push(statement.name.text)
    }
  }
  return names
}

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

it('does not redeclare runner Function parameters in example scripts', () => {
  const reserved = new Set(runnerFunctionParameterNames())
  const examplesDir = new URL('../', import.meta.url)
  const scripts = sandcastleExampleScripts()

  expect(scripts).toContain('earth-at-night.ts')

  const collisions = scripts.flatMap((name) => {
    const source = ts.createSourceFile(
      name,
      readFileSync(new URL(name, examplesDir), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    return topLevelValueDeclarations(source)
      .filter((identifier) => reserved.has(identifier))
      .map((identifier) => `${name}: ${identifier}`)
  })

  expect(collisions).toEqual([])
})
