const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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

test('reminder settings page defaults daily summary time to the current 8 AM option', async () => {
  global.wx = {}
  const page = createPageInstance(loadPage('pages/settings/reminder', {
    foodService: {
      getSettings: async () => ({
        reminderEnabled: true,
        remindBeforeDays: 1,
        todayReminderEnabled: true,
        dailySummaryEnabled: true
      })
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  await page.onLoad()

  delete global.wx
  assert.equal(page.data.dailyTime, '08:00')
  assert.equal(page.data.dailyTimeText, '早上 8 点')
  assert.equal(page.data.dailyTimeOptions[0].value, '08:00')
  assert.equal(page.data.dailyTimeOptions[0].selected, true)
})

test('reminder settings page saves a selected preset daily summary time', async () => {
  const updates = []
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadPage('pages/settings/reminder', {
    foodService: {
      getSettings: async () => ({
        reminderEnabled: true,
        remindBeforeDays: 1,
        todayReminderEnabled: true,
        dailySummaryEnabled: true,
        dailySummaryTime: '08:00'
      }),
      updateSettings: async (input) => {
        updates.push(input)
        return input
      }
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  await page.onLoad()
  page.selectDailyTimeOption({ currentTarget: { dataset: { value: '20:00' } } })
  await page.save()

  delete global.wx
  assert.equal(page.data.dailyTime, '20:00')
  assert.equal(page.data.dailyTimeText, '晚上 8 点')
  assert.equal(page.data.dailyTimeOptions.find((item) => item.value === '20:00').selected, true)
  assert.equal(updates[0].dailySummaryTime, '20:00')
  assert.deepEqual(toasts, [{ title: '已保存提醒', icon: 'success' }])
})

test('reminder settings page supports a non-empty custom daily summary time picker', async () => {
  global.wx = {}
  const page = createPageInstance(loadPage('pages/settings/reminder', {
    foodService: {
      getSettings: async () => ({
        reminderEnabled: true,
        remindBeforeDays: 1,
        todayReminderEnabled: true,
        dailySummaryEnabled: true,
        dailySummaryTime: '08:00'
      })
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  await page.onLoad()
  page.onDailyTimeChange({ detail: { value: '21:30' } })

  delete global.wx
  assert.equal(page.data.dailyTime, '21:30')
  assert.equal(page.data.dailyTimeText, '21:30')
})

test('reminder page displays the configured daily summary time', async () => {
  global.wx = {}
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {
      getReminders: async () => ({ today: [], soon: [], overdue: [] }),
      getSettings: async () => ({
        reminderEnabled: true,
        dailySummaryEnabled: true,
        dailySummaryTime: '20:00'
      })
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  await page.refreshReminders()

  delete global.wx
  assert.equal(page.data.dailyTimeText, '晚上 8 点')
})

test('reminder page exposes inline daily summary time controls', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/reminder/index.wxml'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../pages/reminder/index.json'), 'utf8'))

  assert.equal(config.navigationBarTitleText, '')
  assert.match(markup, /class="page-title">提醒中心/)
  assert.match(markup, /每日摘要/)
  assert.match(markup, /修改/)
  assert.match(markup, /bindtap="toggleDailyTimeEditor"/)
  assert.match(markup, /wx:for="\{\{dailyTimeOptions\}\}"/)
  assert.match(markup, /bindtap="selectDailyTimeOption"/)
  assert.match(markup, /mode="time"/)
  assert.match(markup, /value="\{\{dailyTime\}\}"/)
  assert.match(markup, /bindchange="onDailyTimeChange"/)
})

test('reminder page hides test reminder action from normal users by default', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/reminder/index.wxml'), 'utf8')
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {},
    subscribeService: {}
  }))

  assert.equal(page.data.showTestReminder, false)
  assert.match(markup, /wx:if="\{\{showTestReminder\}\}"[^>]*bindtap="sendTestReminder"[^>]*>试发提醒/)
})

test('reminder page keeps test reminder available outside release builds', () => {
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'trial' } })
  }
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {
      getReminders: async () => ({ today: [], soon: [], overdue: [] }),
      getSettings: async () => ({ reminderEnabled: true, dailySummaryEnabled: true })
    },
    subscribeService: {}
  }))

  page.onShow()

  delete global.wx
  assert.equal(page.data.showTestReminder, true)
})

test('reminder page saves inline daily summary time changes', async () => {
  const updates = []
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadPage('pages/reminder/index', {
    foodService: {
      getReminders: async () => ({ today: [], soon: [], overdue: [] }),
      getSettings: async () => ({
        reminderEnabled: true,
        dailySummaryEnabled: true,
        dailySummaryTime: '08:00'
      }),
      updateSettings: async (input) => {
        updates.push(input)
        return input
      }
    },
    subscribeService: {
      requestFoodExpireSubscribe: async () => ({ status: 'not_configured' })
    }
  }))

  await page.refreshReminders()
  page.toggleDailyTimeEditor()
  await page.selectDailyTimeOption({ currentTarget: { dataset: { value: '20:00' } } })

  delete global.wx
  assert.equal(page.data.dailyTimeEditorVisible, false)
  assert.equal(page.data.dailyTimeText, '晚上 8 点')
  assert.equal(updates[0].dailySummaryTime, '20:00')
  assert.deepEqual(toasts, [{ title: '已改为晚上 8 点', icon: 'success' }])
})

test('reminder settings markup offers preset times and a prefilled custom time picker', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/settings/reminder.wxml'), 'utf8')

  assert.match(markup, /wx:for="\{\{dailyTimeOptions\}\}"/)
  assert.match(markup, /bindtap="selectDailyTimeOption"/)
  assert.match(markup, /mode="time"/)
  assert.match(markup, /value="\{\{dailyTime\}\}"/)
  assert.match(markup, /bindchange="onDailyTimeChange"/)
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
  assert.deepEqual(toasts, [{ title: '提醒已发送', icon: 'success' }])
})

test('reminder page shows cloud function error when test reminder fails', async () => {
  const modals = []
  global.wx = {
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    showModal: (input) => modals.push(input),
    cloud: {
      callFunction: async () => ({ result: { ok: false, error: 'template_not_configured' } })
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
  assert.deepEqual(modals, [{
    title: '提醒发送失败',
    content: 'template_not_configured',
    showCancel: false
  }])
})

test('reminder page explains missing subscribe message API permission clearly', async () => {
  const modals = []
  global.wx = {
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    showModal: (input) => modals.push(input),
    cloud: {
      callFunction: async () => {
        throw new Error('cloud.callFunction:fail Error: errCode: -504002 functions execute fail | errMsg: Error: errCode: -604101 function has no permission to call this API')
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
  assert.deepEqual(modals, [{
    title: '提醒发送失败',
    content: '云函数缺少订阅消息发送权限。请重新上传 sendFoodReminder 云函数后再试。',
    showCancel: false
  }])
})
