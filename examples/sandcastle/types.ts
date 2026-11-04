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
  /** 仅开发服务展示的实验示例。 Experimental example shown only by the dev server. */
  experimental?: boolean
}

export type SandcastleEditorPane = "javascript" | "html"

export interface SandcastleRunPayload {
  runId: string
  html: string
  javascript: string
  compiledJavascript: string
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
