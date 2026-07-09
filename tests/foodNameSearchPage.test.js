const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadNameSearchPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/food/name-search')
  delete require.cache[servicePath]
  delete require.cache[pagePath]
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
  require('../pages/food/name-search')
  delete global.Page
  delete require.cache[pagePath]
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
  actions: { search: '/assets/sprites/actions/action_search.png' },
  mascot: { emptyNotFound: '/assets/sprites/mascot/empty_not_found.png' }
}

test('name search page searches foods by typed keyword and opens add page', async () => {
  const calls = []
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    searchFoods: async (keyword) => {
      calls.push(keyword)
      return keyword
        ? [{ id: 'tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜', defaultStorage: 'fridge', babyDays: '2-3天' }]
        : []
    }
  }))

  await page.onLoad()
  await page.onInput({ detail: { value: '西红柿' } })
  page.chooseFood({ currentTarget: { dataset: { id: 'tomato' } } })

  delete global.wx
  assert.equal(page.data.searchFocus, true)
  assert.equal(page.data.keyword, '西红柿')
  assert.equal(page.data.resultTitle, '搜索结果')
  assert.deepEqual(calls, ['西红柿'])
  assert.equal(page.data.results[0].id, 'tomato')
  assert.deepEqual(navigations, [{ url: '/pages/food/add?foodId=tomato' }])
})

test('name search page creates custom food from missing keyword', async () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    searchFoods: async () => []
  }))

  await page.onLoad({ keyword: '香椿' })
  page.goAdd()

  delete global.wx
  assert.equal(page.data.hasSearched, true)
  assert.deepEqual(navigations, [{
    url: '/pages/food/add?name=%E9%A6%99%E6%A4%BF&custom=1'
  }])
})

test('name search page ignores invalid keyword query placeholders', async () => {
  const calls = []
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    getRecommendedFoods: async () => [{ id: 'porridge', name: '粥', category: '主食辅食' }],
    searchFoods: async (keyword) => {
      calls.push(keyword)
      return []
    }
  }))

  await page.onLoad({ keyword: 'undefined' })

  assert.equal(page.data.keyword, '')
  assert.equal(page.data.hasSearched, false)
  assert.equal(page.data.resultTitle, '推荐食材')
  assert.deepEqual(calls, [])

  await page.onLoad({ keyword: 'null' })

  assert.equal(page.data.keyword, '')
  assert.equal(page.data.hasSearched, false)
  assert.equal(page.data.resultTitle, '推荐食材')
  assert.deepEqual(calls, [])
})

test('name search page sanitizes invalid input events before rendering', async () => {
  const calls = []
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    getRecommendedFoods: async () => [{ id: 'porridge', name: '粥', category: '主食辅食' }],
    searchFoods: async (keyword) => {
      calls.push(keyword)
      return []
    }
  }))

  await page.onLoad()
  const returnedValue = page.onInput({ detail: { value: undefined } })

  assert.equal(returnedValue, '')
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.hasSearched, false)
  assert.deepEqual(calls, [])

  const returnedPlaceholder = page.onInput({ detail: { value: 'undefined' } })

  assert.equal(returnedPlaceholder, '')
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.hasSearched, false)
  assert.deepEqual(calls, [])
})

test('name search page hides the native navigation title', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../pages/food/name-search.json'), 'utf8'))

  assert.equal(config.navigationBarTitleText, '')
})

test('name search page is a focused search page without category browsing', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/name-search.wxml'), 'utf8')

  assert.doesNotMatch(markup, /page-title">搜索添加/)
  assert.match(markup, /class="search-box"/)
  assert.match(markup, /focus="\{\{searchFocus\}\}"/)
  assert.doesNotMatch(markup, /食材分类/)
  assert.doesNotMatch(markup, /category-card/)
})

test('name search page starts with recommended foods and history choices', async () => {
  const storageWrites = []
  global.wx = {
    getStorageSync: (key) => key === 'food_name_search_recent'
      ? [{ id: 'banana', name: '香蕉', icon: '/banana.png', category: '水果' }]
      : undefined,
    setStorageSync: (key, value) => storageWrites.push({ key, value }),
    navigateTo: () => {}
  }
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    getRecommendationSummary: async () => ({
      babyAgeText: '2岁半',
      stageLabel: '12个月+',
      hint: '优先覆盖主食、蔬菜、优质蛋白、豆制品和水果。'
    }),
    getRecommendedFoods: async () => [
      { id: 'porridge', name: '粥', icon: '/porridge.png', category: '主食辅食', aliases: ['米粥'], defaultStorage: 'fridge', babyDays: '1天' },
      { id: 'carrot', name: '胡萝卜', icon: '/carrot.png', category: '蔬菜', aliases: ['红萝卜'], defaultStorage: 'fridge', babyDays: '4-5天' },
      { id: 'chicken', name: '鸡胸肉', icon: '/chicken.png', category: '肉禽水产' },
      { id: 'egg', name: '鸡蛋', icon: '/egg.png', category: '蛋奶豆制品' },
      { id: 'rice', name: '米饭', icon: '/rice.png', category: '主食辅食' }
    ],
    searchFoods: async () => []
  }))

  await page.onLoad()
  page.chooseFood({ currentTarget: { dataset: { id: 'carrot' } } })

  delete global.wx
  assert.equal(page.data.resultTitle, '推荐食材')
  assert.match(page.data.recommendationHint, /优先覆盖主食/)
  assert.deepEqual(page.data.results.map((item) => item.name), ['粥', '胡萝卜', '鸡胸肉', '鸡蛋', '米饭'])
  assert.deepEqual(page.data.recentFoods.map((item) => item.name), ['香蕉'])
  assert.equal(storageWrites[0].key, 'food_name_search_recent')
  assert.deepEqual(storageWrites[0].value.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category
  })), [
    { id: 'carrot', name: '胡萝卜', category: '蔬菜' },
    { id: 'banana', name: '香蕉', category: '水果' }
  ])
})

test('name search page markup offers quick pick sections before searching', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/name-search.wxml'), 'utf8')

  assert.match(markup, /\{\{resultTitle\}\}/)
  assert.match(markup, /recommendation-tip/)
  assert.match(markup, /历史记录/)
  assert.doesNotMatch(markup, /高频食材/)
})

test('name search page lightly prompts baby profile editing', async () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadNameSearchPage({
    getAssets: () => assets,
    getRecommendationSummary: async () => ({
      hint: '按宝宝信息推荐',
      needsBabyProfilePrompt: true
    }),
    getRecommendedFoods: async () => [],
    searchFoods: async () => []
  }))
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/name-search.wxml'), 'utf8')

  await page.onLoad()
  page.goBabySettings()

  delete global.wx
  assert.equal(page.data.needsBabyProfilePrompt, true)
  assert.match(markup, /完善宝宝信息/)
  assert.match(markup, /bindtap="goBabySettings"/)
  assert.deepEqual(navigations, [{ url: '/pages/settings/baby' }])
})

test('name search page explains custom food fallback conservatively', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/name-search.wxml'), 'utf8')

  assert.match(markup, /暂时没找到这个食材/)
  assert.match(markup, /换个常见叫法/)
  assert.match(markup, /按更保守的保存期提醒/)
  assert.match(markup, /创建自定义食材/)
})
