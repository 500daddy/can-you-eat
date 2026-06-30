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

test('home add button switches to food search tab instead of default broccoli add page', () => {
  const tabSwitches = []
  global.wx = {
    navigateTo: () => {
      throw new Error('should use switchTab for tabBar pages')
    },
    switchTab: (input) => tabSwitches.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goAdd()

  delete global.wx
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
  assert.match(readText('pages/index/index.wxml'), /快速处理/)
  assert.doesNotMatch(readText('pages/index/index.wxml'), /提醒设置/)
})

test('home keeps secondary actions as matched compact icon buttons', () => {
  const markup = readText('pages/index/index.wxml')
  const styles = readText('pages/index/index.wxss')
  const buttonRow = markup.match(/<view class="button-row">([\s\S]*?)<\/view>\s*<view class="secondary-action-row">([\s\S]*?)<\/view>/)

  assert.ok(buttonRow, 'main button row should be followed by a compact secondary action row')
  assert.equal((buttonRow[1].match(/<button/g) || []).length, 2)
  assert.equal((buttonRow[2].match(/<button/g) || []).length, 2)
  assert.match(markup, /class="secondary-action-row"/)
  assert.match(markup, /class="pixel-btn ghost secondary-action-btn"/)
  assert.match(buttonRow[2], /计划采购/)
  assert.match(buttonRow[2], /快速处理/)
  assert.equal((buttonRow[2].match(/class="secondary-action-icon"/g) || []).length, 2)
  assert.match(buttonRow[2], /assets\.actions\.cart/)
  assert.match(buttonRow[2], /assets\.food\.babyPuree/)
  assert.doesNotMatch(buttonRow[2], /assets\.actions\.basket/)
  assert.doesNotMatch(buttonRow[2], /assets\.ui\.signBoard/)
  assert.doesNotMatch(buttonRow[2], /assets\.ui\.heat/)
  assert.doesNotMatch(buttonRow[2], /assets\.actions\.cookware/)
  assert.doesNotMatch(buttonRow[2], /assets\.actions\.eaten/)
  assert.doesNotMatch(markup, /class="plan-subtitle"/)
  assert.doesNotMatch(markup, /提前想好买什么/)
  assert.doesNotMatch(buttonRow[1], /goPurchasePlan/)
  assert.doesNotMatch(buttonRow[1], /goQuickProcess/)
  assert.doesNotMatch(styles, /\.button-row \.pixel-btn\s*\{\s*flex:\s*1;\s*\}/)
  assert.match(styles, /\.secondary-action-row/)
  assert.match(styles, /\.secondary-action-row[\s\S]*gap:\s*24rpx/)
  assert.match(styles, /\.secondary-action-row[\s\S]*margin-top:\s*24rpx/)
  assert.match(styles, /\.secondary-action-row[\s\S]*margin-bottom:\s*26rpx/)
  assert.match(styles, /\.secondary-action-btn[\s\S]*height:\s*60rpx/)
  assert.match(styles, /\.secondary-action-btn[\s\S]*font-size:\s*28rpx/)
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
  assert.match(buttonRow[1], /assets\.food\.carrot/)
  assert.match(buttonRow[1], /assets\.actions\.camera/)
  assert.doesNotMatch(buttonRow[1], /assets\.actions\.addIcon/)
  assert.doesNotMatch(buttonRow[1], /class="btn-symbol"/)
  assert.match(styles, /\.home-page \.button-row[\s\S]*gap:\s*20rpx/)
  assert.match(styles, /\.main-action-btn[\s\S]*flex:\s*1 1 0/)
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
  assert.deepEqual(page.data.sections, [{ title: '可留给大人吃', items: [{ id: 'adult-1' }] }])
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
