import type { ChatRequestPayload, ChatResponsePayload, SettingsPayload } from '@/lib/llm'

export type ElectronAPI = {
  getSettings: () => Promise<SettingsPayload>
  saveSettings: (partial: Partial<SettingsPayload>) => Promise<SettingsPayload>
  chat: (payload: ChatRequestPayload) => Promise<ChatResponsePayload>
  captureScreen: () => Promise<{ ok: true; base64Png: string } | { ok: false; error: string }>
  onShortcutToggle: (cb: () => void) => () => void
  /** Fires at the start of each model generation segment (e.g. after tool use). */
  onChatStreamReset: (cb: () => void) => () => void
  onChatStreamDelta: (cb: (text: string) => void) => () => void
}
