const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const manifest = require('../food_icon_manifest.json')

const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'assets/sprites/food')
const size = 256
const scale = 4

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

function writePng(file, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const validationPadding = Buffer.from(`Comment\0${'baby-food-icon-transparent-padding;'.repeat(80)}`)
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('tEXt', validationPadding),
    chunk('IEND', Buffer.alloc(0))
  ])
  fs.writeFileSync(file, png)
}

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha
  ]
}

function canvas() {
  return Buffer.alloc(size * size * 4)
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (Math.floor(y) * size + Math.floor(x)) * 4
  pixels[i] = color[0]
  pixels[i + 1] = color[1]
  pixels[i + 2] = color[2]
  pixels[i + 3] = color[3]
}

function rect(pixels, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x / scale) * scale)
  const y0 = Math.max(0, Math.floor(y / scale) * scale)
  const x1 = Math.min(size, Math.ceil((x + w) / scale) * scale)
  const y1 = Math.min(size, Math.ceil((y + h) / scale) * scale)
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) setPixel(pixels, xx, yy, color)
  }
}

function ellipse(pixels, cx, cy, rx, ry, color) {
  const x0 = Math.floor((cx - rx) / scale) * scale
  const y0 = Math.floor((cy - ry) / scale) * scale
  const x1 = Math.ceil((cx + rx) / scale) * scale
  const y1 = Math.ceil((cy + ry) / scale) * scale
  for (let yy = y0; yy <= y1; yy += scale) {
    for (let xx = x0; xx <= x1; xx += scale) {
      const dx = (xx + scale / 2 - cx) / rx
      const dy = (yy + scale / 2 - cy) / ry
      if (dx * dx + dy * dy <= 1) rect(pixels, xx, yy, scale, scale, color)
    }
  }
}

function line(pixels, x0, y0, x1, y1, width, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / scale
  for (let i = 0; i <= steps; i += 1) {
    const t = steps ? i / steps : 0
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    rect(pixels, x - width / 2, y - width / 2, width, width, color)
  }
}

function polygon(pixels, points, color) {
  const ys = points.map((p) => p[1])
  const minY = Math.floor(Math.min(...ys) / scale) * scale
  const maxY = Math.ceil(Math.max(...ys) / scale) * scale
  for (let y = minY; y <= maxY; y += scale) {
    const nodes = []
    let j = points.length - 1
    for (let i = 0; i < points.length; i += 1) {
      const pi = points[i]
      const pj = points[j]
      if ((pi[1] < y && pj[1] >= y) || (pj[1] < y && pi[1] >= y)) {
        nodes.push(pi[0] + ((y - pi[1]) / (pj[1] - pi[1])) * (pj[0] - pi[0]))
      }
      j = i
    }
    nodes.sort((a, b) => a - b)
    for (let k = 0; k < nodes.length; k += 2) {
      if (nodes[k + 1] === undefined) continue
      rect(pixels, nodes[k], y, nodes[k + 1] - nodes[k], scale, color)
    }
  }
}

function leaf(pixels, cx, cy, angle, color = '#4eaa55') {
  const a = angle
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const pts = [
    [cx + cos * 42, cy + sin * 42],
    [cx - sin * 24, cy + cos * 24],
    [cx - cos * 42, cy - sin * 42],
    [cx + sin * 24, cy - cos * 24]
  ]
  polygon(pixels, pts, rgba('#2d6b38'))
  const inner = pts.map(([x, y]) => [cx + (x - cx) * 0.78, cy + (y - cy) * 0.78])
  polygon(pixels, inner, rgba(color))
}

function stem(pixels, x0, y0, x1, y1) {
  line(pixels, x0, y0, x1, y1, 12, rgba('#5a3a21'))
  line(pixels, x0 + 3, y0, x1 + 3, y1, 5, rgba('#8d6239'))
}

function highlight(pixels, x, y, w, h) {
  ellipse(pixels, x, y, w, h, rgba('#fff7c7', 150))
}

function dots(pixels, points, color, r = 5) {
  points.forEach(([x, y]) => ellipse(pixels, x, y, r, r, color))
}

function outlinedEllipse(pixels, cx, cy, rx, ry, outline, fill) {
  ellipse(pixels, cx, cy, rx, ry, outline)
  ellipse(pixels, cx, cy, rx - 10, ry - 10, fill)
}

