const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadMinePage({ foodService, accountService, recognitionService = {} }) {
  const foodServicePath = require.resolve('../utils/foodService')
  const accountServicePath = require.resolve('../utils/accountService')
  const recognitionServicePath = require.resolve('../utils/recognitionService')
  const pagePath = require.resolve('../pages/mine/index')
  delete require.cache[foodServicePath]
  delete require.cache[accountServicePath]
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
  require.cache[accountServicePath] = {
    id: accountServicePath,
    filename: accountServicePath,
    loaded: true,
    exports: {
      getAccountService: () => accountService
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
  delete require.cache[accountServicePath]
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

function createMineFoodService() {
  return {
    getAssets: () => ({ mascot: {} }),
    getSettings: async () => ({
      babyProfileConfigured: false,
      babyMode: false,
      dailySummaryTime: '08:00'
    }),
    getStats: async () => []
  }
}

test('mine page shows parent account and nests family sharing in the profile card', () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')

  assert.match(markup, /account\.profile\.avatarUrl/)
  assert.match(markup, /微信登录/)
  assert.match(markup, /账号设置/)
  assert.match(markup, /家庭共享/)
  assert.match(markup, /family-summary/)
  assert.match(markup, /加载失败，点击重试/)
  assert.doesNotMatch(markup, /settings\.babyAvatarImage/)
  assert.doesNotMatch(markup, /宝宝信息未设置/)
  assert.doesNotMatch(markup, /class="list-cell" bindtap="goFamily"/)
  assert.doesNotMatch(markup, /宝宝成长徽章/)
  assert.match(stylesheet, /\.account-card/)
  assert.match(stylesheet, /\.family-summary/)
})

test('mine page loads account, stats, and baby setting note together', async () => {
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({
        loggedIn: true,
        profile: { nickname: '小满妈妈', avatarUrl: '/a.jpg' },
        family: {
          family: { familyId: 'family-a', name: '小满家' },
          membership: { role: 'owner' },
          members: [{}, {}]
        },
        syncStatus: 'synced'
      })
    },
    foodService: {
      ...createMineFoodService(),
      getSettings: async () => ({
        babyProfileConfigured: true,
        babyMode: true,
        babyAgeText: '11个月',
        dailySummaryTime: '09:00'
      }),
      getStats: async () => [{ label: '已记录食材', value: 2 }]
    }
  }))

  await page.onShow()

  assert.equal(page.data.account.profile.nickname, '小满妈妈')
  assert.equal(page.data.account.familyName, '小满家')
  assert.equal(page.data.account.familyRoleText, '创建者')
  assert.equal(page.data.account.familyMemberCount, 2)
  assert.equal(page.data.babySettingNote, '11个月')
  assert.equal(page.data.reminderTime, '09:00')
  assert.equal(page.data.stats[0].action, 'overview')
})

test('mine page opens account settings for login and logged-in account editing', () => {
  const navigations = []
  const page = createPageInstance(loadMinePage({
    accountService: { refresh: async () => ({ loggedIn: false }) },
    foodService: createMineFoodService()
  }))
  global.wx = { navigateTo: (input) => navigations.push(input) }

  page.goAccount()
  page.setData({ account: { loggedIn: true } })
  page.goAccount()

  delete global.wx
  assert.deepEqual(navigations, [
    { url: '/pages/settings/account' },
    { url: '/pages/settings/account' }
  ])
})

test('mine page retries pending sync and refreshes the account card', async () => {
  let retried = 0
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({ loggedIn: true, syncStatus: 'pending', profile: {}, family: {} }),
      retryPendingSync: async () => {
        retried += 1
        return { loggedIn: true, syncStatus: 'synced', profile: {}, family: {} }
      }
    },
    foodService: createMineFoodService()
  }))
  global.wx = { showToast() {} }

  await page.onShow()
  await page.retrySync()

  delete global.wx
  assert.equal(retried, 1)
  assert.equal(page.data.account.syncStatus, 'synced')
  assert.equal(page.data.syncing, false)
})

