const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadAvatarCropPage() {
  const pagePath = require.resolve('../pages/avatar-crop/index')
  delete require.cache[pagePath]

  let definition
  global.Page = (input) => {
    definition = input
  }
  require('../pages/avatar-crop/index')
  delete global.Page
  delete require.cache[pagePath]
  return definition
}

function createPageInstance(definition, eventChannel) {
  const setDataCalls = []
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setDataCalls,
    setData(patch) {
      setDataCalls.push(patch)
      this.data = { ...this.data, ...patch }
    },
    getOpenerEventChannel: () => eventChannel,
    ...definition
  }
}

test('avatar crop page lets users move and scale before exporting a square avatar', async () => {
  const events = []
  const drawCalls = []
  let drew = false
  let returned = false
  const page = createPageInstance(loadAvatarCropPage(), {
    emit: (name, payload) => events.push({ name, payload })
  })

  global.wx = {
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    getImageInfo: (input) => {
      input.success({ width: 600, height: 400, path: input.src })
    },
    createCanvasContext: () => ({
      drawImage: (...args) => drawCalls.push(args),
      draw: (_reserve, callback) => {
        drew = true
        callback()
      }
    }),
    canvasToTempFilePath: (input) => {
      input.success({ tempFilePath: '/tmp/cropped-avatar.png' })
    },
    navigateBack: () => {
      returned = true
    },
    showToast: () => {}
  }

  page.onLoad({ src: encodeURIComponent('/tmp/avatar.jpg') })
  page.setDataCalls.length = 0
  page.onMove({ detail: { x: -30, y: 8 } })
  page.onScale({ detail: { scale: 1.6, x: -30, y: 8 } })
  await page.confirmCrop()

  delete global.wx
  assert.equal(page.data.src, '/tmp/avatar.jpg')
  assert.equal(page.data.ready, true)
  assert.deepEqual(page.setDataCalls, [{ saving: true }])
  assert.equal(drawCalls[0][0], '/tmp/avatar.jpg')
  assert.equal(drawCalls[0].length, 5)
  assert.ok(drawCalls[0][1] < -100, 'cropped draw should use the latest in-memory drag state')
  assert.equal(drew, true)
  assert.deepEqual(events[0], {
    name: 'avatarCropped',
    payload: { avatarUrl: '/tmp/cropped-avatar.png' }
  })
  assert.equal(returned, true)
})

test('avatar crop page renders a draggable square cropper and hidden export canvas', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/avatar-crop/index.wxml'), 'utf8')

  assert.match(markup, /movable-area/)
  assert.match(markup, /movable-view[^>]+scale/)
  assert.doesNotMatch(markup, /bindchanging="onSliderChange"/)
  assert.match(markup, /bindtap="confirmCrop"/)
  assert.match(markup, /canvas-id="avatarCropCanvas"/)
})
