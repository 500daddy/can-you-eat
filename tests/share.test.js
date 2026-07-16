const test = require('node:test')
const assert = require('node:assert/strict')

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
