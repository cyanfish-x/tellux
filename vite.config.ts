import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import {
  isBundledExternalModule,
  isPeerDependencyExternal
} from './src/build/peerDependencyExternal'
import {
  assertBundleSizeBudgets,
  selectFilesMatching
} from './src/build/bundleSizeBudget'

const telluxAssetUrlMarker = '__TELLUX_ASSET_URL__/'
const KiB = 1024

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

function assertPeerDependenciesExternal(): Plugin {
  return {
    name: 'tellux-assert-peer-dependencies-external',
    generateBundle(_options, bundle) {
      const bundledPeerModules = new Set<string>()

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue

        for (const moduleId of Object.keys(output.modules)) {
          if (isBundledExternalModule(moduleId)) {
            bundledPeerModules.add(moduleId)
          }
        }
      }

      if (bundledPeerModules.size > 0) {
        this.error(
          `Peer dependencies were bundled unexpectedly:\n${[...bundledPeerModules].join('\n')}`
        )
      }
    }
  }
}

export default defineConfig({
  plugins: [
    preserveTelluxAssetUrls(),
    assertPeerDependenciesExternal(),
    assertBundleSizeBudgets([
      {
        name: 'core index',
        select: selectFilesMatching(/^index\.js$/),
        maxBytes: 640 * KiB,
        maxGzipBytes: 165 * KiB
      },
      {
        name: 'assets entry',
        select: selectFilesMatching(/^assets\.js$/),
        maxBytes: 4 * KiB,
        maxGzipBytes: 2 * KiB
      }
    ])
  ],
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
      external: isPeerDependencyExternal
    }
  }
})
