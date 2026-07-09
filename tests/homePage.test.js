const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadHomePage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/index/index')
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
  require('../pages/index/index')
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

test('home add button opens the dedicated name search page', () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => {
      navigations.push(input)
    },
    switchTab: () => {
      throw new Error('search entry should use the dedicated search page')
    }
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goAdd()

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/food/name-search' }])
})

test('home category button switches to food search tab with category intent', () => {
  const tabSwitches = []
  const storageWrites = []
  global.wx = {
    setStorageSync: (key, value) => storageWrites.push({ key, value }),
    switchTab: (input) => tabSwitches.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goCategory()

  delete global.wx
  assert.deepEqual(storageWrites, [{ key: 'food_search_entry', value: 'category' }])
  assert.deepEqual(tabSwitches, [{ url: '/pages/food/search' }])
})

test('home purchase plan button opens the standalone planning page', () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goPurchasePlan()

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/purchase-plan/index' }])
  assert.match(readText('pages/index/index.wxml'), /计划采购/)
})

test('home quick process button opens the quick processing page', () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goQuickProcess()

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/quick-process/index' }])
  assert.match(readText('pages/index/index.wxml'), /今天怎么处理/)
  assert.doesNotMatch(readText('pages/index/index.wxml'), /提醒设置/)
})

test('home keeps search and category as the primary entry points', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const buttonRow = markup.match(/<view class="button-row">([\s\S]*?)<\/view>\s*<view class="secondary-action-row">/)

  assert.ok(buttonRow, 'main button row should exist before the compact secondary action row')
  assert.equal((buttonRow[1].match(/<button/g) || []).length, 2)
  assert.match(buttonRow[1], /搜索添加/)
  assert.match(buttonRow[1], /知道名字，直接找/)
  assert.match(buttonRow[1], /按分类找/)
  assert.match(buttonRow[1], /蔬菜水果，慢慢选/)
  assert.match(buttonRow[1], /assets\.actions\.search/)
  assert.match(buttonRow[1], /assets\.food\.broccoli/)
  assert.doesNotMatch(buttonRow[1], /拍照识别/)
  assert.doesNotMatch(buttonRow[1], /goRecognize/)
  assert.doesNotMatch(buttonRow[1], /assets\.actions\.camera/)
  assert.match(buttonRow[1], /bindtap="goAdd"/)
  assert.match(buttonRow[1], /bindtap="goCategory"/)
  assert.match(styles, /\.main-search-btn[\s\S]*flex:\s*1 1 0/)
  assert.match(styles, /\.main-category-btn[\s\S]*flex:\s*1 1 0/)
  assert.doesNotMatch(styles, /flex:\s*1\.35 1 0/)
  assert.match(styles, /\.main-action-title/)
  assert.match(styles, /\.main-action-desc/)
})

test('home keeps secondary actions as matched compact icon buttons', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const buttonRow = markup.match(/<view class="button-row">([\s\S]*?)<\/view>\s*<view class="secondary-action-row">([\s\S]*?)<\/view>/)

  assert.ok(buttonRow, 'main button row should be followed by a compact secondary action row')
  assert.equal((buttonRow[2].match(/<button/g) || []).length, 2)
  assert.match(markup, /class="secondary-action-row"/)
  assert.match(markup, /class="pixel-btn ghost secondary-action-btn"/)
  assert.match(buttonRow[2], /计划采购/)
  assert.match(buttonRow[2], /今天怎么处理/)
  assert.equal((buttonRow[2].match(/class="secondary-action-icon"/g) || []).length, 2)
  assert.match(buttonRow[2], /assets\.actions\.cart/)
  assert.match(buttonRow[2], /assets\.actions\.cookware/)
  assert.doesNotMatch(buttonRow[2], /assets\.food/)
  assert.doesNotMatch(buttonRow[2], /assets\.actions\.basket/)
  assert.doesNotMatch(buttonRow[2], /assets\.ui\.signBoard/)
  assert.doesNotMatch(buttonRow[2], /assets\.ui\.heat/)
  assert.doesNotMatch(buttonRow[2], /assets\.actions\.eaten/)
  assert.doesNotMatch(markup, /class="plan-subtitle"/)
  assert.doesNotMatch(markup, /提前想好买什么/)
  assert.doesNotMatch(buttonRow[1], /goPurchasePlan/)
  assert.doesNotMatch(buttonRow[1], /goQuickProcess/)
  assert.doesNotMatch(styles, /\.button-row \.pixel-btn\s*\{\s*flex:\s*1;\s*\}/)
  assert.match(styles, /\.secondary-action-row/)
  assert.match(styles, /\.secondary-action-row[\s\S]*gap:\s*24rpx/)
  assert.match(styles, /\.secondary-action-row[\s\S]*margin-top:\s*24rpx/)
  assert.match(styles, /\.secondary-action-row[\s\S]*margin-bottom:\s*18rpx/)
  assert.match(styles, /\.secondary-action-btn[\s\S]*flex:\s*1 1 0/)
  assert.match(styles, /\.secondary-action-btn[\s\S]*height:\s*68rpx/)
  assert.match(styles, /\.secondary-action-btn[\s\S]*font-size:\s*26rpx/)
  assert.match(styles, /\.secondary-action-icon[\s\S]*width:\s*40rpx/)
  assert.match(styles, /\.secondary-action-icon/)
})

