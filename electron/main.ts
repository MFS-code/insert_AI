import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type NativeImage,
} from 'electron'
import { runChat } from './chat-service'
import { capturePrimaryScreenPngBase64 } from './screen-capture'
import { loadSettings, saveSettings } from './settings-store'

const __dirname = dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
let popup: BrowserWindow | null = null

function createTrayIcon(): NativeImage {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAKElEQVQ4jWNgGAWjgIpBxaBiUDGoGFQMKgYVg4pBxaBiUDGoGFQMKgYAgAAA//8DAD0lBRWfL0R0AAAAAElFTkSuQmCC'
  return nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'))
}

function positionPopup(win: BrowserWindow) {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea
  const bounds = win.getBounds()
  let px = cursor.x + 8
  let py = cursor.y + 8
  if (px + bounds.width > x + width) {
    px = x + width - bounds.width - 8
  }
  if (py + bounds.height > y + height) {
    py = y + height - bounds.height - 8
  }
  if (px < x) px = x + 8
  if (py < y) py = y + 8
  win.setPosition(Math.round(px), Math.round(py))
}

function createPopupWindow(): BrowserWindow {
  let allowBlurDismiss = false
  const win = new BrowserWindow({
    width: 520,
    height: 520,
    minWidth: 400,
    minHeight: 400,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    /** Square mask so frameless 2px borders are not clipped by macOS rounding */
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('blur', () => {
    if (!allowBlurDismiss) return
    if (!win.webContents.isDevToolsOpened()) {
      win.hide()
    }
  })

  win.on('show', () => {
    allowBlurDismiss = false
    setTimeout(() => {
      allowBlurDismiss = true
    }, 280)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[InsertAI] Renderer failed to load:', {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const htmlPath = join(__dirname, '../dist/index.html')
    void win.loadFile(htmlPath).catch((err) => {
      console.error(
        '[InsertAI] loadFile failed. Run `npm run build` first.\n',
        htmlPath,
        '\n',
        err,
      )
    })
  }

  return win
}

function togglePopup() {
  if (!popup) return
  if (popup.isVisible()) {
    popup.hide()
  } else {
    positionPopup(popup)
    popup.show()
    popup.focus()
  }
  popup.webContents.send('shortcut:toggle')
}

function registerGlobalShortcutFromSettings(): boolean {
  globalShortcut.unregisterAll()
  const s = loadSettings()
  const acc = s.globalShortcut?.trim() || 'Option+Space'
  const ok = globalShortcut.register(acc, () => {
    togglePopup()
  })
  return ok
}

function rebuildTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('InsertAI')
  const menu = Menu.buildFromTemplate([
    { label: 'Show popup', click: () => togglePopup() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    togglePopup()
  })
}

app.on('window-all-closed', () => {
  /* menu bar app: keep running */
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

void app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  popup = createPopupWindow()
  rebuildTray()
  registerGlobalShortcutFromSettings()

  console.info(
    '[InsertAI] Running. This process stays attached to your terminal until you quit (menu bar tray → Quit, or Cmd+Q while the popup is focused). Use the tray icon or your global shortcut to open the popup.',
  )

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, partial: unknown) => {
    const next = saveSettings((partial ?? {}) as Parameters<typeof saveSettings>[0])
    const ok = registerGlobalShortcutFromSettings()
    if (!ok) {
      console.warn('Failed to register global shortcut:', next.globalShortcut)
    }
    return next
  })

  ipcMain.handle('chat:complete', async (event, payload: unknown) => {
    const settings = loadSettings()
    const sender = event.sender
    return runChat(
      settings,
      payload as Parameters<typeof runChat>[1],
      {
        onReset: () => sender.send('chat:stream-reset'),
        onTextDelta: (text) => sender.send('chat:stream-delta', text),
      },
    )
  })

  ipcMain.handle('screen:capture', async () => capturePrimaryScreenPngBase64())
}).catch((err) => {
  console.error('[InsertAI] Startup failed:', err)
  app.quit()
})
