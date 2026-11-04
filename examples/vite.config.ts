import { resolve } from "node:path"
import https from "node:https"
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite"
import { stripRuntimeDocumentationPlugin } from "../src/build/stripRuntimeDocumentation"
import {
  TIANDITU_DEV_TILE_PROXY_PREFIX,
  TIANDITU_SUBDOMAINS,
} from "./tiandituDevProxy"
import { EXPERIMENTAL_EXAMPLE_IDS } from "./experimental-examples"

/**
 * 生产构建时把实验页的 `?raw` 源码替换为空串，避免 Sandcastle 的 glob 将其打包；
 * registry 在非开发模式已跳过这些 id。
 */
function omitExperimentalExampleSourcesPlugin(): Plugin {
  const pattern = new RegExp(
    `[\\\\/]examples[\\\\/](?:${EXPERIMENTAL_EXAMPLE_IDS.join("|")})\\.(?:html|ts)\\?raw$`
  )
  return {
    name: "tellux-omit-experimental-example-sources",
    apply: "build",
    enforce: "pre",
    load(id) {
      return pattern.test(id) ? 'export default ""' : null
    },
  }
}

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

function attachTelluxRefererHeaders(
  refererOrigin: string
): NonNullable<ProxyOptions["configure"]> {
  const { origin, referer } = resolveTiandituDevReferer(refererOrigin)
  return (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      if (proxyReq.headersSent) return
      try {
        proxyReq.setHeader("Referer", referer)
        proxyReq.setHeader("Origin", origin)
      } catch {
        // 套接字已发出请求头时再 setHeader 会抛 ERR_HTTP_HEADERS_SENT 并干掉整个 Vite。
      }
    })
  }
}

/** data.cyanfish.site 偶发挂起时，必须在时限内结束浏览器请求，否则 HTTP/1.1 6 连接被占满，连 document 刷新都会卡住。 */
const DATA_SITE_PROXY_TIMEOUT_MS = 8_000
const dataSiteAgent = new https.Agent({
  keepAlive: false,
  timeout: DATA_SITE_PROXY_TIMEOUT_MS,
  maxSockets: 6,
})

function endProxyResponse(
  res: unknown,
  status: number,
  body: string
) {
  try {
    if (
      !res ||
      typeof (res as { writeHead?: unknown }).writeHead !== "function" ||
      (res as { headersSent?: boolean }).headersSent
    ) {
      return
    }
    const response = res as {
      writeHead: (code: number, headers: Record<string, string>) => void
      end: (payload: string) => void
    }
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" })
    response.end(body)
  } catch {
    // 浏览器已断开或响应已结束。
  }
}

function attachFailFastProxy(
  inner?: NonNullable<ProxyOptions["configure"]>
): NonNullable<ProxyOptions["configure"]> {
  return (proxy, options) => {
    inner?.(proxy, options)
    proxy.on("proxyReq", (proxyReq, _req, res) => {
      const timer = setTimeout(() => {
        endProxyResponse(res, 504, "data-site proxy timeout")
        proxyReq.destroy()
      }, DATA_SITE_PROXY_TIMEOUT_MS)
      proxyReq.on("response", () => clearTimeout(timer))
    })
    proxy.on("error", (error, _req, res) => {
      console.error("[vite] data-site proxy error:", error.message)
      endProxyResponse(res, 502, "data-site proxy error")
    })
  }
}

function createDataSiteProxy(
  refererOrigin?: string
): ProxyOptions {
  return {
    target: "https://data.cyanfish.site",
    changeOrigin: true,
    agent: dataSiteAgent,
    timeout: DATA_SITE_PROXY_TIMEOUT_MS,
    proxyTimeout: DATA_SITE_PROXY_TIMEOUT_MS,
    configure: attachFailFastProxy(
      refererOrigin ? attachTelluxRefererHeaders(refererOrigin) : undefined
    ),
  }
}

/**
 * 天地图浏览器端 key 校验 Referer。本地页面来源是 localhost，会被域名白名单
 * 拒绝；开发代理把请求转到 t{n}.tianditu.gov.cn，并改写成已备案域名。
 */
