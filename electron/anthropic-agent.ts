import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageParam, ToolUnion } from '@anthropic-ai/sdk/resources/messages'
import {
  extractTextFromContentBlocks,
  type AnthropicApiMessage,
  type AnthropicMessage,
} from '../src/lib/providers/anthropic'

const MAX_AGENT_STEPS = 28
const MAX_PAUSE_CONTINUATIONS = 12

/** Shown with the user system prompt so the model knows how to use tools for coursework. */
const TOOL_USE_COACH =
  'Tooling: you have web_search, calculator (arithmetic only), get_clock, count_words, format_citation_apa7. Ground course concepts in materials the user gives; use web_search for current facts, stats, or policy; cite returned URLs; use count_words for limits.'

export function buildAnthropicSystemWithTools(userSystem: string | undefined): string {
  const u = userSystem?.trim()
  if (u) {
    return `${u}\n\n---\n${TOOL_USE_COACH}`
  }
  return TOOL_USE_COACH
}

/** Server + client tools tuned for research, essays, and timed assessments. */
export function insertAiAnthropicTools(): unknown[] {
  return [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 4,
    },
    {
      name: 'calculator',
      description:
        'Evaluates a single arithmetic expression using only numbers, parentheses, and + - * /. Use for percentages, rates, sample-size arithmetic, or any numeric step in a problem. Does not interpret words or units—pass pure math (e.g. "(42/100)*230").',
      input_schema: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Arithmetic only, e.g. "((15+3)/2)*4"',
          },
        },
        required: ['expression'],
      },
    },
    {
      name: 'get_clock',
      description:
        'Returns the current date and time in ISO UTC, Unix milliseconds, and a human-readable local string. Optional IANA timezone (e.g. "America/New_York") for exam deadlines or locale-specific framing.',
      input_schema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Optional IANA timezone id, e.g. America/Los_Angeles',
          },
        },
      },
    },
    {
      name: 'count_words',
      description:
        'Counts words and characters in a draft answer or paragraph. Use when the user gives a word limit or asks whether a response fits a length constraint.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The prose to measure' },
        },
        required: ['text'],
      },
    },
    {
      name: 'format_citation_apa7',
      description:
        'Builds a single reference-list style line (APA 7 inspired, simplified). Use when the user wants a bibliography line for a book, journal article, or webpage they named. Not a substitute for course-specific citation rules—adjust in prose if their syllabus differs.',
      input_schema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['book', 'journal_article', 'webpage'],
          },
          authors: { type: 'string', description: 'e.g. Durkheim, E.' },
          year: { type: 'string' },
          title: { type: 'string' },
          publisher: { type: 'string', description: 'For book' },
          journal: { type: 'string', description: 'Journal name for article' },
          volume_issue_pages: { type: 'string', description: 'e.g. 12(3), 45–60' },
          site_name: { type: 'string', description: 'For webpage' },
          url: { type: 'string' },
          accessed: { type: 'string', description: 'Retrieval date if needed' },
        },
        required: ['mode', 'title'],
      },
    },
  ]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function runCalculator(input: unknown): string {
  const expr = isRecord(input) && typeof input.expression === 'string' ? input.expression.trim() : ''
  if (!expr) {
    return JSON.stringify({ error: 'Missing expression' })
  }
  if (expr.length > 220) {
    return JSON.stringify({ error: 'Expression too long' })
  }
  const compact = expr.replace(/\s+/g, '')
  if (!/^[\d.+\-*/()]+$/.test(compact)) {
    return JSON.stringify({
      error: 'Only digits, decimal point, parentheses, + - * / are allowed (no letters or functions).',
    })
  }
  try {
    const n = Function(`"use strict"; return (${compact});`)() as unknown
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return JSON.stringify({ error: 'Result is not a finite number' })
    }
    return JSON.stringify({ value: n })
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Evaluation failed' })
  }
}

function runGetClock(input: unknown): string {
  const tz =
    isRecord(input) && typeof input.timezone === 'string' ? input.timezone.trim() : ''
  const now = new Date()
  const base: Record<string, string> = {
    iso_utc: now.toISOString(),
    unix_ms: String(now.getTime()),
  }
  if (!tz) {
    base.local_display = now.toString()
    base.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'host-local'
    return JSON.stringify(base)
  }
  try {
    base.local_display = now.toLocaleString('en-CA', { timeZone: tz, hour12: false })
    base.timezone = tz
    return JSON.stringify(base)
  } catch {
    return JSON.stringify({ error: `Invalid timezone: ${tz}` })
  }
}

function runCountWords(input: unknown): string {
  const text = isRecord(input) && typeof input.text === 'string' ? input.text : ''
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  return JSON.stringify({ words, characters: text.length })
}

