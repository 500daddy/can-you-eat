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
