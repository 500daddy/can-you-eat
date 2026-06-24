const test = require('node:test')
const assert = require('node:assert/strict')

function loadPage(pagePath, foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const absolutePagePath = require.resolve(`../${pagePath}`)
  delete require.cache[servicePath]
  delete require.cache[absolutePagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require(`../${pagePath}`)
  delete global.Page
  delete require.cache[absolutePagePath]
  delete require.cache[servicePath]
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

const assets = {
  food: {
    broccoli: '/assets/sprites/food/food_broccoli.png',
    babyPuree: '/assets/sprites/food/food_baby_puree.png'
  },
  actions: {},
  mascot: {}
}

test('add page tolerates missing query object', async () => {
  const page = createPageInstance(loadPage('pages/food/add', {
    getAssets: () => assets,
    getFoodBaseById: async () => {
      throw new Error('should not look up a food without query')
    }
  }))

  await page.onLoad()

  assert.equal(page.data.form.foodId, 'broccoli')
  assert.equal(page.data.form.name, '西兰花')
})

test('search page treats missing query object as empty keyword', async () => {
  const calls = []
  const foods = [{ id: 'broccoli', name: '西兰花' }]
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    searchFoods: async (keyword) => {
      calls.push(keyword)
      return foods
    }
  }))

  await page.onLoad()

  assert.deepEqual(calls, [''])
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.resultTitle, '推荐食材')
  assert.deepEqual(page.data.hotFoods, foods)
})

test('search page labels typed results and toggles more categories', async () => {
  const foods = Array.from({ length: 10 }, (_, index) => ({
    id: `food-${index + 1}`,
    name: `食材${index + 1}`
  }))
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    searchFoods: async (keyword) => keyword ? foods.slice(0, 2) : foods
  }))

  await page.onLoad()

  assert.equal(page.data.hotFoods.length, 8)
  assert.equal(page.data.categoryToggleText, '更多分类 ›')

  page.toggleCategories()

  assert.equal(page.data.hotFoods.length, 10)
  assert.equal(page.data.categoryToggleText, '收起分类')

  await page.onInput({ detail: { value: '胡萝卜' } })

  assert.equal(page.data.keyword, '胡萝卜')
  assert.equal(page.data.resultTitle, '搜索结果')
  assert.equal(page.data.results.length, 2)
})

test('detail page treats missing query object as missing record', async () => {
  const toasts = []
  let navigatedBack = false
  global.wx = {
    showToast: (input) => toasts.push(input),
    navigateBack: () => {
      navigatedBack = true
    }
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()
  const page = createPageInstance(loadPage('pages/food/detail', {
    getAssets: () => assets,
    getFoodDetail: async () => ({ record: null, base: null })
  }))

  await page.onLoad()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.deepEqual(toasts, [{ title: '记录不存在', icon: 'none' }])
  assert.equal(navigatedBack, true)
})
