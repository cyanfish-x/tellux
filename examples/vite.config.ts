import { resolve } from "node:path"
import { defineConfig, loadEnv } from "vite"
import {
  assertBundleSizeBudgets,
  selectChunksContainingModules,
  selectFilesMatching,
  selectInitialEntryGraph,
} from "../src/build/bundleSizeBudget"

const projectRoot = resolve(__dirname, "..")
const KiB = 1024
const MiB = 1024 * KiB
const htmlInputs = {
  index: resolve(__dirname, "index.html"),
  gallery: resolve(__dirname, "gallery.html"),
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
  symbol: resolve(__dirname, "symbol.html"),
  groundClamp: resolve(__dirname, "ground-clamp.html"),
  groundClampPolygon: resolve(__dirname, "ground-clamp-polygon.html"),
  instancedHorses: resolve(__dirname, "instanced-horses.html"),
  mixedHeightSamplingHorses: resolve(__dirname, "mixed-height-sampling-horses.html"),
  vegetation: resolve(__dirname, "vegetation.html"),
  hismForest: resolve(__dirname, "hism/hism-forest.html"),
  hismCompare: resolve(__dirname, "hism/hism-compare.html"),
  sandcastle: resolve(__dirname, "sandcastle.html"),
  sandcastleRunner: resolve(__dirname, "sandcastle/runner.html"),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "")
  const geoserverProxyTarget =
    env.TELLUX_EXAMPLE_GEOSERVER_PROXY_TARGET ?? "http://localhost:8080"

  return {
    root: __dirname,
    plugins: [
      assertBundleSizeBudgets(
        [
          {
            name: "homepage initial JS",
            select: selectInitialEntryGraph("index"),
            maxBytes: 2.8 * MiB,
            maxGzipBytes: 800 * KiB,
          },
          {
            name: "Sandcastle editor initial JS",
            select: selectInitialEntryGraph("sandcastle"),
            maxBytes: 5.25 * MiB,
            maxGzipBytes: 1.35 * MiB,
          },
          {
            name: "Sandcastle runner initial JS",
            select: selectInitialEntryGraph("sandcastleRunner"),
            maxBytes: 3 * MiB,
            maxGzipBytes: 800 * KiB,
          },
          {
            name: "Tree optional capability",
            select: selectChunksContainingModules(["/@dgreenheck/ez-tree/"]),
            maxBytes: 4.25 * MiB,
            maxGzipBytes: 3.2 * MiB,
          },
          {
            name: "Gaussian Splat optional capability",
            select: selectChunksContainingModules([
              "/3d-tiles-rendererjs-3dgs-plugin/",
              "/@sparkjsdev/spark/",
            ]),
            maxBytes: 5.5 * MiB,
            maxGzipBytes: 2 * MiB,
          },
          {
            name: "TypeScript worker",
            select: selectFilesMatching(/^assets\/ts\.worker-.*\.js$/),
            maxBytes: 6.25 * MiB,
            maxGzipBytes: 1.6 * MiB,
          },
          {
            name: "editor worker",
            select: selectFilesMatching(/^assets\/editor\.worker-.*\.js$/),
            maxBytes: 300 * KiB,
            maxGzipBytes: 100 * KiB,
          },
        ],
        "tellux-assert-example-size-budgets"
      ),
    ],
    // 本地 dev（mode=development/production）用 "/"，部署构建（mode=ghpages）用 "/tellux/"。
    // 不通过 process.env.VITE_BASE 传 base，避免 Windows + Git Bash 的 MSYS2 路径转换
    // 把 "/tellux/" 错误改写成 "D:/Program Files/Git/tellux/"。
    base: mode === "ghpages" ? "/tellux/" : "/",
    envDir: projectRoot,
    optimizeDeps: {
      include: ["@mapbox/vector-tile", "pbf", "@sparkjsdev/spark", "3d-tiles-rendererjs-3dgs-plugin", "three-mesh-bvh"],
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
          target: "https://data.cyanfish.site",
          changeOrigin: true,
        },
        "/tianditu-administrative": {
          target: "https://api.tianditu.gov.cn",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tianditu-administrative/, ""),
        },
      },
    },
    build: {
      // 已由上方按入口 / 专用能力划分的预算替代 Vite 通用 500 kB warning。
      chunkSizeWarningLimit: 5600,
      rollupOptions: {
        input: htmlInputs,
      },
    },
  }
})
