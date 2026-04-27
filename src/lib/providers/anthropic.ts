/**
 * Anthropic Messages API client (intended for Electron main only).
 */

export type AnthropicImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    data: string
  }
}

export type AnthropicTextBlock = {
  type: 'text'
  text: string
}

export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | (AnthropicTextBlock | AnthropicImageBlock)[]
}

/** Message shape after the first turn (tool loops, pause_turn) — content mirrors API JSON. */
export type AnthropicApiMessage = {
  role: 'user' | 'assistant'
  content: unknown
}

/** Concatenate assistant `text` blocks (ignores tool/server blocks). */
export function extractTextFromContentBlocks(content: unknown[] | undefined): string {
  if (!content || !Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text)
    }
  }
  return parts.join('') || ''
}
