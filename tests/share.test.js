const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const timelineRoutes = new Set([
  'pages/index/index',
  'pages/food/search',
  'pages/food/name-search',
  'pages/purchase-plan/index',
  'pages/quick-process/index',
  'pages/recognize/index',
  'pages/reminder/index',
  'pages/mine/index',
  'pages/feedback/index',
  'pages/about/index'
])

test('safe browsing routes share the current page with whitelisted query only', () => {
  const { buildSharePath } = require('../utils/share')
  const path = buildSharePath({
    route: 'pages/food/search',
    options: { keyword: '三 文鱼', recordId: 'private-record' }
  })

  assert.equal(path, '/pages/food/search?keyword=%E4%B8%89%20%E6%96%87%E9%B1%BC')
})

test('private routes and invalid page contexts share the home page', () => {
  const { HOME_PATH, buildSharePath } = require('../utils/share')

  assert.equal(buildSharePath({
    route: 'pages/food/detail',
    options: { id: 'private-record' }
  }), HOME_PATH)
  assert.equal(buildSharePath({ route: 'pages/unknown', options: {} }), HOME_PATH)
  assert.equal(buildSharePath(null), HOME_PATH)
})

test('share handlers enable timeline only when requested', () => {
  const { createShareHandlers } = require('../utils/share')
  const friendOnly = createShareHandlers()
  const publicSharing = createShareHandlers({ timeline: true })

  assert.equal(typeof friendOnly.onShareAppMessage, 'function')
  assert.equal(friendOnly.onShareTimeline, undefined)
  assert.equal(typeof publicSharing.onShareAppMessage, 'function')
  assert.equal(typeof publicSharing.onShareTimeline, 'function')

  const friendCard = publicSharing.onShareAppMessage.call({
    route: 'pages/food/name-search',
    options: { keyword: '蓝莓', id: 'private-record' }
  })
  const timelineCard = publicSharing.onShareTimeline.call({
    route: 'pages/food/name-search',
    options: { keyword: '蓝莓', id: 'private-record' }
  })

  assert.equal(friendCard.path, '/pages/food/name-search?keyword=%E8%93%9D%E8%8E%93')
  assert.equal(timelineCard.query, 'keyword=%E8%93%9D%E8%8E%93')
})

test('every registered page explicitly installs friend sharing', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  appConfig.pages.forEach((route) => {
    const source = fs.readFileSync(path.join(root, `${route}.js`), 'utf8')
    assert.match(source, /\.\.\.createShareHandlers\(/, `${route} must install friend sharing`)
  })
})

test('timeline sharing is installed on safe browsing pages only', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  appConfig.pages.forEach((route) => {
    const source = fs.readFileSync(path.join(root, `${route}.js`), 'utf8')
    if (timelineRoutes.has(route)) {
      assert.match(source, /\.\.\.createShareHandlers\(\{ timeline: true \}\)/,
        `${route} must install timeline sharing`)
    } else {
      assert.doesNotMatch(source, /createShareHandlers\(\{ timeline: true \}\)/,
        `${route} must not expose timeline sharing`)
    }
  })
})
