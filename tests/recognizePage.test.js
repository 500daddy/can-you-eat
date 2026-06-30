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
  assert.match(markup, /选中后可确认保存日期和方式/)
  assert.match(markup, /class="result-action"/)
  assert.match(markup, /bindtap="chooseResult"/)
  assert.match(styles, /\.result-action/)
  assert.match(styles, /\.result-action[\s\S]*white-space:\s*nowrap/)
  assert.match(styles, /\.result-card/)
})
