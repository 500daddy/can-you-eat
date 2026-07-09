const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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
  let chooseMediaOptions
  let recognitionPromise
  global.wx = {
    chooseMedia: (options) => {
      chooseMediaOptions = options
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
  assert.deepEqual(chooseMediaOptions.sizeType, ['compressed'])
  assert.equal(page.data.hasImage, true)
  assert.equal(page.data.imagePath, '/tmp/carrot.jpg')
  assert.equal(page.data.recognizing, false)
  assert.deepEqual(page.data.results, [])
  assert.deepEqual(toasts, [{ title: '识别失败，请重试', icon: 'none' }])
})

test('recognize page compresses selected image before recognition upload', async () => {
  const recognizedPaths = []
  let recognitionPromise
  global.wx = {
    chooseMedia: (options) => {
      recognitionPromise = options.success({
        tempFiles: [{ tempFilePath: '/tmp/large-food.jpg' }]
      })
    },
    compressImage: (input) => {
      assert.equal(input.src, '/tmp/large-food.jpg')
      assert.equal(input.quality, 55)
      input.success({ tempFilePath: '/tmp/small-food.jpg' })
    }
  }

  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {
      recognizeImage: async (imagePath) => {
        recognizedPaths.push(imagePath)
        return {
          imageUrl: imagePath,
          results: []
        }
      }
    }
  }))

  page.chooseImage()
  await recognitionPromise

  delete global.wx
  assert.deepEqual(recognizedPaths, ['/tmp/small-food.jpg'])
  assert.equal(page.data.imagePath, '/tmp/small-food.jpg')
  assert.equal(page.data.recognizing, false)
})

test('recognize page keeps unmatched candidates from cloud recognition', async () => {
  let recognitionPromise
  global.wx = {
    chooseMedia: (options) => {
      recognitionPromise = options.success({
        tempFiles: [{ tempFilePath: '/tmp/peppers.jpg' }]
      })
    }
  }

  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {
      recognizeImage: async (imagePath) => ({
        imageUrl: imagePath,
        results: [],
        unmatchedCandidates: [
          { foodName: '彩色甜椒', percent: 82, confidenceLabel: '把握较高' }
        ]
      })
    }
  }))

  page.chooseImage()
  await recognitionPromise

  delete global.wx
  assert.equal(page.data.unmatchedCandidates[0].foodName, '彩色甜椒')
})

test('recognize page opens custom add flow from unmatched model candidate', async () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {}
  }))

  page.chooseUnmatchedCandidate({ currentTarget: { dataset: { name: '彩色甜椒' } } })

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/food/add?name=%E5%BD%A9%E8%89%B2%E7%94%9C%E6%A4%92&custom=1' }])
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

test('recognize page uses search add copy instead of manual search copy', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/recognize/index.wxml'), 'utf8')

  assert.match(markup, /搜索添加/)
  assert.doesNotMatch(markup, /手动搜索/)
  assert.doesNotMatch(markup, /手动/)
})

test('recognize page makes each result an explicit add/edit choice', async () => {
  const navigations = []
  const selections = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadRecognizePage({
    foodService: {
      getAssets: () => ({ food: { carrot: '/assets/sprites/food/food_carrot.png' } })
    },
    recognitionService: {
      logSelection: async (input) => selections.push(input)
    }
  }))
  page.setData({
    imagePath: '/tmp/vege.jpg',
    results: [{
      foodId: 'carrot',
      foodName: '胡萝卜',
      confidence: 0.92,
      percent: 92,
      icon: '/assets/sprites/food/food_carrot.png'
    }]
  })

  await page.chooseResult({ currentTarget: { dataset: { id: 'carrot' } } })

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/food/add?foodId=carrot' }])
  assert.equal(selections.length, 1)
  assert.equal(selections[0].selectedFoodName, '胡萝卜')
  assert.equal(selections[0].selectedFoodBaseId, 'carrot')
})

test('recognize result markup shows a clear next action instead of only confidence scores', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/recognize/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.resolve(__dirname, '../pages/recognize/index.wxss'), 'utf8')

  assert.match(markup, /添加/)
  assert.doesNotMatch(markup, /选这个并添加/)
  assert.match(markup, /选中后，再确认保存日期和方式/)
  assert.match(markup, /class="result-action"/)
  assert.match(markup, /bindtap="chooseResult"/)
  assert.match(markup, /confidenceLabel/)
  assert.match(markup, /result-reason/)
  assert.match(markup, /没识别出合适食材/)
  assert.match(markup, /AI 识别到了这些名称/)
  assert.match(markup, /chooseUnmatchedCandidate/)
  assert.match(markup, /重新选择/)
  assert.match(styles, /\.result-action/)
  assert.match(styles, /\.result-action[\s\S]*white-space:\s*nowrap/)
  assert.match(styles, /\.result-card/)
  assert.match(styles, /\.confidence-tag/)
  assert.match(styles, /\.result-card\.low/)
  assert.match(styles, /\.candidate-card/)
  assert.match(styles, /\.empty-recognition-card/)
})

test('recognize page shows an active scanning state while recognition is running', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/recognize/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.resolve(__dirname, '../pages/recognize/index.wxss'), 'utf8')

  assert.match(markup, /recognition-overlay/)
  assert.match(markup, /scan-line/)
  assert.match(markup, /scan-dot/)
  assert.match(markup, /图片已选择，正在上传识别/)
  assert.match(markup, /正在上传并识别/)
  assert.match(styles, /@keyframes\s+scanMove/)
  assert.match(styles, /@keyframes\s+dotPulse/)
  assert.match(styles, /\.recognize-state\.active/)
})
