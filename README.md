# InsertAI popup

macOS menu-bar style Electron app: global shortcut opens a compact LLM popup with optional screen context. Anthropic Claude and OpenAI-compatible APIs are supported.

## Develop

```bash
npm install
npm run dev
```

Use **Preferences** to set API keys and the global shortcut (default `Option+Space`). On macOS, grant **Screen Recording** when using screen context.

## Build

```bash
npm run build
npm run typecheck
```

After `npm run build`, the main process is at `dist-electron/main.js` and the renderer at `dist/`. From the project root you can run:

```bash
npx electron .
```

(`package.json` `"main"` points at `dist-electron/main.js`.)

**Terminal “hangs”:** Electron keeps the shell busy until the app exits. That is normal. Look for the menu bar tray icon, use your shortcut (default `Option+Space`) to open the popup, and choose **Quit** from the tray menu when you are done. You should also see a short `[InsertAI] Running…` line in the terminal when startup succeeds.

If the popup never appears, confirm you ran `npm run build` so `dist/` and `dist-electron/` exist; failed loads are logged to the same terminal.

## Privacy

API keys are stored under the app user data path using `safeStorage` when available. Screen captures are only taken when you enable **Include screen context** or use **Test capture**.
