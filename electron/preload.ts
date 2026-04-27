import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../src/types/electron-api'

const api: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),
  chat: (payload) => ipcRenderer.invoke('chat:complete', payload),
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  onShortcutToggle: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('shortcut:toggle', listener)
    return () => ipcRenderer.removeListener('shortcut:toggle', listener)
  },
  onChatStreamReset: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('chat:stream-reset', listener)
    return () => ipcRenderer.removeListener('chat:stream-reset', listener)
  },
  onChatStreamDelta: (cb) => {
    const listener = (_: unknown, text: string) => cb(text)
    ipcRenderer.on('chat:stream-delta', listener)
    return () => ipcRenderer.removeListener('chat:stream-delta', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
