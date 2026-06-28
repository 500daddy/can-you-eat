const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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
    babyPuree: '/assets/sprites/food/food_baby_puree.png',
    mushroom: '/assets/sprites/food/food_mushroom.png'
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
  const foods = [{
    id: 'broccoli',
    name: '西兰花',
    category: '蔬菜',
    subCategory: '花菜类',
    icon: '/assets/sprites/food/food_broccoli.png'
  }]
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
  assert.deepEqual(page.data.categoryGroups, [{
    name: '蔬菜',
    count: 1,
    icon: '/assets/sprites/food/food_broccoli.png',
    subCategories: [{ name: '花菜类', count: 1 }]
  }])
})

test('search page filters foods by first and second level categories', async () => {
  const foods = [
    { id: 'carrot', name: '胡萝卜', category: '蔬菜', subCategory: '根茎类', icon: '/assets/sprites/food/food_carrot.png' },
    { id: 'pumpkin', name: '南瓜', category: '蔬菜', subCategory: '瓜类', icon: '/assets/sprites/food/food_pumpkin.png' },
    { id: 'chicken', name: '鸡胸肉', category: '肉禽水产', subCategory: '禽肉类', icon: '/assets/sprites/food/food_chicken.png' },
    { id: 'beef', name: '牛肉', category: '肉禽水产', subCategory: '畜肉类', icon: '/assets/sprites/food/food_beef.png' }
  ]
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    searchFoods: async (keyword) => keyword ? foods.slice(0, 2) : foods
  }))

  await page.onLoad()

  assert.deepEqual(page.data.categoryGroups.map((item) => item.name), ['蔬菜', '肉禽水产'])

  page.selectCategory({ currentTarget: { dataset: { name: '蔬菜' } } })

  assert.equal(page.data.activeCategory, '蔬菜')
  assert.deepEqual(page.data.results.map((item) => item.id), ['carrot', 'pumpkin'])
  assert.deepEqual(page.data.subCategories.map((item) => item.name), ['根茎类', '瓜类'])

  page.selectSubCategory({ currentTarget: { dataset: { name: '根茎类' } } })

  assert.equal(page.data.activeSubCategory, '根茎类')
  assert.equal(page.data.resultTitle, '蔬菜 / 根茎类')
  assert.deepEqual(page.data.results.map((item) => item.id), ['carrot'])

  await page.onInput({ detail: { value: '胡萝卜' } })
  assert.equal(page.data.keyword, '胡萝卜')
  assert.equal(page.data.resultTitle, '搜索结果')
  assert.equal(page.data.activeCategory, '')
  assert.equal(page.data.results.length, 2)
})

test('search page category filtering shows all foods in the selected category', async () => {
  const vegetableFoods = Array.from({ length: 25 }, (_, index) => ({
    id: `veg-${index}`,
    name: `蔬菜${index}`,
    category: '蔬菜',
    subCategory: index < 15 ? '叶花菜类' : '菌藻类',
    icon: '/assets/sprites/food/food_broccoli.png'
  }))
  const foods = [
    ...vegetableFoods,
    { id: 'apple', name: '苹果', category: '水果', subCategory: '仁果类', icon: '/assets/sprites/food/food_apple.png' }
  ]
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    searchFoods: async () => foods.slice(0, 20)
  }))

  await page.onLoad()
  page.selectCategory({ currentTarget: { dataset: { name: '蔬菜' } } })

  assert.equal(page.data.results.length, 25)

  page.selectSubCategory({ currentTarget: { dataset: { name: '叶花菜类' } } })

  assert.equal(page.data.results.length, 15)
})

test('search page all category shows the complete food base instead of recommendations', async () => {
  const foods = Array.from({ length: 26 }, (_, index) => ({
    id: `food-${index}`,
    name: `食材${index}`,
    category: index < 13 ? '蔬菜' : '水果',
    subCategory: index < 13 ? '叶花菜类' : '仁果类',
    icon: '/assets/sprites/food/food_broccoli.png'
  }))
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    getRecommendedFoods: async () => foods.slice(0, 5),
    getRecommendationSummary: async () => ({ hint: '优先推荐' }),
    searchFoods: async () => foods.slice(0, 20)
  }))

  await page.onLoad()

  assert.equal(page.data.resultTitle, '推荐食材')
  assert.equal(page.data.results.length, 5)

  await page.clearCategory()

  assert.equal(page.data.resultTitle, '全部食材')
  assert.equal(page.data.recommendationHint, '')
  assert.equal(page.data.results.length, 26)
})

