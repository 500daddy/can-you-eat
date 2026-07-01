const test = require('node:test')
const assert = require('node:assert/strict')

function loadPage(pagePath, { foodService, subscribeService }) {
  const foodServicePath = require.resolve('../utils/foodService')
  const subscribeServicePath = require.resolve('../utils/subscribeService')
  const absolutePagePath = require.resolve(`../${pagePath}`)
  delete require.cache[foodServicePath]
  delete require.cache[subscribeServicePath]
  delete require.cache[absolutePagePath]
  require.cache[foodServicePath] = {
    id: foodServicePath,
    filename: foodServicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }
  require.cache[subscribeServicePath] = {
    id: subscribeServicePath,
    filename: subscribeServicePath,
    loaded: true,
    exports: {
      getSubscribeService: () => subscribeService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require(`../${pagePath}`)
  delete global.Page
  delete require.cache[absolutePagePath]
  delete require.cache[subscribeServicePath]
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

async function assertFailedSubscribeIsNotPersisted(pagePath) {
  const toasts = []
  let updated = false
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadPage(pagePath, {
    foodService: {
      updateSettings: async () => {
        updated = true
      }
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({
        templateId: 'template-id',
        accepted: false,
        status: 'failed'
      })
    }
  }))

  await page.requestSubscribe()

  delete global.wx
  assert.equal(updated, false)
  assert.deepEqual(toasts, [{ title: '订阅请求失败', icon: 'none' }])
}

test('reminder page does not persist settings when subscribe request fails', async () => {
  await assertFailedSubscribeIsNotPersisted('pages/reminder/index')
})

test('reminder page opens the tab requested from mine stats', async () => {
  const removedKeys = []
  global.wx = {
    getStorageSync: (key) => (key === 'mine_target_reminder_tab' ? 1 : undefined),
    removeStorageSync: (key) => removedKeys.push(key)
  }
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {
      getReminders: async () => ({ today: [], soon: [], overdue: [] }),
      getSettings: async () => ({ reminderEnabled: true, dailySummaryEnabled: true })
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  page.onShow()

  delete global.wx
  assert.equal(page.data.active, 1)
  assert.deepEqual(removedKeys, ['mine_target_reminder_tab'])
})

test('reminder settings page does not persist settings when subscribe request fails', async () => {
  await assertFailedSubscribeIsNotPersisted('pages/settings/reminder')
})

test('reminder page sends a test subscribe message through cloud function', async () => {
  const toasts = []
  const calls = []
  global.wx = {
    showLoading: () => {},
    hideLoading: () => {},
    showToast: (input) => toasts.push(input),
    cloud: {
      callFunction: async (input) => {
        calls.push(input)
        return { result: { ok: true } }
      }
    }
  }
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {
      getReminders: async () => ({ today: [], soon: [], overdue: [] }),
      getSettings: async () => ({ reminderEnabled: true, dailySummaryEnabled: true })
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'accept', accepted: true })
    }
  }))

  await page.sendTestReminder()

  delete global.wx
  assert.deepEqual(calls, [{
    name: 'sendFoodReminder',
    data: { test: true }
  }])
  assert.deepEqual(toasts, [{ title: '测试提醒已发送', icon: 'success' }])
})