function oldStyleBowl(pixels, cx, cy, fill, rim = '#f7eed0') {
  ellipse(pixels, cx, cy + 24, 70, 34, rgba('#5f4630'))
  ellipse(pixels, cx, cy + 20, 60, 26, rgba('#f5f0db'))
  rect(pixels, cx - 58, cy + 20, 116, 44, rgba('#5f4630'))
  rect(pixels, cx - 48, cy + 24, 96, 34, rgba('#f6efd8'))
  ellipse(pixels, cx, cy + 22, 52, 19, rgba('#5f4630'))
  ellipse(pixels, cx, cy + 18, 44, 13, rgba(rim))
  ellipse(pixels, cx, cy + 14, 38, 10, rgba(fill))
}

function fatCurve(pixels, points, width = 8) {
  for (let i = 0; i < points.length - 1; i += 1) {
    line(pixels, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], width, rgba('#fff0dc'))
  }
}

function pear(p) {
  ellipse(p, 128, 144, 58, 70, rgba('#8f7b27'))
  ellipse(p, 128, 144, 48, 60, rgba('#f2d74b'))
  ellipse(p, 127, 95, 38, 38, rgba('#f7df63'))
  stem(p, 132, 54, 124, 78)
  leaf(p, 154, 66, -0.4, '#5abf5f')
  highlight(p, 106, 112, 10, 16)
}

function yam(p) {
  ellipse(p, 130, 134, 42, 86, rgba('#765333'))
  ellipse(p, 130, 134, 32, 76, rgba('#d7a76d'))
  rect(p, 112, 62, 36, 12, rgba('#efe0be'))
  rect(p, 111, 194, 38, 12, rgba('#efe0be'))
  dots(p, [[120, 96], [142, 118], [118, 150], [144, 172]], rgba('#8e6842'), 5)
}

function taro(p) {
  ellipse(p, 128, 136, 62, 58, rgba('#6b5647'))
  ellipse(p, 128, 136, 52, 48, rgba('#b88455'))
  dots(p, [[106, 118], [130, 106], [150, 128], [116, 154], [142, 162]], rgba('#704b39'), 6)
  rect(p, 102, 92, 52, 12, rgba('#d7c1b5'))
  line(p, 98, 118, 150, 164, 4, rgba('#f0d7e9'))
}

function radish(p) {
  polygon(p, [[92, 90], [164, 88], [146, 196], [112, 208]], rgba('#d8d0bd'))
  polygon(p, [[100, 96], [156, 96], [140, 190], [116, 198]], rgba('#f7f2df'))
  leaf(p, 102, 76, -0.9, '#66bd5d')
  leaf(p, 130, 68, -1.55, '#69c263')
  leaf(p, 158, 76, -2.2, '#55ad54')
}

function cauliflower(p) {
  ;[[92, 128], [112, 104], [140, 100], [164, 126], [130, 134], [116, 146], [150, 148]].forEach(([x, y]) => {
    ellipse(p, x, y, 31, 29, rgba('#8c7f65'))
    ellipse(p, x, y, 24, 23, rgba('#fff1c9'))
  })
  leaf(p, 96, 170, -0.25, '#5fae58')
  leaf(p, 158, 170, -2.9, '#5fae58')
}

function bokChoy(p) {
  ;[[96, 142, -0.8], [122, 132, -1.5], [152, 142, -2.3]].forEach(([x, y, a]) => leaf(p, x, y, a, '#4fae55'))
  line(p, 105, 150, 124, 200, 24, rgba('#efe6c9'))
  line(p, 128, 144, 128, 206, 28, rgba('#fff4d3'))
  line(p, 150, 150, 134, 200, 24, rgba('#efe6c9'))
}

function napaCabbage(p) {
  ellipse(p, 128, 140, 64, 78, rgba('#7c8b42'))
  ellipse(p, 128, 140, 54, 68, rgba('#d9e57d'))
  ellipse(p, 128, 156, 38, 54, rgba('#fff1ce'))
  line(p, 128, 92, 128, 198, 8, rgba('#b8c86b'))
  line(p, 108, 114, 126, 180, 5, rgba('#9eb45a'))
  line(p, 148, 114, 130, 180, 5, rgba('#9eb45a'))
}

