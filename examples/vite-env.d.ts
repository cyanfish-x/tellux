/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本地开发时文档站 origin；由 `pnpm dev`（scripts/dev.mjs）注入。 */
  readonly VITE_TELLUX_DOCS_ORIGIN?: string
}
