const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const assets = require('../utils/assets')

const root = path.resolve(__dirname, '..')
const sourceDirs = ['app.js', 'app.wxss', 'utils', 'pages', 'components', 'custom-tab-bar']

function flattenAssetPaths(value, result = []) {
  if (typeof value === 'string') {
    if (value.startsWith('/assets/') && value.endsWith('.png')) {
      result.push(value)
    }
    return result
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenAssetPaths(item, result))
    return result
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => flattenAssetPaths(item, result))
  }

  return result
}

function walkFiles(target) {
  const absolute = path.join(root, target)
  if (!fs.existsSync(absolute)) return []
  const stat = fs.statSync(absolute)
  if (stat.isFile()) return [absolute]

  return fs.readdirSync(absolute).flatMap((entry) => {
    const next = path.join(target, entry)
    const nextAbsolute = path.join(root, next)
    if (fs.statSync(nextAbsolute).isDirectory()) return walkFiles(next)
    return [nextAbsolute]
  })
}

function collectLiteralAssetPaths() {
  const pattern = /\/assets\/[^'"\s)}]+\.png/g
  return sourceDirs
    .flatMap(walkFiles)
    .filter((file) => /\.(js|wxml|wxss|json)$/.test(file))
    .flatMap((file) => fs.readFileSync(file, 'utf8').match(pattern) || [])
}

test('all configured sprite image paths exist', () => {
  const imagePaths = [...new Set(flattenAssetPaths(assets))]

  assert.ok(imagePaths.length > 0)
  for (const imagePath of imagePaths) {
    assert.ok(fs.existsSync(path.join(root, imagePath)), `${imagePath} should exist`)
  }
})

test('all literal sprite image paths exist', () => {
  const imagePaths = [...new Set(collectLiteralAssetPaths())]

  assert.ok(imagePaths.length > 0)
  for (const imagePath of imagePaths) {
    assert.ok(fs.existsSync(path.join(root, imagePath)), `${imagePath} should exist`)
  }
})
