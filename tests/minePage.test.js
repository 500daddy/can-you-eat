const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadMinePage({ foodService, recognitionService }) {
  const foodServicePath = require.resolve('../utils/foodService')
  const recognitionServicePath = require.resolve('../utils/recognitionService')
  const pagePath = require.resolve('../pages/mine/index')
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
  require('../pages/mine/index')
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

test('mine profile card exposes baby info editing from the visible baby summary', () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')

  assert.match(markup, /class="profile-card"[^>]+bindtap="goBaby"/)
  assert.match(markup, /settings\.babyAvatarImage/)
  assert.match(markup, /class="profile-avatar"[^>]+mode="aspectFill"/)
  assert.match(markup, /settings\.babyStageText/)
  assert.match(markup, /settings\.babyStageDescription/)
  assert.match(markup, /profile-stage-desc/)
  assert.doesNotMatch(markup, /Lv\.3/)
  assert.match(markup, /class="profile-edit"/)
  assert.match(markup, /编辑/)
  assert.doesNotMatch(markup, /宝宝成长徽章/)
  assert.doesNotMatch(markup, /achievement-card/)
  assert.doesNotMatch(markup, /achievements/)
  assert.match(stylesheet, /\.profile-edit/)
  assert.match(stylesheet, /\.profile-stage-desc/)
  assert.doesNotMatch(stylesheet, /\.achievement-card/)
})

test('mine stats cards expose clear actions without making score a navigation', async () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')
  const switches = []
  const storageWrites = []
  const modals = []
  const page = createPageInstance(loadMinePage({
    foodService: {
      getAssets: () => ({ mascot: {} }),
      getSettings: async () => ({}),
      getStats: async () => [
        { label: '已记录食材', value: 2 },
        { label: '今日建议处理', value: 1 },
        { label: '即将过期', value: 0 },
        { label: '安心指数', value: '100%' }
      ]
    },
    recognitionService: {
      getRecognitionCount: async () => 0
    }
  }))

  global.wx = {
    switchTab: (input) => switches.push(input),
    setStorageSync: (key, value) => storageWrites.push({ key, value }),
    showModal: (input) => modals.push(input)
  }

  await page.onShow()
  page.handleStatTap({ currentTarget: { dataset: { action: 'overview' } } })
  page.handleStatTap({ currentTarget: { dataset: { action: 'reminder', tab: 1 } } })
  page.handleStatTap({ currentTarget: { dataset: { action: 'score' } } })

  delete global.wx
  assert.match(markup, /bindtap="handleStatTap"/)
  assert.match(markup, /data-action="\{\{item\.action\}\}"/)
  assert.match(markup, /stat-arrow/)
  assert.match(markup, /stat-info/)
  assert.match(stylesheet, /\.stat-card\.tappable/)
  assert.match(stylesheet, /\.stat-arrow/)
  assert.match(stylesheet, /\.stat-info/)
  assert.equal(page.data.stats[0].action, 'overview')
  assert.equal(page.data.stats[1].tab, 0)
  assert.equal(page.data.stats[2].tab, 1)
  assert.equal(page.data.stats[3].action, 'score')
  assert.deepEqual(switches, [
    { url: '/pages/index/index' },
    { url: '/pages/reminder/index' }
  ])
  assert.deepEqual(storageWrites, [{ key: 'mine_target_reminder_tab', value: 1 }])
  assert.match(modals[0].content, /安心指数/)
})