test('search page shows a back to top action for long result lists', async () => {
  const foods = Array.from({ length: 26 }, (_, index) => ({
    id: `food-${index}`,
    name: `食材${index}`,
    category: '蔬菜',
    subCategory: '叶花菜类',
    icon: '/assets/sprites/food/food_broccoli.png'
  }))
  const scrollCalls = []
  global.wx = {
    pageScrollTo: (input) => scrollCalls.push(input)
  }
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    getRecommendedFoods: async () => foods.slice(0, 5),
    searchFoods: async () => foods
  }))

  await page.onLoad()
  await page.clearCategory()
  page.onPageScroll({ scrollTop: 700 })

  assert.equal(page.data.showBackTop, true)

  page.scrollToTop()

  assert.deepEqual(scrollCalls, [{ scrollTop: 0, duration: 260 }])
  assert.equal(page.data.showBackTop, false)

  delete global.wx
})

test('search page normalizes legacy food categories into user-facing groups', async () => {
  const foods = [
    { id: 'carrot', name: '胡萝卜', category: '根茎', subCategory: '旧分类', icon: '/assets/sprites/food/food_carrot.png' },
    { id: 'mushroom', name: '蘑菇', category: '蔬菜', subCategory: '菌菇类', icon: '/assets/sprites/food/food_mushroom.png' },
    { id: 'chicken', name: '鸡胸肉', category: '肉蛋奶', subCategory: '蛋白', icon: '/assets/sprites/food/food_chicken.png' },
    { id: 'egg', name: '鸡蛋', category: '蛋奶', subCategory: '蛋白', icon: '/assets/sprites/food/food_egg.png' },
    { id: 'tofu', name: '豆腐', category: '蛋白', subCategory: '豆制品', icon: '/assets/sprites/food/food_tofu.png' }
  ]
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => foods,
    searchFoods: async () => foods
  }))

  await page.onLoad()

  assert.deepEqual(page.data.categoryGroups.map((item) => item.name), ['蔬菜', '肉禽水产', '蛋奶豆制品'])
  assert.deepEqual(page.data.categoryGroups[0].subCategories.map((item) => item.name), ['根茎类', '菌菇类'])

  page.selectCategory({ currentTarget: { dataset: { name: '肉禽水产' } } })
  assert.deepEqual(page.data.results.map((item) => item.id), ['chicken'])

  page.selectCategory({ currentTarget: { dataset: { name: '蛋奶豆制品' } } })
  assert.deepEqual(page.data.subCategories.map((item) => item.name), ['蛋类', '豆制品'])
  assert.deepEqual(page.data.results.map((item) => item.id), ['egg', 'tofu'])
})

test('search page opens custom add flow with the missing keyword', async () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadPage('pages/food/search', {
    getAssets: () => assets,
    getFoodBase: async () => [],
    searchFoods: async () => []
  }))
  page.setData({ keyword: '莲藕' })

  page.goAdd()

  delete global.wx
  assert.deepEqual(navigations, [{
    url: '/pages/food/add?name=%E8%8E%B2%E8%97%95&custom=1'
  }])
})

test('search page category section uses icon cards', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/search.wxml'), 'utf8')
  const stylesheet = fs.readFileSync(path.resolve(__dirname, '../pages/food/search.wxss'), 'utf8')

  assert.match(markup, /class="category-grid"/)
  assert.match(markup, /class="category-icon"/)
  assert.doesNotMatch(markup, /class="category-scroll"/)
  assert.match(stylesheet, /\.category-tile/)
  assert.match(stylesheet, /\.category-icon/)
  assert.doesNotMatch(stylesheet, /\.category-scroll/)
  assert.doesNotMatch(markup, /category-count/)
  assert.doesNotMatch(markup, /\{\{item\.count\}\}/)
  assert.doesNotMatch(markup, /\{\{foodBase\.length\}\}/)
  assert.match(markup, /class="back-top/)
  assert.match(stylesheet, /\.back-top/)
})

test('search page category styles stay compact and centered', () => {
  const stylesheet = fs.readFileSync(path.resolve(__dirname, '../pages/food/search.wxss'), 'utf8')

  assert.match(stylesheet, /\.category-tile\s*\{[\s\S]*min-height:\s*106rpx/)
  assert.match(stylesheet, /\.category-icon\s*\{[\s\S]*width:\s*54rpx/)
  assert.match(stylesheet, /\.subcategory-grid\s*\{[\s\S]*justify-content:\s*center/)
  assert.match(stylesheet, /\.subcategory-chip\s*\{[\s\S]*min-width:\s*108rpx/)
  assert.doesNotMatch(stylesheet, /min-height:\s*144rpx/)
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
