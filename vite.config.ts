import { defineConfig } from 'vite'

const telluxAssetUrlMarker = '__TELLUX_ASSET_URL__/'

function preserveTelluxAssetUrls() {
  return {
    name: 'tellux-preserve-asset-urls',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, '/').endsWith('/src/assets.ts')) return null

      return {
        code: code.replace(/new URL\('\.\/assets\/tellux\//g, `new URL(/* @vite-ignore */ '${telluxAssetUrlMarker}`),
        map: null
      }
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code) {
          file.code = file.code
            .replace(/\/\*\s*@vite-ignore\s*\*\/\s*/g, '')
            .replaceAll(telluxAssetUrlMarker, './assets/tellux/')
        }
      }
    }
  }
}

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
  plugins: [preserveTelluxAssetUrls()],
  assetsInclude: ['**/*.bin'],
  optimizeDeps: {
    include: ['@mapbox/vector-tile', 'pbf']
  },
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        assets: 'src/assets.ts'
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    sourcemap: true,
    rollupOptions: {
      external
    }
  }
})
