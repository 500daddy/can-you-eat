const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const projectRoot = path.resolve(__dirname, '..')
const sheetPath = path.join(projectRoot, 'icon_supplement_pack/宝宝食材小管家_新版缺失食材sprite_sheet.png')
const outDir = path.join(projectRoot, 'assets/sprites/food')
const outSize = 64
const cols = 10
const rows = 7
const iconCropHeight = 112
const targetMaxSize = 50

const sheetOrder = [
  ['food_bok_choy.png', 'food_lettuce.png', 'food_napa_cabbage.png', 'food_cabbage_head.png', 'food_celery.png', 'food_cauliflower.png', 'food_asparagus.png', 'food_amaranth.png', 'food_pea_shoots.png', 'food_yam.png'],
  ['food_taro.png', 'food_radish.png', 'food_bamboo_shoot.png', 'food_zucchini.png', 'food_wax_gourd.png', 'food_bitter_melon.png', 'food_loofah.png', 'food_pea.png', 'food_green_bean.png', 'food_shiitake.png'],
  ['food_enoki.png', 'food_oyster_mushroom.png', 'food_kelp.png', 'food_laver.png', 'food_pear.png', 'food_peach.png', 'food_grape.png', 'food_watermelon.png', 'food_cantaloupe.png', 'food_mango.png'],
  ['food_papaya.png', 'food_dragon_fruit.png', 'food_cherry.png', 'food_plum.png', 'food_grapefruit.png', 'food_pineapple.png', 'food_pomegranate.png', 'food_raspberry.png', 'food_pork.png', 'food_lamb.png'],
  ['food_duck.png', 'food_turkey.png', 'food_salmon.png', 'food_bass.png', 'food_hairtail.png', 'food_scallop.png', 'food_clam.png', 'food_quail_egg.png', 'food_yogurt.png', 'food_soy_milk.png'],
  ['food_dried_tofu.png', 'food_edamame.png', 'food_millet.png', 'food_oat.png', 'food_black_rice.png', 'food_quinoa.png', 'food_buckwheat.png', 'food_wheat_flour.png', 'food_rice_noodle.png', 'food_steamed_bun.png'],
  ['food_dumpling.png', 'food_egg_custard.png', 'food_meat_puree.png']
]

function crcTable() {
  const table = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

const crcLookup = crcTable()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    c = crcLookup[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function decodePng(filePath) {
  const buf = fs.readFileSync(filePath)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const colorType = buf[25]
  if (buf[24] !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${buf[24]}, colorType=${colorType}`)
  }

  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const idats = []
  let pos = 8
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IDAT') idats.push(buf.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
  }

  const raw = zlib.inflateSync(Buffer.concat(idats))
  const scanlines = Buffer.alloc(width * height * bpp)
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
      else if (filter === 4) decoded = (value + paeth(left, up, upperLeft)) & 0xff
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`)
      scanlines[y * stride + x] = decoded
    }
  }

  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < scanlines.length; i += bpp, j += 4) {
    pixels[j] = scanlines[i]
    pixels[j + 1] = scanlines[i + 1]
    pixels[j + 2] = scanlines[i + 2]
    pixels[j + 3] = colorType === 6 ? scanlines[i + 3] : 255
  }
  return { width, height, pixels }
}

function writePng(filePath, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    pixels.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
  fs.writeFileSync(filePath, png)
}

function isCheckerBackground(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return min >= 235 && max - min <= 14
}

