export interface SandcastleExample {
  id: string
  title: string
  category: string
  description: string
  tags: string[]
  html: string
  javascript: string
  sourceHtmlPath: string
  sourceScriptPath: string
  thumbnail?: string
}

export type SandcastleEditorPane = "javascript" | "html"

export interface SandcastleRunPayload {
  html: string
  javascript: string
  compiledJavascript: string
}

export type SandboxLogLevel = "log" | "info" | "warn" | "error"

export interface SandboxLogMessage {
  type: "sandbox-log"
  level: SandboxLogLevel
  values: string[]
}

export interface SandboxReadyMessage {
  type: "sandbox-ready"
}

export interface SandboxErrorMessage {
  type: "sandbox-error"
  message: string
}

export type SandboxMessage =
  | SandboxReadyMessage
  | SandboxLogMessage
  | SandboxErrorMessage