test('mine page resumes pending work and shows issue-specific copy', async () => {
  let resumeCalls = 0
  const pending = {
    loggedIn: true,
    syncStatus: 'pending',
    syncIssue: { code: 'COLLECTION_MISSING' },
    profile: { nickname: '小满妈妈' },
    family: {}
  }
  const page = createPageInstance(loadMinePage({
    accountService: {
      getSession: () => pending,
      refresh: async () => pending,
      resumePendingSync: async () => {
        resumeCalls += 1
        return pending
      }
    },
    foodService: createMineFoodService()
  }))

  await page.onShow()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(resumeCalls, 1)
  assert.equal(page.data.account.syncText, '家庭信息暂不可用')
  assert.match(readText('pages/mine/index.wxml'), /\{\{account\.syncText\}\}/)
})

test('mine page ignores an older logged-out load after a new login is visible', async () => {
  let session = { loggedIn: false, syncStatus: 'idle' }
  let releaseFirstRefresh
  const firstRefresh = new Promise((resolve) => {
    releaseFirstRefresh = () => resolve({ loggedIn: false, syncStatus: 'idle' })
  })
  let refreshCalls = 0
  const page = createPageInstance(loadMinePage({
    accountService: {
      getSession: () => session,
      refresh: () => {
        refreshCalls += 1
        return refreshCalls === 1 ? firstRefresh : Promise.resolve(session)
      }
    },
    foodService: createMineFoodService()
  }))

  const oldLoad = page.onShow()
  session = {
    loggedIn: true,
    syncStatus: 'synced',
    profile: { nickname: '小满妈妈' },
    family: {}
  }
  await page.onShow()
  releaseFirstRefresh()
  await oldLoad

  assert.equal(page.data.account.loggedIn, true)
  assert.equal(page.data.account.profile.nickname, '小满妈妈')
})

test('mine page opens family sharing and preserves family load errors', async () => {
  const navigations = []
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({
        loggedIn: true,
        familyLoadError: true,
        profile: { nickname: '小满妈妈' }
      })
    },
    foodService: createMineFoodService()
  }))
  global.wx = { navigateTo: (input) => navigations.push(input) }

  await page.onShow()
  page.goFamily()

  delete global.wx
  assert.equal(page.data.account.familyLoadError, true)
  assert.equal(page.data.account.familyName, '')
  assert.deepEqual(navigations, [{ url: '/pages/family/index' }])
})

test('mine stats cards expose clear actions without making score a navigation', async () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')
  const switches = []
  const storageWrites = []
  const modals = []
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({ loggedIn: false, syncStatus: 'idle' })
    },
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

test('mine page does not expose photo recognition as a normal user entry', () => {
  const markup = readText('pages/mine/index.wxml')

  assert.doesNotMatch(markup, /识别记录/)
  assert.doesNotMatch(markup, /goRecognitionLog/)
  assert.doesNotMatch(markup, /recognitionCount/)
})

test('mine tab does not repeat the tab label in the navigation bar', () => {
  const config = JSON.parse(readText('pages/mine/index.json'))

  assert.equal(config.navigationBarTitleText, '')
})

test('mine page does not expose placeholder lab or question features for review', () => {
  const markup = readText('pages/mine/index.wxml')
  const stylesheet = readText('pages/mine/index.wxss')

  assert.doesNotMatch(markup, /AI功能实验室/)
  assert.doesNotMatch(markup, /体验中/)
  assert.doesNotMatch(markup, /即将上线/)
  assert.doesNotMatch(markup, /辅食安全问答/)
  assert.doesNotMatch(markup, /暂未开放/)
  assert.doesNotMatch(markup, /上线后/)
  assert.doesNotMatch(markup, /goAiLabItem/)
  assert.doesNotMatch(markup, /ai-lab-/)
  assert.doesNotMatch(stylesheet, /\.ai-lab/)
  assert.match(stylesheet, /\.list-cell[\s\S]*align-items:\s*center/)
  assert.match(stylesheet, /\.cell-note[\s\S]*display:\s*inline-flex/)
  assert.match(stylesheet, /\.cell-note[\s\S]*align-items:\s*center/)
})