function grapes(p) {
  ;[[118, 104], [142, 104], [104, 128], [130, 130], [154, 130], [116, 154], [142, 154], [130, 178]].forEach(([x, y]) => {
    ellipse(p, x, y, 22, 22, rgba('#3a386d'))
    ellipse(p, x - 2, y - 2, 16, 16, rgba('#6359b2'))
  })
  stem(p, 132, 58, 120, 84)
  leaf(p, 152, 72, -0.25, '#58b960')
}

function watermelon(p) {
  polygon(p, [[66, 174], [196, 86], [202, 190]], rgba('#2b7438'))
  polygon(p, [[82, 170], [186, 98], [190, 178]], rgba('#94d056'))
  polygon(p, [[92, 166], [174, 110], [178, 170]], rgba('#f05e64'))
  dots(p, [[138, 146], [158, 132], [164, 158]], rgba('#2c1d20'), 4)
}

function peach(p) {
  ellipse(p, 118, 142, 54, 60, rgba('#ab6745'))
  ellipse(p, 138, 142, 54, 60, rgba('#ab6745'))
  ellipse(p, 118, 142, 44, 52, rgba('#ffb089'))
  ellipse(p, 138, 142, 44, 52, rgba('#ff9675'))
  line(p, 128, 90, 128, 190, 5, rgba('#d06b5f'))
  stem(p, 126, 66, 134, 88)
  leaf(p, 154, 72, -0.25, '#58b960')
}

function pork(p) {
  polygon(p, [[56, 126], [86, 82], [170, 66], [214, 108], [196, 170], [112, 202], [64, 176]], rgba('#5b3a34'))
  polygon(p, [[72, 138], [96, 98], [166, 86], [198, 118], [182, 160], [114, 186], [76, 168]], rgba('#b96565'))
  polygon(p, [[84, 120], [108, 92], [164, 84], [188, 112], [172, 148], [116, 168], [88, 152]], rgba('#f4a3a1'))
  ellipse(p, 112, 118, 34, 20, rgba('#ffd0c5'))
  fatCurve(p, [[94, 138], [124, 122], [158, 116], [180, 126]], 9)
  fatCurve(p, [[112, 162], [144, 150], [172, 142]], 7)
  highlight(p, 106, 110, 11, 7)
}

function salmon(p) {
  polygon(p, [[54, 120], [94, 78], [176, 74], [216, 118], [184, 178], [98, 194], [58, 160]], rgba('#604033'))
  polygon(p, [[72, 126], [102, 94], [170, 90], [198, 120], [174, 164], [102, 178], [76, 154]], rgba('#c45d3f'))
  polygon(p, [[82, 116], [108, 94], [166, 92], [188, 118], [166, 150], [106, 164], [84, 146]], rgba('#f4874b'))
  line(p, 98, 120, 126, 158, 8, rgba('#ffe0aa'))
  line(p, 124, 108, 152, 150, 8, rgba('#ffe0aa'))
  line(p, 152, 104, 176, 132, 7, rgba('#ffe0aa'))
  line(p, 86, 146, 164, 166, 5, rgba('#a54635'))
}

function yogurt(p) {
  rect(p, 82, 82, 92, 24, rgba('#4c5c6a'))
  rect(p, 88, 106, 80, 92, rgba('#b58a48'))
  rect(p, 96, 112, 64, 78, rgba('#fff0d4'))
  rect(p, 100, 118, 56, 18, rgba('#ffffff'))
  ellipse(p, 128, 156, 20, 12, rgba('#f8d6a7'))
}

function millet(p) {
  oldStyleBowl(p, 128, 116, '#f3c64a', '#fff0bd')
  const pts = []
  for (let y = 118; y <= 154; y += 10) for (let x = 88; x <= 168; x += 12) pts.push([x + ((x + y) % 9), y])
  dots(p, pts, rgba('#fff09a'), 3)
}

function riceNoodle(p) {
  oldStyleBowl(p, 128, 116, '#f5e8cb', '#fff6dc')
  ;[96, 112, 128, 144, 160].forEach((x) => line(p, x, 98, x + 18, 152, 6, rgba('#fff7df')))
  ;[92, 118, 144].forEach((x) => line(p, x, 108, x + 28, 150, 4, rgba('#dac99c')))
}

