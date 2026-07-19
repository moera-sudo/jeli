/**
 * Rasterises an SVG string to a PNG/JPEG file and triggers a download.
 *
 * Kept fully asynchronous so the UI thread stays responsive while exporting:
 *  - `img.decode()` awaits image decoding off the main loop;
 *  - `canvas.toBlob()` encodes asynchronously (unlike the synchronous, base64
 *    `toDataURL`), so the browser tab remains interactive;
 *  - the result is handed out as an object URL (cheaper than a data URL) and
 *    revoked once the download has started.
 */

const MIME = { png: 'image/png', jpeg: 'image/jpeg' }
const EXT = { png: 'png', jpeg: 'jpg' }

/**
 * @param {string} svg                     Self-contained SVG markup.
 * @param {object} [options]
 * @param {'png'|'jpeg'} [options.format]  Output format. Defaults to 'png'.
 * @param {string} [options.fileName]      File name without extension.
 * @param {number} [options.scale]         Pixel density multiplier (sharper output).
 * @param {number} [options.quality]       JPEG quality 0–1.
 * @returns {Promise<void>}
 */
export async function downloadSvgAsImage(
  svg,
  { format = 'png', fileName = 'export', scale = 2, quality = 0.92 } = {},
) {
  const mime = MIME[format] ?? MIME.png
  const ext = EXT[format] ?? EXT.png

  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d')
  // JPEG has no alpha channel — paint an opaque background first.
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image encoding failed'))),
      mime,
      quality,
    )
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the download a tick to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
