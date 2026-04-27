import { useCallback, useEffect, useState } from 'react'
import type { ProviderId, SettingsPayload } from '@/lib/llm'
import { defaultSettings, providerLabel } from '@/lib/llm'
import { MarkdownResponse } from '@/MarkdownResponse'

export default function App() {
  const [settings, setSettings] = useState<SettingsPayload>(defaultSettings)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeScreenshot, setIncludeScreenshot] = useState(false)
  const [previewShot, setPreviewShot] = useState<string | null>(null)

  const refreshSettings = useCallback(async () => {
    const s = await window.api.getSettings()
    setSettings(s)
  }, [])

  useEffect(() => {
    void refreshSettings()
  }, [refreshSettings])

  useEffect(() => {
    return window.api.onShortcutToggle(() => {
      void refreshSettings()
    })
  }, [refreshSettings])

  useEffect(() => {
    const unReset = window.api.onChatStreamReset(() => {
      setResponse('')
    })
    const unDelta = window.api.onChatStreamDelta((t) => {
      setResponse((r) => r + t)
    })
    return () => {
      unReset()
      unDelta()
    }
  }, [])

  const runCapturePreview = async () => {
    setError(null)
    const r = await window.api.captureScreen()
    if (r.ok) {
      setPreviewShot(`data:image/png;base64,${r.base64Png}`)
    } else {
      setPreviewShot(null)
      setError(r.error)
    }
  }

  const submit = useCallback(async () => {
    if (busy) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setResponse('')
    try {
      const res = await window.api.chat({
        prompt: trimmed,
        includeScreenshot,
      })
      if (res.ok) {
        setResponse(res.text)
      } else {
        setError(res.error)
        setResponse('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResponse('')
    } finally {
      setBusy(false)
    }
  }, [busy, prompt, includeScreenshot])

  const savePrefs = async (next: Partial<SettingsPayload>) => {
    const merged = await window.api.saveSettings(next)
    setSettings(merged)
  }

  return (
    <div className="shell">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-slug" aria-hidden>
            IA
          </span>
          <span className="title">INSERT_AI</span>
        </div>
        <button
          type="button"
          className="prefs-toggle"
          onClick={() => setPrefsOpen((v) => !v)}
          aria-expanded={prefsOpen}
        >
          {prefsOpen ? '[ CLOSE ]' : '[ CONFIG ]'}
        </button>
      </header>

      {prefsOpen ? (
        <div className="prefs">
          <label className="field">
            <span>PROVIDER</span>
            <select
              value={settings.provider}
              onChange={(e) => void savePrefs({ provider: e.target.value as ProviderId })}
            >
              <option value="anthropic">{providerLabel('anthropic')}</option>
              <option value="openai-compatible">{providerLabel('openai-compatible')}</option>
            </select>
          </label>

          {settings.provider === 'anthropic' ? (
            <>
              <label className="field">
                <span>ANTHROPIC_KEY</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.anthropicApiKey}
                  onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
                  onBlur={(e) => void savePrefs({ anthropicApiKey: e.target.value })}
                />
              </label>
              <label className="field">
                <span>MODEL_ID</span>
                <input
                  value={settings.anthropicModel}
                  onChange={(e) => setSettings((s) => ({ ...s, anthropicModel: e.target.value }))}
                  onBlur={(e) => void savePrefs({ anthropicModel: e.target.value })}
                />
              </label>
              <p className="hint">
                Tool use is on for Anthropic: <code>web_search</code> (turn on in Claude Console org settings
                if disabled), plus local tools for math, time, word counts, and APA-style reference lines.
              </p>
            </>
          ) : (
            <>
              <label className="field">
                <span>BASE_URL</span>
                <input
                  value={settings.openaiBaseUrl}
                  onChange={(e) => setSettings((s) => ({ ...s, openaiBaseUrl: e.target.value }))}
                  onBlur={(e) => void savePrefs({ openaiBaseUrl: e.target.value })}
                />
              </label>
              <label className="field">
                <span>API_KEY</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.openaiApiKey}
                  onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
                  onBlur={(e) => void savePrefs({ openaiApiKey: e.target.value })}
                />
              </label>
              <label className="field">
                <span>MODEL_ID</span>
                <input
                  value={settings.openaiModel}
                  onChange={(e) => setSettings((s) => ({ ...s, openaiModel: e.target.value }))}
                  onBlur={(e) => void savePrefs({ openaiModel: e.target.value })}
                />
              </label>
            </>
          )}

          <label className="field field-block">
            <span>SYSTEM_PROMPT</span>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder="// optional — applied to every request"
              value={settings.systemPrompt}
              onChange={(e) => setSettings((s) => ({ ...s, systemPrompt: e.target.value }))}
              onBlur={(e) => void savePrefs({ systemPrompt: e.target.value })}
            />
          </label>

          <label className="field">
            <span>HOTKEY</span>
            <input
              value={settings.globalShortcut}
              onChange={(e) => setSettings((s) => ({ ...s, globalShortcut: e.target.value }))}
              onBlur={(e) => void savePrefs({ globalShortcut: e.target.value })}
              placeholder="Option+Space"
            />
          </label>
          <p className="hint">
            Electron accelerator syntax. Examples: <code>Option+Space</code>,{' '}
            <code>CommandOrControl+Shift+I</code>
          </p>
        </div>
      ) : null}

      <div className="body">
        <section className="block chat-panel" aria-label="Input">
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeScreenshot}
              onChange={(e) => setIncludeScreenshot(e.target.checked)}
            />
            <span className="toggle-label">CAPTURE_DISPLAY_AS_CONTEXT</span>
          </label>
          {includeScreenshot ? (
            <div className="shot-row">
              <button type="button" className="secondary" onClick={() => void runCapturePreview()}>
                TEST_CAPTURE
              </button>
              {previewShot ? <img className="thumb" src={previewShot} alt="Preview" /> : null}
            </div>
          ) : null}

          <textarea
            className="prompt"
            placeholder="> query (Enter send · Shift+Enter newline)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
              e.preventDefault()
              void submit()
            }}
            rows={5}
          />

          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
              {busy ? 'RUNNING' : 'EXECUTE'}
            </button>
          </div>
        </section>

        {busy ? (
          <div className="block await-panel" aria-live="polite" aria-busy="true">
            <div className="await-label">MODEL_PENDING</div>
            <div className="await-bars" title="Waiting for response">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}

        {error ? <div className="banner error">{error}</div> : null}

        {response ? (
          <section className="block response" aria-label="Output">
            <div className="response-label">STDOUT</div>
            <div className="response-md">
              <MarkdownResponse text={response} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