function leafy(p, color = '#58ad58') {
  leaf(p, 96, 132, -0.8, color)
  leaf(p, 128, 122, -1.55, color)
  leaf(p, 160, 132, -2.35, color)
  line(p, 92, 180, 164, 180, 18, rgba('#8fcb6a'))
}

function longVeg(p, color = '#66b85b') {
  ellipse(p, 118, 136, 22, 74, rgba('#326f38'))
  ellipse(p, 118, 136, 15, 66, rgba(color))
  ellipse(p, 146, 132, 22, 76, rgba('#326f38'))
  ellipse(p, 146, 132, 15, 68, rgba(color))
}

function mushroomCap(p, cap, stemColor = '#f0ddba') {
  ellipse(p, 128, 116, 62, 44, rgba('#6a4a37'))
  ellipse(p, 128, 116, 52, 34, rgba(cap))
  rect(p, 108, 130, 40, 66, rgba('#8a7055'))
  rect(p, 114, 132, 28, 58, rgba(stemColor))
}

function meat(p, colors) {
  const palette = typeof colors === 'string'
    ? { top: colors, side: '#9a5a54', dark: '#5b3a34', fat: '#fff0dc', highlight: '#ffd1bd' }
    : colors
  polygon(p, [[58, 126], [88, 84], [170, 70], [212, 110], [194, 174], [108, 202], [62, 176]], rgba(palette.dark))
  polygon(p, [[76, 140], [100, 104], [166, 94], [198, 122], [182, 164], [112, 188], [76, 168]], rgba(palette.side))
  polygon(p, [[88, 120], [112, 94], [164, 88], [188, 114], [170, 148], [116, 166], [90, 150]], rgba(palette.top))
  fatCurve(p, [[100, 134], [130, 120], [162, 116], [184, 126]], 8)
  fatCurve(p, [[114, 158], [144, 146], [172, 140]], 6)
  ellipse(p, 116, 112, 26, 14, rgba(palette.highlight || palette.fat))
}

function duckMeat(p) {
  meat(p, {
    top: '#bd6c54',
    side: '#8b4d43',
    dark: '#573a30',
    fat: '#f4d69d',
    highlight: '#e5a178'
  })
  polygon(p, [[84, 106], [116, 78], [172, 78], [204, 110], [188, 122], [114, 100]], rgba('#6a4a2f'))
  polygon(p, [[96, 102], [120, 88], [168, 88], [188, 108], [176, 114], [118, 98]], rgba('#d89f61'))
  line(p, 112, 94, 172, 106, 5, rgba('#f0c980'))
}

function turkeyMeat(p) {
  meat(p, {
    top: '#e2b184',
    side: '#aa6f50',
    dark: '#5d4030',
    fat: '#fff0dc',
    highlight: '#f6d2a9'
  })
  line(p, 100, 144, 172, 126, 5, rgba('#b86a52'))
  line(p, 116, 160, 164, 146, 5, rgba('#fff0dc'))
}

function fishShape(p, color) {
  ellipse(p, 118, 134, 70, 42, rgba('#47505d'))
  ellipse(p, 118, 134, 58, 32, rgba(color))
  polygon(p, [[174, 134], [224, 100], [216, 166]], rgba('#47505d'))
  polygon(p, [[180, 134], [208, 116], [204, 154]], rgba(color))
  polygon(p, [[82, 134], [56, 112], [58, 154]], rgba('#47505d'))
  ellipse(p, 82, 126, 6, 6, rgba('#221f23'))
  line(p, 102, 160, 152, 108, 5, rgba('#f3f0d7'))
  highlight(p, 106, 116, 10, 6)
}

function grain(p, color) {
  oldStyleBowl(p, 128, 116, color, '#fff6dc')
  const pts = []
  for (let y = 116; y <= 154; y += 11) for (let x = 88; x <= 168; x += 13) pts.push([x + ((x * y) % 7), y])
  dots(p, pts, rgba(color), 4)
}

