/**
 * Shared types and provider routing metadata for the popup LLM.
 * Actual HTTP calls run in the Electron main process.
 */

export type ProviderId = 'anthropic' | 'openai-compatible'

export type SettingsPayload = {
  provider: ProviderId
  /** Anthropic API key */
  anthropicApiKey: string
  /** OpenAI-compatible API key */
  openaiApiKey: string
  /** Base URL for OpenAI-compatible APIs (e.g. https://api.openai.com/v1) */
  openaiBaseUrl: string
  anthropicModel: string
  openaiModel: string
  globalShortcut: string
  /** Optional instructions sent as the API system prompt for every request */
  systemPrompt: string
}

export const defaultSettings: SettingsPayload = {
  provider: 'anthropic',
  anthropicApiKey: '',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  anthropicModel: 'claude-3-5-sonnet-20241022',
  openaiModel: 'gpt-4o',
  globalShortcut: 'Option+Space',
  systemPrompt: '',
}

export type ChatRequestPayload = {
  prompt: string
  includeScreenshot: boolean
  /** Optional override; if omitted, main uses saved settings */
  provider?: ProviderId
  model?: string
}

/** Optional streaming hooks for the main process to push text as it arrives (lower perceived latency). */
export type ChatStreamCallbacks = {
  onReset: () => void
  onTextDelta: (text: string) => void
}

export type ChatResponsePayload =
  | { ok: true; text: string }
  | { ok: false; error: string }

export function providerLabel(id: ProviderId): string {
  switch (id) {
    case 'anthropic':
      return 'Anthropic'
    case 'openai-compatible':
      return 'OpenAI-compatible'
    default: {
      const _exhaustive: never = id
      return _exhaustive
    }
  }
}
