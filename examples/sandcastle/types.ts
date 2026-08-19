import type { LocalizedText } from "../i18n"

export interface SandcastleExample {
  id: string
  title: LocalizedText
  order?: number
  category: string
  description: LocalizedText
  tags: string[]
  html: string
  javascript: string
  sourceHtmlPath: string
  sourceScriptPath: string
  thumbnail?: string
}

export type SandcastleEditorPane = "javascript" | "html"

export interface SandcastleRunPayload {
  runId: string
  html: string
  /** 编辑器源码；runner 不消费，持久化时会省略以减小体积 */
  javascript: string
  compiledJavascript: string
}

/** iframe runner 实际执行的 payload（不含编辑器 TS 源码） */
export interface SandcastleRunnerPayload {
  runId: string
  html: string
  compiledJavascript: string
}

export interface SandboxRequestPayloadMessage {
  type: "sandbox-request-payload"
  runId: string
}

export interface SandboxRunPayloadMessage {
  type: "sandbox-run-payload"
  runId: string
  payload: SandcastleRunnerPayload
}

export type SandboxLogLevel = "log" | "info" | "warn" | "error"

export interface SandboxLogMessage {
  type: "sandbox-log"
  runId?: string
  level: SandboxLogLevel
  values: string[]
}

export interface SandboxReadyMessage {
  type: "sandbox-ready"
  runId?: string
}

export interface SandboxErrorMessage {
  type: "sandbox-error"
  runId?: string
  message: string
}

export type SandboxMessage =
  | SandboxReadyMessage
  | SandboxLogMessage
  | SandboxErrorMessage
  | SandboxRequestPayloadMessage
  | SandboxRunPayloadMessage
