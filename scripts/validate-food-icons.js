const fs = require('fs')
const path = require('path')

const manifestPath = path.join(__dirname, '..', 'food_icon_manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const root = path.resolve(__dirname, '..')
const failures = []

function normalizeOutputPath(item) {
  return String(item.output_path || item.target_path || '').replace(/^miniprogram\//, '')
}

function readPngSize(filePath) {
  const header = fs.readFileSync(filePath)
  const isPng = header.length >= 33 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47

  if (!isPng) return null
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    colorType: header[25]
  }
}

function readPngAlphaBounds(filePath) {
  const data = fs.readFileSync(filePath)
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  const colorType = data[25]
  const idats = []
  let pos = 8

  while (pos < data.length) {
    const len = data.readUInt32BE(pos)
    const type = data.toString('ascii', pos + 4, pos + 8)
    if (type === 'IDAT') idats.push(data.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
  }

  const zlib = require('zlib')
  const raw = zlib.inflateSync(Buffer.concat(idats))
  const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : 0
  if (!bpp) return null

  const stride = width * bpp
  const scanlines = Buffer.alloc(height * stride)
  let rp = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp]
    rp += 1
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rp]
      rp += 1
      const left = x >= bpp ? scanlines[y * stride + x - bpp] : 0
      const up = y > 0 ? scanlines[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= bpp ? scanlines[(y - 1) * stride + x - bpp] : 0
      let decoded = value
      if (filter === 1) decoded = (value + left) & 0xff
      else if (filter === 2) decoded = (value + up) & 0xff
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 0xff
      else if (filter === 4) {
        const p = left + up - upperLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upperLeft)
        decoded = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 0xff
      } else if (filter !== 0) {
        return null
      }
      scanlines[y * stride + x] = decoded
    }
  }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = scanlines[y * stride + x * bpp + bpp - 1]
      if (alpha === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    left: minX,
    right: width - 1 - maxX,
    top: minY,
    bottom: height - 1 - maxY
  }
}

for (const item of manifest) {
  const outputPath = normalizeOutputPath(item)
  const filePath = path.join(root, outputPath)

  if (!outputPath) {
    failures.push(`${item.filename || item.food_cn}: missing output path in manifest`)
    continue
  }

  if (!fs.existsSync(filePath)) {
    failures.push(`${outputPath}: missing`)
    continue
  }

  const stat = fs.statSync(filePath)
  if (stat.size < 1000) failures.push(`${outputPath}: file is smaller than 1KB`)

  const png = readPngSize(filePath)
  if (!png) {
    failures.push(`${outputPath}: not a PNG file`)
    continue
  }

  if (png.width !== 64 || png.height !== 64) {
    failures.push(`${outputPath}: expected 64x64, got ${png.width}x${png.height}`)
  }

  if (![4, 6].includes(png.colorType)) {
    failures.push(`${outputPath}: PNG does not contain an alpha channel`)
  }

  const bounds = readPngAlphaBounds(filePath)
  if (!bounds) {
    failures.push(`${outputPath}: icon body is empty or unreadable`)
    continue
  }

  const minPadding = Math.min(bounds.left, bounds.right, bounds.top, bounds.bottom)
  if (minPadding < 6) {
    failures.push(`${outputPath}: icon body is too close to edge, min padding ${minPadding}px`)
  }

  const maxBodyEdge = Math.max(bounds.width, bounds.height)
  if (maxBodyEdge < 44) {
    failures.push(`${outputPath}: icon body is too small, body ${bounds.width}x${bounds.height}px`)
  }

  if (maxBodyEdge > 52) {
    failures.push(`${outputPath}: icon body is too large, body ${bounds.width}x${bounds.height}px`)
  }
}

if (failures.length) {
  console.error('Food icon validation failed:')
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`OK: ${manifest.length} food icons checked.`)
