import { defineConfig } from 'vite'

const external = [
  '3d-tiles-renderer',
  '3d-tiles-renderer/plugins',
  '@takram/three-atmosphere',
  '@takram/three-clouds',
  '@takram/three-geospatial',
  '@takram/three-geospatial-effects',
  'postprocessing',
  'three',
  /^three\/addons\//
]

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    sourcemap: true,
    rollupOptions: {
      external
    }
  }
})