function createTiandituDevProxy(refererOrigin: string): Record<string, ProxyOptions> {
  const attachReferer = attachTelluxRefererHeaders(refererOrigin)

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
// 实验页（examples/experimental-examples.ts）只由开发服务直接提供，不列为生产构建入口。
const htmlInputs = {
  index: resolve(__dirname, "index.html"),
  gallery: resolve(__dirname, "gallery.html"),
  basic: resolve(__dirname, "basic.html"),
  earthAtNight: resolve(__dirname, "earth-at-night.html"),
  flyTo: resolve(__dirname, "fly-to.html"),
  dataSources: resolve(__dirname, "data-sources.html"),
  tiles3d: resolve(__dirname, "3d-tiles.html"),
  tiles3dPicking: resolve(__dirname, "3d-tiles-picking.html"),
  gaussianSplat3dTiles: resolve(__dirname, "gaussian-splat-3d-tiles.html"),
  googlePhotorealistic3dTiles: resolve(__dirname, "google-photorealistic-3d-tiles.html"),
  pointCloud3dTiles: resolve(__dirname, "point-cloud-3d-tiles.html"),
  terrain: resolve(__dirname, "terrain.html"),
  atmosphere: resolve(__dirname, "atmosphere.html"),
  atmosphereLocalMeadow: resolve(__dirname, "atmosphere-local-meadow.html"),
  webgpuBasic: resolve(__dirname, "webgpu-basic.html"),
  waterArea: resolve(__dirname, "water-area.html"),
  threejsInterop: resolve(__dirname, "threejs-interop.html"),
  entities: resolve(__dirname, "entities.html"),
  symbol: resolve(__dirname, "symbol.html"),
  groundClamp: resolve(__dirname, "ground-clamp.html"),
  groundClampPolygon: resolve(__dirname, "ground-clamp-polygon.html"),
  instancedHorses: resolve(__dirname, "instanced-horses.html"),
  mixedHeightSamplingHorses: resolve(__dirname, "mixed-height-sampling-horses.html"),
  hismForest: resolve(__dirname, "hism/hism-forest.html"),
  hismCompare: resolve(__dirname, "hism/hism-compare.html"),
  sandcastle: resolve(__dirname, "sandcastle.html"),
  sandcastleRunner: resolve(__dirname, "sandcastle/runner.html"),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "")
  const geoserverProxyTarget =
    env.TELLUX_EXAMPLE_GEOSERVER_PROXY_TARGET ?? "http://localhost:8080"
  const telluxDevReferer =
    env.TELLUX_TIANDITU_DEV_REFERER ?? "https://tellux.cyanfish.site/"
  const exampleProxy: Record<string, ProxyOptions> = {
    "/geoserver": {
      target: geoserverProxyTarget,
      changeOrigin: true,
    },
    "/3dtiles": createDataSiteProxy(),
    "/maptiles": createDataSiteProxy(telluxDevReferer),
    ...createTiandituDevProxy(telluxDevReferer),
  }

  return {
    root: __dirname,
    base: "/",
    envDir: projectRoot,
    optimizeDeps: {
      include: ["@mapbox/vector-tile", "pbf", "@sparkjsdev/spark", "3d-tiles-rendererjs-3dgs-plugin", "three-mesh-bvh"],
      exclude: ["leva-vanilla", "three-stylized"],
    },
    resolve: {
      // 链接包 three-stylized 在仓库外，Rollup 不会从它自己的 node_modules 找到 three。
      dedupe: ["three"],
      alias: [
        {
          find: /^three$/,
          replacement: resolve(projectRoot, "node_modules/three"),
        },
        {
          find: "leva-vanilla/gui",
          replacement: resolve(projectRoot, "../leva-vanilla/src/dom/gui.ts"),
        },
        {
          find: "leva-vanilla",
          replacement: resolve(projectRoot, "../leva-vanilla/src/index.ts"),
        },
        {
          find: "three-stylized",
          replacement: resolve(projectRoot, "../three-stylized/src/grass/index.ts"),
        },
      ],
    },
    plugins: [
      omitExperimentalExampleSourcesPlugin(),
      stripRuntimeDocumentationPlugin(),
      {
        name: "tellux-favicon",
        transformIndexHtml(html) {
          if (html.includes('rel="icon"')) return html
          return html.replace(
            "</head>",
            [
              '    <link rel="icon" href="/favicon.ico" sizes="32x32" />',
              '    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
              '    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
              "  </head>",
            ].join("\n")
          )
        },
      },
    ],
    server: {
      fs: {
        allow: [
          projectRoot,
          resolve(projectRoot, "../leva-vanilla"),
          resolve(projectRoot, "../three-stylized"),
        ],
      },
      proxy: exampleProxy,
    },
    preview: {
      proxy: exampleProxy,
    },
    build: {
      chunkSizeWarningLimit: 5600,
      rollupOptions: {
        input: htmlInputs,
      },
    },
  }
})
