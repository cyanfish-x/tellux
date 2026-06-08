export interface SandcastleExample {
  id: string
  title: string
  category: string
  description: string
  tags: string[]
  code: string
  thumbnail?: string
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
