import { resolve } from "node:path"
import { defineConfig, loadEnv } from "vite"

const projectRoot = resolve(__dirname, "..")
const htmlInputs = {
  index: resolve(__dirname, "index.html"),
  blank: resolve(__dirname, "blank.html"),
  basic: resolve(__dirname, "basic.html"),
  flyTo: resolve(__dirname, "fly-to.html"),
  dataSources: resolve(__dirname, "data-sources.html"),
  tiles3d: resolve(__dirname, "3d-tiles.html"),
  tiles3dPicking: resolve(__dirname, "3d-tiles-picking.html"),
  gaussianSplat3dTiles: resolve(__dirname, "gaussian-splat-3d-tiles.html"),
  googlePhotorealistic3dTiles: resolve(__dirname, "google-photorealistic-3d-tiles.html"),
  terrain: resolve(__dirname, "terrain.html"),
  atmosphere: resolve(__dirname, "atmosphere.html"),
  webgpuBasic: resolve(__dirname, "webgpu-basic.html"),
  threejsInterop: resolve(__dirname, "threejs-interop.html"),
  entities: resolve(__dirname, "entities.html"),
  instancedHorses: resolve(__dirname, "instanced-horses.html"),
  mixedHeightSamplingHorses: resolve(__dirname, "mixed-height-sampling-horses.html"),
  sandcastle: resolve(__dirname, "sandcastle.html"),
  sandcastleRunner: resolve(__dirname, "sandcastle/runner.html"),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "")
  const geoserverProxyTarget =
    env.TELLUX_EXAMPLE_GEOSERVER_PROXY_TARGET ?? "http://localhost:8080"

  return {
    root: __dirname,
    // 本地 dev（mode=development/production）用 "/"，部署构建（mode=ghpages）用 "/tellux/"。
    // 不通过 process.env.VITE_BASE 传 base，避免 Windows + Git Bash 的 MSYS2 路径转换
    // 把 "/tellux/" 错误改写成 "D:/Program Files/Git/tellux/"。
    base: mode === "ghpages" ? "/tellux/" : "/",
    envDir: projectRoot,
    optimizeDeps: {
      include: ["@mapbox/vector-tile", "pbf", "@sparkjsdev/spark", "3d-tiles-rendererjs-3dgs-plugin"],
    },
    server: {
      fs: {
        allow: [projectRoot],
      },
      proxy: {
        "/geoserver": {
          target: geoserverProxyTarget,
          changeOrigin: true,
        },
        "/3dtiles": {
          target: "http://localhost",
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        input: htmlInputs,
      },
    },
  }
})
