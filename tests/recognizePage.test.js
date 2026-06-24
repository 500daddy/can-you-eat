const test = require('node:test')
const assert = require('node:assert/strict')

function loadRecognizePage({ foodService, recognitionService }) {
  const foodServicePath = require.resolve('../utils/foodService')
  const recognitionServicePath = require.resolve('../utils/recognitionService')
  const pagePath = require.resolve('../pages/recognize/index')
  delete require.cache[foodServicePath]
  delete require.cache[recognitionServicePath]
  delete require.cache[pagePath]
  require.cache[foodServicePath] = {
    id: foodServicePath,
    filename: foodServicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }
  require.cache[recognitionServicePath] = {
    id: recognitionServicePath,
    filename: recognitionServicePath,
    loaded: true,
    exports: {
      getRecognitionService: () => recognitionService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require('../pages/recognize/index')
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[recognitionServicePath]
  delete require.cache[foodServicePath]
  return definition
}

function createPageInstance(definition) {
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    ...definition
  }
}

test('recognize page recovers when selected image recognition fails', async () => {
  const toasts = []
  let recognitionPromise
  global.wx = {
    chooseMedia: (options) => {
      recognitionPromise = options.success({
        tempFiles: [{ tempFilePath: '/tmp/carrot.jpg' }]
      })
    },
    showToast: (input) => toasts.push(input)
  }

  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {
      recognizeImage: async () => {
        throw new Error('recognition service failed')
      }
    }
  }))

  page.chooseImage()
  await assert.doesNotReject(recognitionPromise)

  delete global.wx
  assert.equal(page.data.hasImage, true)
  assert.equal(page.data.imagePath, '/tmp/carrot.jpg')
  assert.equal(page.data.recognizing, false)
  assert.deepEqual(page.data.results, [])
  assert.deepEqual(toasts, [{ title: '识别失败，请重试', icon: 'none' }])
})

test('recognize page manual search switches to food search tab', () => {
  const tabSwitches = []
  global.wx = {
    navigateTo: () => {
      throw new Error('should use switchTab for tabBar pages')
    },
    switchTab: (input) => tabSwitches.push(input)
  }
  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {}
  }))

  page.manualSearch()

  delete global.wx
  assert.deepEqual(tabSwitches, [{ url: '/pages/food/search' }])
})
