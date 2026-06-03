import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const projectRoot = resolve(__dirname, '..')

export default defineConfig({
  root: __dirname,
  envDir: projectRoot,
  server: {
    fs: {
      allow: [projectRoot]
    }
  }
})
