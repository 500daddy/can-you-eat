const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadAccountPage(accountService) {
  const servicePath = require.resolve('../utils/accountService')
  const pagePath = path.join(root, 'pages/settings/account.js')
  delete require.cache[servicePath]
  delete require.cache[pagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getAccountService: () => accountService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require(pagePath)
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

test('account settings uses WeChat avatar and nickname controls', () => {
  const markup = readText('pages/settings/account.wxml')
  const appConfig = JSON.parse(readText('app.json'))
  const assets = require('../utils/assets')

  assert.match(markup, /open-type="chooseAvatar"/)
  assert.match(markup, /bindchooseavatar="onChooseAvatar"/)
  assert.match(markup, /type="nickname"/)
  assert.match(markup, /登录并同步|保存账号信息/)
  assert.match(markup, /退出登录/)
  assert.match(markup, /家庭共享/)
  assert.ok(appConfig.pages.includes('pages/settings/account'))
  assert.match(assets.account.defaultAvatar, /nav_pixel_mine_active\.png$/)
})

test('account settings logs in only after a valid parent nickname', async () => {
  const calls = []
  const toasts = []
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: false, syncStatus: 'idle' }),
    login: async (input) => {
      calls.push(input)
      return {
        loggedIn: true,
        syncStatus: 'synced',
        profile: { nickname: input.nickname, avatarUrl: 'cloud://avatar.jpg' },
        family: { family: { name: '小满家' }, membership: { role: 'owner' }, members: [{}] }
      }
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    navigateBack() {}
  }
  page.setData({ nickname: '  小满妈妈  ', avatarUrl: '/tmp/avatar.jpg' })

  await page.saveAccount()

  page.setData({ nickname: '   ' })
  await page.saveAccount()
  delete global.wx
  assert.deepEqual(calls, [{ nickname: '小满妈妈', avatarUrl: '/tmp/avatar.jpg' }])
  assert.equal(page.data.loggedIn, true)
  assert.equal(page.data.avatarUrl, 'cloud://avatar.jpg')
  assert.equal(toasts.some((item) => item.title === '请输入家长昵称'), true)
})

test('account settings updates an existing profile and prevents duplicate saves', async () => {
  const calls = []
  let resolveUpdate
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({
      loggedIn: true,
      profile: { nickname: '旧昵称', avatarUrl: '/old.jpg' },
      syncStatus: 'synced'
    }),
    refresh: async () => ({
      loggedIn: true,
      profile: { nickname: '旧昵称', avatarUrl: '/old.jpg' },
      syncStatus: 'synced'
    }),
    updateProfile: (input) => {
      calls.push(input)
      return new Promise((resolve) => {
        resolveUpdate = () => resolve({
          loggedIn: true,
          profile: { nickname: input.nickname, avatarUrl: input.avatarUrl },
          syncStatus: 'synced'
        })
      })
    }
  }))
  global.wx = { showToast() {}, navigateBack() {} }
  await page.onLoad()
  page.setData({ nickname: '新昵称', avatarUrl: '/new.jpg' })

  const first = page.saveAccount()
  const second = page.saveAccount()
  resolveUpdate()
  await Promise.all([first, second])

  delete global.wx
  assert.deepEqual(calls, [{ nickname: '新昵称', avatarUrl: '/new.jpg' }])
})

test('account settings retries pending food sync', async () => {
  let retries = 0
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: true, profile: {}, syncStatus: 'pending' }),
    refresh: async () => ({ loggedIn: true, profile: {}, syncStatus: 'pending' }),
    retryPendingSync: async () => {
      retries += 1
      return { loggedIn: true, profile: {}, syncStatus: 'synced' }
    }
  }))
  global.wx = { showToast() {} }
  await page.onLoad()

  await page.retrySync()

  delete global.wx
  assert.equal(retries, 1)
  assert.equal(page.data.syncStatus, 'synced')
})

test('account settings logout explains device and cloud impact then returns to mine', async () => {
  const modals = []
  const switches = []
  let logoutCalls = 0
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: true, profile: {}, syncStatus: 'synced' }),
    logout: () => {
      logoutCalls += 1
    }
  }))
  global.wx = {
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    },
    showToast() {},
    switchTab: (input) => switches.push(input)
  }

  await page.logout()

  delete global.wx
  assert.match(modals[0].content, /这台设备将退出家庭食材库/)
  assert.match(modals[0].content, /云端记录不会删除/)
  assert.equal(logoutCalls, 1)
  assert.deepEqual(switches, [{ url: '/pages/mine/index' }])
})