function runFormatCitationApa7(input: unknown): string {
  if (!isRecord(input)) {
    return JSON.stringify({ error: 'Invalid input' })
  }
  const mode = input.mode
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (mode !== 'book' && mode !== 'journal_article' && mode !== 'webpage') {
    return JSON.stringify({ error: 'mode must be book, journal_article, or webpage' })
  }
  if (!title) {
    return JSON.stringify({ error: 'title is required' })
  }
  const authors = typeof input.authors === 'string' ? input.authors.trim() : ''
  const year = typeof input.year === 'string' ? input.year.trim() : 'n.d.'
  const a = authors || 'Author unknown'

  if (mode === 'book') {
    const pub = typeof input.publisher === 'string' ? input.publisher.trim() : ''
    const line = pub ? `${a} (${year}). ${title}. ${pub}.` : `${a} (${year}). ${title}.`
    return JSON.stringify({ reference_line: line })
  }
  if (mode === 'journal_article') {
    const j = typeof input.journal === 'string' ? input.journal.trim() : ''
    const vip = typeof input.volume_issue_pages === 'string' ? input.volume_issue_pages.trim() : ''
    const bits = [a, `(${year}).`, title + '.', j && `${j},`, vip && `${vip}.`].filter(Boolean)
    return JSON.stringify({ reference_line: bits.join(' ') })
  }
  const site = typeof input.site_name === 'string' ? input.site_name.trim() : ''
  const url = typeof input.url === 'string' ? input.url.trim() : ''
  const acc = typeof input.accessed === 'string' ? input.accessed.trim() : ''
  const tail = [site && `${site}.`, url && `${url}`, acc && `Retrieved ${acc}`].filter(Boolean).join(' ')
  const line = `${a} (${year}). ${title}. ${tail}`.replace(/\s+\./g, '.').trim()
  return JSON.stringify({ reference_line: line })
}

function executeClientTool(name: string, input: unknown): string {
  switch (name) {
    case 'calculator':
      return runCalculator(input)
    case 'get_clock':
      return runGetClock(input)
    case 'count_words':
      return runCountWords(input)
    case 'format_citation_apa7':
      return runFormatCitationApa7(input)
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

function collectToolUseBlocks(content: unknown[] | undefined): Array<{
  id: string
  name: string
  input: unknown
}> {
  const out: Array<{ id: string; name: string; input: unknown }> = []
  if (!content) return out
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type !== 'tool_use') continue
    if (typeof block.id !== 'string' || typeof block.name !== 'string') continue
    out.push({ id: block.id, name: block.name, input: 'input' in block ? block.input : {} })
  }
  return out
}

export type AnthropicStreamHandlers = {
  onReset: () => void
  onTextDelta: (s: string) => void
}

export async function runAnthropicWithTools(params: {
  apiKey: string
  model: string
  maxTokens: number
  initialMessages: AnthropicApiMessage[]
  system?: string
  onStream?: AnthropicStreamHandlers
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const client = new Anthropic({ apiKey: params.apiKey })
  const tools = insertAiAnthropicTools() as ToolUnion[]
  const messages: AnthropicApiMessage[] = [...params.initialMessages]
  let pauseChain = 0

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    let data: Message
    try {
      const stream = client.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: messages as MessageParam[],
        system: params.system,
        tools,
      })
      params.onStream?.onReset()
      if (params.onStream) {
        stream.on('text', (delta) => {
          params.onStream!.onTextDelta(delta)
        })
      }
      data = await stream.finalMessage()
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }

    const stop = data.stop_reason ?? ''
    const content = data.content as unknown[] | undefined

    if (stop === 'pause_turn') {
      pauseChain++
      if (pauseChain > MAX_PAUSE_CONTINUATIONS) {
        return { ok: false, error: 'Too many pause_turn continuations (web search still running?).' }
      }
      messages.push({ role: 'assistant', content: content ?? [] })
      continue
    }

    pauseChain = 0

    const uses = collectToolUseBlocks(content)
    if (uses.length > 0) {
      messages.push({ role: 'assistant', content: content ?? [] })
      const toolResults = uses.map((u) => {
        const result = executeClientTool(u.name, u.input)
        let isErr = false
        try {
          const parsed = JSON.parse(result) as Record<string, unknown>
          isErr = typeof parsed.error === 'string'
        } catch {
          isErr = false
        }
        return {
          type: 'tool_result',
          tool_use_id: u.id,
          ...(isErr ? { is_error: true as const } : {}),
          content: result,
        }
      })
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    const text = extractTextFromContentBlocks(content)
    if (text) {
      return { ok: true, text }
    }
    if (stop === 'max_tokens') {
      return { ok: true, text: text || '(max tokens reached with no text output)' }
    }
    return { ok: true, text: text || '(empty response)' }
  }

  return { ok: false, error: 'Tool loop exceeded safety limit of steps.' }
}

export function toApiMessages(initialUserContent: AnthropicMessage['content']): AnthropicApiMessage[] {
  return [{ role: 'user', content: initialUserContent as unknown }]
}