test('home primary actions keep compact height while filling row width', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const buttonRow = markup.match(/<view class="button-row">([\s\S]*?)<\/view>/)

  assert.ok(buttonRow, 'main button row should exist')
  assert.equal((buttonRow[1].match(/class="pixel-btn main-action-btn/g) || []).length, 2)
  assert.equal((buttonRow[1].match(/class="main-action-icon"/g) || []).length, 2)
  assert.match(buttonRow[1], /assets\.actions\.search/)
  assert.match(buttonRow[1], /assets\.food\.broccoli/)
  assert.doesNotMatch(buttonRow[1], /assets\.actions\.addIcon/)
  assert.doesNotMatch(buttonRow[1], /assets\.actions\.camera/)
  assert.doesNotMatch(buttonRow[1], /class="btn-symbol"/)
  assert.match(styles, /\.home-page \.button-row[\s\S]*gap:\s*20rpx/)
  assert.match(styles, /\.main-action-btn[\s\S]*min-width:\s*0/)
  assert.match(styles, /\.main-action-btn[\s\S]*height:\s*168rpx/)
  assert.match(styles, /\.main-action-btn[\s\S]*min-height:\s*168rpx/)
  assert.match(styles, /\.main-action-btn[\s\S]*font-size:\s*30rpx/)
  assert.doesNotMatch(styles, /\.main-action-btn[\s\S]*aspect-ratio:\s*1\s*\/\s*1/)
  assert.match(styles, /\.main-action-btn[\s\S]*flex-direction:\s*column/)
  assert.match(styles, /\.main-action-icon[\s\S]*width:\s*60rpx/)
})

test('home status filter chips narrow long food lists by section', async () => {
  const sections = [
    { title: '今天建议处理', items: [{ id: 'today-1' }, { id: 'today-2' }] },
    { title: '可留给大人吃', items: [{ id: 'adult-1' }] },
    { title: '不建议继续食用', items: [{ id: 'risk-1' }] }
  ]
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => sections.flatMap((item) => item.items),
    getHomeSections: async () => sections
  }))

  await page.refreshRecords()

  assert.deepEqual(page.data.statusFilters.map((item) => [item.key, item.label, item.count]), [
    ['all', '全部', 4],
    ['today', '今日处理', 2],
    ['adult', '可给大人', 1],
    ['risk', '不建议', 1],
    ['fresh', '新鲜', 0]
  ])

  page.chooseStatusFilter({ currentTarget: { dataset: { key: 'adult' } } })

  assert.equal(page.data.activeStatusFilter, 'adult')
  assert.equal(page.data.sections[0].title, '可留给大人吃')
  assert.deepEqual(page.data.sections[0].items.map((item) => item.id), ['adult-1'])
  assert.equal(page.data.sections[0].items[0].reserveFoodIconSlot, false)
})