function extractIcon(sheet, cell) {
  const cropWidth = cell.right - cell.left
  const cropHeight = cell.bottom - cell.top
  const source = Buffer.alloc(cropWidth * cropHeight * 4)
  const background = new Uint8Array(cropWidth * cropHeight)
  const visited = new Uint8Array(cropWidth * cropHeight)

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const si = ((cell.top + y) * sheet.width + cell.left + x) * 4
      const di = (y * cropWidth + x) * 4
      source[di] = sheet.pixels[si]
      source[di + 1] = sheet.pixels[si + 1]
      source[di + 2] = sheet.pixels[si + 2]
      source[di + 3] = 255
      if (isCheckerBackground(source[di], source[di + 1], source[di + 2])) {
        background[y * cropWidth + x] = 1
      }
    }
  }

  const queue = []
  function push(x, y) {
    if (x < 0 || y < 0 || x >= cropWidth || y >= cropHeight) return
    const idx = y * cropWidth + x
    if (!background[idx] || visited[idx]) return
    visited[idx] = 1
    queue.push([x, y])
  }

  for (let x = 0; x < cropWidth; x += 1) {
    push(x, 0)
    push(x, cropHeight - 1)
  }
  for (let y = 0; y < cropHeight; y += 1) {
    push(0, y)
    push(cropWidth - 1, y)
  }

  for (let qi = 0; qi < queue.length; qi += 1) {
    const [x, y] = queue[qi]
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  let minX = cropWidth
  let minY = cropHeight
  let maxX = -1
  let maxY = -1
  const alpha = new Uint8Array(cropWidth * cropHeight)
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const idx = y * cropWidth + x
      const opaque = !background[idx] || !visited[idx]
      if (!opaque) continue
      alpha[idx] = 255
    }
  }

  const filteredAlpha = keepIconComponents(alpha, cropWidth, cropHeight)
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      if (!filteredAlpha[y * cropWidth + x]) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error(`No icon pixels found in cell ${JSON.stringify(cell)}`)
  }

  minX = Math.max(0, minX - 2)
  minY = Math.max(0, minY - 2)
  maxX = Math.min(cropWidth - 1, maxX + 2)
  maxY = Math.min(cropHeight - 1, maxY + 2)

  const iconWidth = maxX - minX + 1
  const iconHeight = maxY - minY + 1
  const scale = targetMaxSize / Math.max(iconWidth, iconHeight)
  const scaledWidth = Math.round(iconWidth * scale)
  const scaledHeight = Math.round(iconHeight * scale)
  const out = Buffer.alloc(outSize * outSize * 4)
  const offX = Math.floor((outSize - scaledWidth) / 2)
  const offY = Math.floor((outSize - scaledHeight) / 2)

  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      const sx = Math.min(maxX, minX + Math.floor(x / scale))
      const sy = Math.min(maxY, minY + Math.floor(y / scale))
      const si = (sy * cropWidth + sx) * 4
      const ai = sy * cropWidth + sx
      if (!filteredAlpha[ai]) continue
      const dx = offX + x
      const dy = offY + y
      const di = (dy * outSize + dx) * 4
      out[di] = source[si]
      out[di + 1] = source[si + 1]
      out[di + 2] = source[si + 2]
      out[di + 3] = 255
    }
  }

  return out
}

function keepIconComponents(alpha, width, height) {
  const seen = new Uint8Array(width * height)
  const components = []

  function pushIfOpaque(queue, x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const idx = y * width + x
    if (!alpha[idx] || seen[idx]) return
    seen[idx] = 1
    queue.push([x, y])
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (!alpha[start] || seen[start]) continue
      const queue = []
      const pixels = []
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y
      pushIfOpaque(queue, x, y)
      for (let qi = 0; qi < queue.length; qi += 1) {
        const [qx, qy] = queue[qi]
        pixels.push(qy * width + qx)
        minX = Math.min(minX, qx)
        minY = Math.min(minY, qy)
        maxX = Math.max(maxX, qx)
        maxY = Math.max(maxY, qy)
        pushIfOpaque(queue, qx + 1, qy)
        pushIfOpaque(queue, qx - 1, qy)
        pushIfOpaque(queue, qx, qy + 1)
        pushIfOpaque(queue, qx, qy - 1)
      }
      components.push({
        pixels,
        area: pixels.length,
        minX,
        minY,
        maxX,
        maxY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2
      })
    }
  }

  if (!components.length) return alpha
  components.sort((a, b) => b.area - a.area)
  const main = components[0]
  const mainMax = Math.max(main.maxX - main.minX, main.maxY - main.minY)
  const keep = new Uint8Array(width * height)

  function nearMain(component) {
    const dx = component.cx - main.cx
    const dy = component.cy - main.cy
    const distance = Math.sqrt(dx * dx + dy * dy)
    const expandedOverlap = component.maxX >= main.minX - 30 &&
      component.minX <= main.maxX + 30 &&
      component.maxY >= main.minY - 30 &&
      component.minY <= main.maxY + 30
    return distance <= Math.max(62, mainMax * 0.85) || expandedOverlap
  }

  for (const component of components) {
    if (component !== main) {
      const tooSmall = component.area < Math.max(16, main.area * 0.015)
      if (tooSmall || !nearMain(component)) continue
    }
    for (const idx of component.pixels) keep[idx] = 255
  }

  return keep
}

function main() {
  const sheet = decodePng(sheetPath)
  const cellWidth = sheet.width / cols
  const cellHeight = sheet.height / rows
  fs.mkdirSync(outDir, { recursive: true })

  let count = 0
  for (let row = 0; row < sheetOrder.length; row += 1) {
    const top = Math.round(row * cellHeight) + (row === 0 ? 8 : 14)
    for (let col = 0; col < sheetOrder[row].length; col += 1) {
      const filename = sheetOrder[row][col]
      const left = Math.round(col * cellWidth)
      const right = col === cols - 1 ? sheet.width : Math.round((col + 1) * cellWidth)
      const iconPixels = extractIcon(sheet, {
        left,
        right,
        top,
        bottom: Math.min(sheet.height, top + iconCropHeight)
      })
      writePng(path.join(outDir, filename), outSize, outSize, iconPixels)
      count += 1
    }
  }

  console.log(`Sliced ${count} icons from ${path.relative(projectRoot, sheetPath)} into ${path.relative(projectRoot, outDir)}`)
}

main()