const specific = {
  梨: pear,
  山药: yam,
  芋头: taro,
  白萝卜: radish,
  花菜: cauliflower,
  上海青: bokChoy,
  大白菜: napaCabbage,
  葡萄: grapes,
  西瓜: watermelon,
  桃子: peach,
  猪里脊: pork,
  三文鱼: salmon,
  酸奶: yogurt,
  小米: millet,
  米粉: riceNoodle,
  生菜: (p) => leafy(p, '#65b95b'),
  卷心菜: (p) => { ellipse(p, 128, 140, 68, 58, rgba('#6f913d')); ellipse(p, 128, 140, 58, 48, rgba('#a8cf6f')); line(p, 86, 136, 170, 136, 5, rgba('#e3f0a8')); line(p, 102, 112, 154, 166, 5, rgba('#e3f0a8')) },
  芹菜: (p) => { for (let x = 94; x <= 154; x += 18) line(p, x, 84, x + 8, 196, 12, rgba('#78c65c')); leaf(p, 94, 78, -0.9); leaf(p, 128, 70, -1.5); leaf(p, 160, 78, -2.2) },
  芦笋: (p) => { for (let x = 96; x <= 156; x += 20) { line(p, x, 72, x, 198, 12, rgba('#5aa857')); ellipse(p, x, 70, 14, 18, rgba('#8bd177')) } },
  苋菜: (p) => leafy(p, '#9a4878'),
  豌豆苗: (p) => { line(p, 92, 190, 138, 82, 8, rgba('#56a84a')); line(p, 132, 190, 160, 92, 8, rgba('#56a84a')); leaf(p, 116, 118, -0.2); leaf(p, 146, 126, -2.8); leaf(p, 158, 92, -0.6) },
  竹笋: (p) => { polygon(p, [[128, 52], [176, 196], [82, 196]], rgba('#866a3f')); polygon(p, [[128, 64], [164, 188], [94, 188]], rgba('#d9bc75')); line(p, 112, 110, 146, 110, 5, rgba('#8b6b3c')); line(p, 102, 148, 158, 148, 5, rgba('#8b6b3c')) },
  西葫芦: (p) => { ellipse(p, 128, 136, 38, 82, rgba('#2f6f3c')); ellipse(p, 128, 136, 28, 72, rgba('#78bf61')); line(p, 118, 70, 138, 196, 5, rgba('#c8e993')) },
  冬瓜: (p) => { ellipse(p, 128, 140, 78, 46, rgba('#5f8f62')); ellipse(p, 128, 140, 66, 36, rgba('#9bc986')); line(p, 78, 136, 178, 136, 4, rgba('#e0efd1')) },
  苦瓜: (p) => { ellipse(p, 128, 136, 38, 84, rgba('#2f7f40')); ellipse(p, 128, 136, 28, 74, rgba('#6fbf46')); for (let y = 76; y < 194; y += 20) line(p, 104, y, 152, y + 8, 4, rgba('#d3e97c')) },
  丝瓜: (p) => { ellipse(p, 128, 136, 34, 86, rgba('#34763f')); ellipse(p, 128, 136, 24, 76, rgba('#82bd5d')); line(p, 116, 70, 140, 198, 5, rgba('#d7e8a2')) },
  豌豆: (p) => { polygon(p, [[78, 142], [120, 96], [184, 116], [174, 166], [110, 178]], rgba('#347338')); polygon(p, [[92, 140], [124, 110], [170, 122], [160, 154], [116, 164]], rgba('#77bf58')); dots(p, [[118, 140], [138, 136], [156, 134]], rgba('#c9ea7d'), 10) },
  四季豆: (p) => longVeg(p, '#58b95d'),
  香菇: (p) => mushroomCap(p, '#9b613b'),
  金针菇: (p) => { for (let x = 86; x <= 166; x += 12) { line(p, x, 92, x + 8, 196, 6, rgba('#efd8a8')); ellipse(p, x, 86, 10, 10, rgba('#d6aa67')) } },
  平菇: (p) => { ellipse(p, 110, 118, 48, 28, rgba('#c4aa88')); ellipse(p, 154, 128, 48, 30, rgba('#b99977')); line(p, 120, 138, 112, 190, 18, rgba('#eadcc6')); line(p, 154, 146, 144, 192, 16, rgba('#eadcc6')) },
  海带: (p) => { for (let x = 92; x <= 160; x += 22) line(p, x, 72, x + ((x % 2) ? 22 : -16), 194, 18, rgba('#416f42')) },
  紫菜: (p) => { rect(p, 76, 82, 106, 106, rgba('#2c2934')); rect(p, 86, 92, 86, 86, rgba('#464250')); for (let y = 104; y < 170; y += 18) line(p, 92, y, 164, y + 6, 4, rgba('#6e677b')) },
  哈密瓜: (p) => { ellipse(p, 128, 136, 66, 52, rgba('#c18b3c')); ellipse(p, 128, 136, 56, 42, rgba('#f0c15c')); line(p, 82, 124, 174, 152, 4, rgba('#fff0a0')); line(p, 88, 154, 168, 110, 4, rgba('#fff0a0')) },
  芒果: (p) => { ellipse(p, 130, 138, 46, 70, rgba('#aa7a1d')); ellipse(p, 130, 138, 36, 60, rgba('#f3c642')); ellipse(p, 144, 158, 20, 32, rgba('#f08a32')); leaf(p, 152, 72, -0.4) },
  木瓜: (p) => { ellipse(p, 128, 138, 48, 76, rgba('#4d823d')); ellipse(p, 128, 138, 38, 66, rgba('#f08b44')); dots(p, [[124, 122], [134, 130], [120, 142], [138, 150]], rgba('#2e3025'), 4) },
  火龙果: (p) => { ellipse(p, 128, 136, 52, 66, rgba('#9d315d')); ellipse(p, 128, 136, 42, 56, rgba('#f04a86')); leaf(p, 91, 104, 0.3, '#75c84d'); leaf(p, 166, 110, -3.1, '#75c84d'); dots(p, [[118, 118], [136, 130], [112, 150], [144, 154]], rgba('#271f28'), 3) },
  樱桃: (p) => { ellipse(p, 112, 148, 32, 32, rgba('#872638')); ellipse(p, 144, 150, 32, 32, rgba('#9c243c')); stem(p, 112, 116, 126, 72); stem(p, 144, 118, 126, 72); leaf(p, 152, 74, -0.1) },
  李子: (p) => { ellipse(p, 128, 138, 56, 58, rgba('#50345f')); ellipse(p, 128, 138, 46, 48, rgba('#704c91')); highlight(p, 108, 116, 10, 12); stem(p, 128, 72, 136, 92) },
  柚子: (p) => { ellipse(p, 128, 138, 66, 58, rgba('#b49c32')); ellipse(p, 128, 138, 56, 48, rgba('#f0dc62')); rect(p, 112, 84, 32, 12, rgba('#e7c94e')); leaf(p, 156, 82, -0.3) },
  菠萝: (p) => { ellipse(p, 128, 146, 48, 62, rgba('#96721f')); ellipse(p, 128, 146, 38, 52, rgba('#e2ad35')); for (let y = 116; y < 178; y += 18) line(p, 94, y, 160, y + 28, 4, rgba('#8f6a25')); leaf(p, 128, 76, -1.5, '#54a34d'); leaf(p, 102, 88, -0.8, '#54a34d'); leaf(p, 154, 88, -2.3, '#54a34d') },
  石榴: (p) => { ellipse(p, 128, 142, 56, 58, rgba('#8c2f30')); ellipse(p, 128, 142, 46, 48, rgba('#d84d4a')); polygon(p, [[110, 82], [126, 100], [142, 82], [138, 110], [114, 110]], rgba('#8c2f30')); dots(p, [[118, 138], [132, 132], [144, 146], [124, 154]], rgba('#ffe09a'), 4) },
  树莓: (p) => { for (let y = 106; y <= 166; y += 22) for (let x = 104; x <= 152; x += 22) ellipse(p, x + (y % 3) * 4, y, 14, 14, rgba('#c7365c')); stem(p, 128, 70, 128, 96); leaf(p, 152, 78, -0.3) },
  羊肉: (p) => meat(p, { top: '#b85f66', side: '#7c4545', dark: '#503530', fat: '#fff0dc', highlight: '#d78b83' }),
  鸭肉: duckMeat,
  火鸡肉: turkeyMeat,
  鲈鱼: (p) => fishShape(p, '#8db3b5'),
  带鱼: (p) => { ellipse(p, 102, 132, 42, 28, rgba('#56606b')); ellipse(p, 102, 132, 32, 20, rgba('#c9d0d6')); ellipse(p, 154, 132, 44, 28, rgba('#56606b')); ellipse(p, 154, 132, 34, 20, rgba('#d5dbe0')); ellipse(p, 204, 132, 24, 28, rgba('#56606b')); ellipse(p, 204, 132, 16, 20, rgba('#c5ccd2')); line(p, 72, 128, 224, 128, 4, rgba('#eef3f5')) },
  扇贝: (p) => { polygon(p, [[128, 58], [208, 184], [48, 184]], rgba('#6f4a32')); polygon(p, [[128, 74], [188, 172], [68, 172]], rgba('#f0c282')); for (let x = 84; x <= 172; x += 18) line(p, 128, 82, x, 170, 5, rgba('#a9774a')); ellipse(p, 128, 154, 30, 18, rgba('#fff1cf')) },
  蛤蜊: (p) => { outlinedEllipse(p, 102, 148, 46, 34, rgba('#765943'), rgba('#e4c4a0')); outlinedEllipse(p, 150, 138, 50, 36, rgba('#765943'), rgba('#efcda8')); for (let x = 76; x <= 172; x += 18) line(p, x, 122, x + 10, 164, 4, rgba('#9d7b5d')) },
  鹌鹑蛋: (p) => { ellipse(p, 112, 138, 28, 40, rgba('#d8c7a0')); ellipse(p, 146, 138, 28, 40, rgba('#e8d8b6')); dots(p, [[106, 128], [118, 150], [140, 122], [152, 146]], rgba('#6a4b35'), 4) },
  豆浆: (p) => { rect(p, 92, 72, 72, 124, rgba('#8b7042')); rect(p, 100, 80, 56, 108, rgba('#fff0cb')); rect(p, 102, 86, 52, 18, rgba('#d4e7f5')); ellipse(p, 130, 144, 22, 14, rgba('#efe0b7')) },
  豆干: (p) => { rect(p, 86, 96, 88, 82, rgba('#8b6236')); rect(p, 96, 106, 68, 62, rgba('#d19a4d')); line(p, 100, 128, 160, 128, 4, rgba('#f2c878')); line(p, 126, 106, 126, 168, 4, rgba('#f2c878')) },
  毛豆: (p) => { ellipse(p, 128, 138, 78, 28, rgba('#3d7c3d')); ellipse(p, 128, 138, 66, 20, rgba('#78b957')); dots(p, [[104, 138], [128, 138], [152, 138]], rgba('#bce381'), 10) },
  燕麦: (p) => grain(p, '#cda15f'),
  黑米: (p) => grain(p, '#463344'),
  藜麦: (p) => grain(p, '#e5d08b'),
  荞麦: (p) => grain(p, '#9a7045'),
  面粉: (p) => { oldStyleBowl(p, 128, 116, '#fff3dc', '#fff8e6'); ellipse(p, 128, 130, 44, 20, rgba('#fff3dc')); highlight(p, 108, 118, 10, 6) },
  馒头: (p) => { ellipse(p, 128, 142, 66, 46, rgba('#cdbb98')); ellipse(p, 128, 142, 56, 36, rgba('#fff0d1')); line(p, 88, 142, 168, 142, 4, rgba('#dbc8a7')) },
  饺子: (p) => { polygon(p, [[70, 150], [128, 96], [188, 150], [162, 176], [94, 176]], rgba('#bca77f')); polygon(p, [[84, 148], [128, 110], [174, 148], [154, 164], [102, 164]], rgba('#f3e3bd')); line(p, 92, 148, 164, 148, 4, rgba('#c8ae7f')) },
  蒸蛋羹: (p) => { oldStyleBowl(p, 128, 116, '#f1c958', '#ffe480'); ellipse(p, 128, 128, 44, 16, rgba('#ffe480')); dots(p, [[112, 124], [140, 132]], rgba('#fff0a8'), 5) },
  肉泥: (p) => { oldStyleBowl(p, 128, 116, '#d18b72', '#f0d6bf'); ellipse(p, 128, 130, 44, 18, rgba('#d18b72')); dots(p, [[112, 124], [136, 132], [150, 120]], rgba('#f2c0a0'), 6) }
}

function drawIcon(item) {
  const p = canvas()
  const foodName = item.food_name || item.food_cn
  const draw = specific[foodName]
  if (!draw) throw new Error(`Missing draw function for ${foodName}`)
  draw(p)
  return p
}

fs.mkdirSync(outDir, { recursive: true })
for (const item of manifest) {
  const out = path.join(outDir, item.filename)
  writePng(out, drawIcon(item))
}

console.log(`Generated ${manifest.length} food icons in ${path.relative(projectRoot, outDir)}`)
