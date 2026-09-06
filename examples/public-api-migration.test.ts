import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import ts from 'typescript'

it('keeps examples on the current coordinate, camera, sampling and Viewer contracts', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const files = ts.sys.readDirectory(resolve(root, 'examples'), ['.ts'], ['**/node_modules/**', '**/*.test.ts'])
  const program = ts.createProgram(files, { ...parsed.options, types: ['vite/client'] })
  // This targeted gate covers the migrated contracts. Existing panel and external
  // dependency typing diagnostics are outside this API regression check.
  const apiDiagnostic = /LonLat|FlyToTargetOptions|ViewerSceneOptions|CameraState|CameraSetViewOptions|does not exist on type 'Viewer'|can't be used to index type 'Number'/
  const failures = ts.getPreEmitDiagnostics(program).flatMap(diagnostic => {
    const file = diagnostic.file
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
    if (!file || !file.fileName.replaceAll('\\', '/').includes('/examples/') || !apiDiagnostic.test(message)) return []
    return [`${file.fileName}:${file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1}: ${message}`]
  })
  expect(failures).toEqual([])
}, 15000)