test('home puts processing entry inside the today section instead of a standalone alert card', async () => {
  const sections = [
    { title: '今天建议处理', items: [{ id: 'today-1', name: '西兰花' }] },
    { title: '不建议继续食用', items: [] }
  ]
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => sections.flatMap((item) => item.items),
    getHomeSections: async () => sections
  }))
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }

  await page.refreshRecords()
  page.goQuickProcess()

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/quick-process/index' }])
  assert.doesNotMatch(readText('pages/index/index.wxml'), /class="home-next-card/)
  assert.doesNotMatch(readText('pages/index/index.wxml'), /class="section-action"/)
  assert.doesNotMatch(readText('pages/index/index.wxml'), /需要处理/)
})

test('home shows a once-per-day urgent modal and routes to processing advice', async () => {
  const sections = [
    {
      title: '不建议继续食用',
      items: [{ id: 'risk-1', name: '蓝莓', status: 'expired' }]
    },
    {
      title: '今天建议处理',
      items: [{ id: 'today-1', name: '西兰花', status: 'baby_today' }]
    }
  ]
  const storage = {}
  const modals = []
  const navigations = []
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => {
      storage[key] = value
    },
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    },
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => sections.flatMap((item) => item.items),
    getHomeSections: async () => sections
  }))

  await page.refreshRecords()
  await page.refreshRecords()

  delete global.wx
  assert.equal(modals.length, 1)
  assert.equal(modals[0].title, '有食材需要谨慎处理')
  assert.match(modals[0].content, /蓝莓：不建议继续给宝宝/)
  assert.match(modals[0].content, /西兰花：今天建议处理/)
  assert.deepEqual(navigations, [{ url: '/pages/quick-process/index' }])
})

test('home urgent modal filters risk foods instead of routing to recipe advice when only risks exist', async () => {
  const sections = [
    {
      title: '不建议继续食用',
      items: [{ id: 'risk-1', name: '蓝莓', status: 'expired' }]
    }
  ]
  const modals = []
  const navigations = []
  global.wx = {
    getStorageSync: () => '',
    setStorageSync: () => {},
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    },
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => sections.flatMap((item) => item.items),
    getHomeSections: async () => sections
  }))

  await page.refreshRecords()

  delete global.wx
  assert.equal(modals[0].confirmText, '看风险')
  assert.deepEqual(navigations, [])
  assert.equal(page.data.activeStatusFilter, 'risk')
  assert.equal(page.data.sections[0].title, '不建议继续食用')
})

test('home folds older unprocessed risky foods behind an expandable row', async () => {
  const sections = [
    {
      title: '不建议继续食用',
      items: [
        {
          id: 'risk-new',
          name: '鸡蛋',
          status: 'not_recommended',
          purchaseDate: '2999-01-01',
          adultExpireDate: '2999-01-03'
        },
        {
          id: 'risk-old',
          name: '蓝莓',
          status: 'expired',
          purchaseDate: '2020-01-01',
          adultExpireDate: '2020-01-03'
        }
      ]
    }
  ]
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => sections.flatMap((item) => item.items),
    getHomeSections: async () => sections
  }))

  await page.refreshRecords()

  assert.equal(page.data.statusFilters.find((item) => item.key === 'risk').count, 2)
  assert.equal(page.data.sections[0].totalCount, 2)
  assert.equal(page.data.sections[0].collapsedCount, 1)
  assert.equal(page.data.sections[0].collapsedExpanded, false)
  assert.deepEqual(page.data.sections[0].items.map((item) => item.id), ['risk-new'])

  page.toggleCollapsedRisk()

  assert.equal(page.data.riskCollapsedExpanded, true)
  assert.equal(page.data.sections[0].collapsedCount, 1)
  assert.equal(page.data.sections[0].collapsedExpanded, true)
  assert.deepEqual(page.data.sections[0].items.map((item) => item.id), ['risk-new', 'risk-old'])
})

test('home renders the stale-risk collapse entry and total section count', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const script = readText('pages/index/index.js')

  assert.match(markup, /item\.totalCount \|\| item\.items\.length/)
  assert.match(markup, /class="collapsed-risk-card/)
  assert.match(markup, /bindtap="toggleCollapsedRisk"/)
  assert.match(markup, /item\.collapsedTitle/)
  assert.match(markup, /item\.collapsedDesc/)
  assert.match(script, /已折叠较久未处理食材/)
  assert.match(script, /点这里展开处理/)
  assert.match(styles, /\.collapsed-risk-card/)
  assert.match(styles, /\.collapsed-risk-action/)
})

