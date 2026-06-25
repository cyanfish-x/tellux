import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'src/assets')
const target = resolve(root, 'dist/assets')

await rm(target, { force: true, recursive: true })
await cp(source, target, { recursive: true })
