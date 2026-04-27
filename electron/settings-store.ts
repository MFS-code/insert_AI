import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { defaultSettings, type SettingsPayload } from '../src/lib/llm'

type PersistedShape = Omit<SettingsPayload, 'anthropicApiKey' | 'openaiApiKey'> & {
  anthropicApiKeyEnc?: string | null
  openaiApiKeyEnc?: string | null
}

const SETTINGS_FILE = 'settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function encryptField(plain: string): string | null {
  if (!plain) return null
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(plain, 'utf8').toString('base64')
  }
  return Buffer.from(safeStorage.encryptString(plain)).toString('base64')
}

function decryptField(enc: string | null | undefined, fallback = ''): string {
  if (!enc) return fallback
  const buf = Buffer.from(enc, 'base64')
  if (!safeStorage.isEncryptionAvailable()) {
    return buf.toString('utf8')
  }
  try {
    return safeStorage.decryptString(buf)
  } catch {
    return buf.toString('utf8')
  }
}

export function loadSettings(): SettingsPayload {
  const p = settingsPath()
  if (!existsSync(p)) {
    return { ...defaultSettings }
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as PersistedShape
    return {
      provider: raw.provider ?? defaultSettings.provider,
      anthropicApiKey: decryptField(raw.anthropicApiKeyEnc, ''),
      openaiApiKey: decryptField(raw.openaiApiKeyEnc, ''),
      openaiBaseUrl: raw.openaiBaseUrl ?? defaultSettings.openaiBaseUrl,
      anthropicModel: raw.anthropicModel ?? defaultSettings.anthropicModel,
      openaiModel: raw.openaiModel ?? defaultSettings.openaiModel,
      globalShortcut: raw.globalShortcut ?? defaultSettings.globalShortcut,
      systemPrompt: raw.systemPrompt ?? defaultSettings.systemPrompt,
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(partial: Partial<SettingsPayload>): SettingsPayload {
  const current = loadSettings()
  const next: SettingsPayload = { ...current, ...partial }
  const dir = dirname(settingsPath())
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const persisted: PersistedShape = {
    provider: next.provider,
    openaiBaseUrl: next.openaiBaseUrl,
    anthropicModel: next.anthropicModel,
    openaiModel: next.openaiModel,
    globalShortcut: next.globalShortcut,
    systemPrompt: next.systemPrompt,
    anthropicApiKeyEnc: encryptField(next.anthropicApiKey) ?? undefined,
    openaiApiKeyEnc: encryptField(next.openaiApiKey) ?? undefined,
  }
  writeFileSync(settingsPath(), JSON.stringify(persisted, null, 2), 'utf8')
  return next
}
