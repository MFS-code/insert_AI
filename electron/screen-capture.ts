import { desktopCapturer, screen } from 'electron'

export async function capturePrimaryScreenPngBase64(): Promise<
  { ok: true; base64Png: string } | { ok: false; error: string }
> {
  try {
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    const thumbW = Math.min(1280, width)
    const thumbH = Math.min(720, height)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: thumbW, height: thumbH },
    })
    if (!sources.length) {
      return {
        ok: false,
        error:
          'No screen sources. On macOS, grant Screen Recording in System Settings > Privacy & Security.',
      }
    }
    const primarySource =
      sources.find((s) => s.display_id === String(primary.id)) ?? sources[0]
    const img = primarySource.thumbnail
    if (img.isEmpty()) {
      return {
        ok: false,
        error: 'Empty thumbnail. Check Screen Recording permission for this app.',
      }
    }
    const png = img.toPNG()
    return { ok: true, base64Png: png.toString('base64') }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
