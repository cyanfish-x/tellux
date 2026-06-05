import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const geoserverProxyTarget = env.TELLUX_EXAMPLE_GEOSERVER_PROXY_TARGET ?? 'http://localhost:8080'

  return {
    root: __dirname,
    envDir: projectRoot,
    optimizeDeps: {
      include: ['@mapbox/vector-tile', 'pbf']
    },
    server: {
      fs: {
        allow: [projectRoot]
      },
      proxy: {
        '/geoserver': {
          target: geoserverProxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
