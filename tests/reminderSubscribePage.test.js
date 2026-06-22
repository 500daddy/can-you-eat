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

test('reminder settings page does not persist settings when subscribe request fails', async () => {
  await assertFailedSubscribeIsNotPersisted('pages/settings/reminder')
})
