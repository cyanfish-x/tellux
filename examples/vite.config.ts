import { resolve } from "node:path"
import { defineConfig, loadEnv, type ProxyOptions } from "vite"
import {
  assertBundleSizeBudgets,
  selectChunksContainingModules,
  selectFilesMatching,
  selectInitialEntryGraph,
} from "../src/build/bundleSizeBudget"
import {
  TIANDITU_DEV_TILE_PROXY_PREFIX,
  TIANDITU_SUBDOMAINS,
} from "./tiandituDevProxy"

function resolveTiandituDevReferer(raw: string): { origin: string; referer: string } {
  try {
    const parsed = new URL(raw)
    return {
      origin: parsed.origin,
      referer: `${parsed.origin}/`,
    }
  } catch {
    return {
      origin: "https://tellux.cyanfish.site",
      referer: "https://tellux.cyanfish.site/",
    }
  }
}

/**
 * 天地图浏览器端 key 校验 Referer。本地页面来源是 localhost，会被域名白名单
 * 拒绝；开发代理把请求转到 t{n}.tianditu.gov.cn，并改写成已备案域名。
 */
function createTiandituDevProxy(refererOrigin: string): Record<string, ProxyOptions> {
  const { origin, referer } = resolveTiandituDevReferer(refererOrigin)
  const attachReferer: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader("Referer", referer)
      proxyReq.setHeader("Origin", origin)
    })
  }

  const tileProxies = Object.fromEntries(
    TIANDITU_SUBDOMAINS.map((subdomain) => [
      `${TIANDITU_DEV_TILE_PROXY_PREFIX}/${subdomain}`,
      {
        target: `https://t${subdomain}.tianditu.gov.cn`,
        changeOrigin: true,
        rewrite: (path: string) =>
          path.replace(
            new RegExp(`^${TIANDITU_DEV_TILE_PROXY_PREFIX}/${subdomain}`),
            ""
          ),
        configure: attachReferer,
      } satisfies ProxyOptions,
    ])
  )

  return {
    "/tianditu-administrative": {
      target: "https://api.tianditu.gov.cn",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/tianditu-administrative/, ""),
      configure: attachReferer,
    },
    ...tileProxies,
  }
}

const projectRoot = resolve(__dirname, "..")
const KiB = 1024
const MiB = 1024 * KiB
const htmlInputs = {
  renderingMediumIntegration: resolve(__dirname, "rendering-medium-integration.html"),
  renderingStages: resolve(__dirname, "rendering-stages.html"),
  renderingSplatAtmosphere: resolve(__dirname, "rendering-splat-atmosphere.html"),
  renderingCloudTransparency: resolve(__dirname, "rendering-cloud-transparency.html"),
  index: resolve(__dirname, "index.html"),
  gallery: resolve(__dirname, "gallery.html"),
  basic: resolve(__dirname, "basic.html"),
  flyTo: resolve(__dirname, "fly-to.html"),
  dataSources: resolve(__dirname, "data-sources.html"),
  tiles3d: resolve(__dirname, "3d-tiles.html"),
  tiles3dPicking: resolve(__dirname, "3d-tiles-picking.html"),
  gaussianSplat3dTiles: resolve(__dirname, "gaussian-splat-3d-tiles.html"),
  googlePhotorealistic3dTiles: resolve(__dirname, "google-photorealistic-3d-tiles.html"),
  pointCloud3dTiles: resolve(__dirname, "point-cloud-3d-tiles.html"),
  terrain: resolve(__dirname, "terrain.html"),
  atmosphere: resolve(__dirname, "atmosphere.html"),
  webgpuBasic: resolve(__dirname, "webgpu-basic.html"),
  waterArea: resolve(__dirname, "water-area.html"),
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
  const exampleProxy: Record<string, ProxyOptions> = {
    "/geoserver": {
      target: geoserverProxyTarget,
      changeOrigin: true,
    },
    "/3dtiles": {
      target: "https://data.cyanfish.site",
      changeOrigin: true,
    },
    ...createTiandituDevProxy(
      env.TELLUX_TIANDITU_DEV_REFERER ?? "https://tellux.cyanfish.site/"
    ),
  }

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
            name: "Water Area worker",
            select: selectFilesMatching(/^assets\/worker-.*\.js$/),
            maxBytes: 256 * KiB,
            maxGzipBytes: 80 * KiB,
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
      exclude: ["leva-vanilla"],
    },
    resolve: {
      alias: [
        {
          find: "leva-vanilla/gui",
          replacement: resolve(projectRoot, "../leva-vanilla/src/dom/gui.ts"),
        },
        {
          find: "leva-vanilla",
          replacement: resolve(projectRoot, "../leva-vanilla/src/index.ts"),
        },
      ],
    },
    server: {
      fs: {
        allow: [projectRoot, resolve(projectRoot, "../leva-vanilla")],
      },
      proxy: exampleProxy,
    },
    preview: {
      proxy: exampleProxy,
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