test('home renders a horizontal status filter bar before food sections', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')

  assert.match(markup, /scroll-view[^>]+class="status-filter-scroll"/)
  assert.match(markup, /wx:for="\{\{statusFilters\}\}"/)
  assert.match(markup, /bindtap="chooseStatusFilter"/)
  assert.match(markup, /class="status-chip \{\{activeStatusFilter === item\.key \? 'active' : ''\}\}"/)
  assert.match(markup, /class="status-count"/)
  assert.match(styles, /\.status-filter-scroll/)
  assert.match(styles, /\.status-chip/)
  assert.match(styles, /\.status-chip\.active/)
})

test('home renders a lightweight feature guide and interaction polish', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const emptyStyles = readText('components/pixel-empty/pixel-empty.wxss')
  const cardStyles = readText('components/food-card/food-card.wxss')

  assert.match(markup, /class="home-guide-card/)
  assert.match(markup, /catchtap="dismissHomeGuide"/)
  assert.match(markup, /买之前用计划采购，快到期看今天怎么处理。/)
  assert.match(styles, /\.home-guide-card/)
  assert.doesNotMatch(styles, /\.section-action/)
  assert.match(styles, /@keyframes home-rise-in/)
  assert.match(styles, /\.home-page \.pixel-btn:active/)
  assert.match(cardStyles, /@keyframes food-card-rise/)
  assert.match(cardStyles, /\.food-card:active/)
  assert.match(emptyStyles, /@keyframes empty-float/)
})

test('home feature guide can be dismissed', async () => {
  const storageWrites = []
  global.wx = {
    getStorageSync: () => '',
    setStorageSync: (key, value) => storageWrites.push({ key, value })
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, actions: {}, food: {} }),
    getSettings: async () => ({ babyAgeText: '8个月' }),
    getFoodRecords: async () => [],
    getHomeSections: async () => []
  }))

  await page.refreshRecords()
  page.dismissHomeGuide()

  delete global.wx
  assert.equal(page.data.homeGuideVisible, false)
  assert.deepEqual(storageWrites, [{ key: 'home_feature_guide_dismissed', value: '1' }])
})

test('home empty state hides duplicate action buttons', () => {
  const homeMarkup = readText('pages/index/index.wxml')
  const emptyMarkup = readText('components/pixel-empty/pixel-empty.wxml')

  assert.match(homeMarkup, /<pixel-empty[^>]+show-actions="\{\{false\}\}"/)
  assert.match(emptyMarkup, /<view wx:if="\{\{showActions\}\}" class="empty-actions">/)
})

test('home hero keeps only a simple priority explanation', async () => {
  const markup = readText('pages/index/index.wxml')

  assert.match(markup, /今天优先处理这些食材/)
  assert.match(markup, /先吃快到期的，少浪费，也更安心/)
  assert.doesNotMatch(markup, /recommend-basis/)
  assert.doesNotMatch(markup, /推荐依据/)
  assert.doesNotMatch(markup, /按 \{\{babyAgeText\}\}/)
  assert.doesNotMatch(markup, /settings\.babyStageText/)
  assert.doesNotMatch(markup, /settings\.babyStageDescription/)
  assert.doesNotMatch(markup, /basis-desc/)
  assert.doesNotMatch(markup, /settings\.babyAvatarImage/)
  assert.doesNotMatch(markup, /class="baby-avatar"/)
  assert.doesNotMatch(markup, /settings\.babyName/)
  assert.doesNotMatch(markup, /养娃新手村/)

  const page = createPageInstance(loadHomePage({
    getAssets: () => ({ ui: {}, mascot: {} }),
    getSettings: async () => ({
      babyName: '500',
      babyAgeText: '11个月',
      babyStageText: '辅食探索',
      babyStageDescription: '6-12个月，按更保守的辅食尝试阶段推荐。',
      babyAvatarImage: '/tmp/avatar.png'
    }),
    getFoodRecords: async () => [],
    getHomeSections: async () => []
  }))

  await page.refreshRecords()

  assert.equal(page.data.babyAgeText, '11个月')
  assert.equal(page.data.settings.babyStageText, '辅食探索')
})
