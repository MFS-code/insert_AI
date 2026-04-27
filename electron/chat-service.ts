import type {
  ChatRequestPayload,
  ChatResponsePayload,
  ChatStreamCallbacks,
  SettingsPayload,
} from '../src/lib/llm'
import {
  buildAnthropicSystemWithTools,
  runAnthropicWithTools,
  toApiMessages,
} from './anthropic-agent'
import type { AnthropicMessage } from '../src/lib/providers/anthropic'
import {
  openaiCompatibleChat,
  openaiCompatibleChatStream,
  type OpenAIMessage,
} from '../src/lib/providers/openai-compatible'
import { capturePrimaryScreenPngBase64 } from './screen-capture'

export async function runChat(
  settings: SettingsPayload,
  payload: ChatRequestPayload,
  stream?: ChatStreamCallbacks,
): Promise<ChatResponsePayload> {
  const provider = payload.provider ?? settings.provider
  const prompt = payload.prompt.trim()
  if (!prompt) {
    return { ok: false, error: 'Prompt is empty.' }
  }

  let imageBase64: string | undefined
  if (payload.includeScreenshot) {
    const cap = await capturePrimaryScreenPngBase64()
    if (!cap.ok) {
      return { ok: false, error: cap.error }
    }
    imageBase64 = cap.base64Png
  }

  const system = settings.systemPrompt?.trim() || undefined

  if (provider === 'anthropic') {
    const key = settings.anthropicApiKey.trim()
    if (!key) {
      return { ok: false, error: 'Missing Anthropic API key. Open Preferences.' }
    }
    const model = payload.model ?? settings.anthropicModel
    const userContent: AnthropicMessage['content'] = imageBase64
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ]
      : prompt

    const systemWithTools = buildAnthropicSystemWithTools(system)
    const res = await runAnthropicWithTools({
      apiKey: key,
      model,
      maxTokens: 8192,
      initialMessages: toApiMessages(userContent),
      system: systemWithTools,
      onStream: stream,
    })
    if ('error' in res) {
      return { ok: false, error: res.error }
    }
    return { ok: true, text: res.text }
  }

  const key = settings.openaiApiKey.trim()
  if (!key) {
    return { ok: false, error: 'Missing OpenAI-compatible API key. Open Preferences.' }
  }
  const model = payload.model ?? settings.openaiModel
  const baseUrl = settings.openaiBaseUrl.trim() || 'https://api.openai.com/v1'

  const content: OpenAIMessage['content'] = imageBase64
    ? [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${imageBase64}`,
          },
        },
        { type: 'text', text: prompt },
      ]
    : prompt

  const messages: OpenAIMessage[] = system
    ? [
        { role: 'system', content: system },
        { role: 'user', content },
      ]
    : [{ role: 'user', content }]
  if (stream) {
    const res = await openaiCompatibleChatStream({
      baseUrl,
      apiKey: key,
      model,
      messages,
      maxTokens: 4096,
      stream,
    })
    if ('error' in res) {
      return { ok: false, error: res.error }
    }
    return { ok: true, text: res.text }
  }

  const res = await openaiCompatibleChat({
    baseUrl,
    apiKey: key,
    model,
    messages,
  })
  if ('error' in res) {
    return { ok: false, error: res.error }
  }
  return { ok: true, text: res.text }
}
