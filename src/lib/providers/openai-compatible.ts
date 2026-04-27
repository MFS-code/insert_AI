/**
 * OpenAI Chat Completions-compatible client (main process).
 */

export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type OpenAIMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | OpenAIContentPart[]
}

export async function openaiCompatibleChat(params: {
  baseUrl: string
  apiKey: string
  model: string
  messages: OpenAIMessage[]
}): Promise<{ text: string } | { error: string }> {
  const base = params.baseUrl.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: 4096,
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    return { error: raw || `HTTP ${res.status}` }
  }

  try {
    const json = JSON.parse(raw) as {
      choices?: { message?: { content?: string | OpenAIContentPart[] } }[]
      error?: { message?: string }
    }
    if (json.error?.message) {
      return { error: json.error.message }
    }
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string') {
      return { text: content }
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('')
      return { text: text || '(empty response)' }
    }
    return { error: 'Unexpected response shape' }
  } catch {
    return { error: 'Invalid JSON from provider' }
  }
}

type StreamHandler = { onReset: () => void; onTextDelta: (t: string) => void }

export async function openaiCompatibleChatStream(params: {
  baseUrl: string
  apiKey: string
  model: string
  messages: OpenAIMessage[]
  maxTokens: number
  stream: StreamHandler
}): Promise<{ text: string } | { error: string }> {
  const base = params.baseUrl.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  params.stream.onReset()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.maxTokens,
      stream: true,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { error: errText || `HTTP ${res.status}` }
  }

  const body = res.body
  if (!body) {
    return { error: 'No response body' }
  }

  const reader = body.getReader()
  const dec = new TextDecoder()
  let lineBuffer = ''
  let full = ''

  const processLine = (line: string): { error: string } | undefined => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return undefined
    const data = trimmed.slice(5).trim()
    if (data === '' || data === '[DONE]') return undefined
    try {
      const j = JSON.parse(data) as {
        choices?: { delta?: { content?: string | null; reasoning_content?: string } }[]
        error?: { message?: string }
      }
      if (j.error?.message) {
        return { error: j.error.message }
      }
      const c = j.choices?.[0]?.delta?.content
      if (typeof c === 'string' && c.length) {
        full += c
        params.stream.onTextDelta(c)
      }
      const r = j.choices?.[0]?.delta?.reasoning_content
      if (typeof r === 'string' && r.length) {
        full += r
        params.stream.onTextDelta(r)
      }
    } catch {
      /* ignore malformed */
    }
    return undefined
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) {
        lineBuffer += dec.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const err = processLine(line)
          if (err) return err
        }
      }
      if (done) {
        if (lineBuffer.trim()) {
          const err = processLine(lineBuffer)
          if (err) return err
        }
        break
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text: full || '(empty response)' }
}
