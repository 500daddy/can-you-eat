const test = require('node:test')
const assert = require('node:assert/strict')

function loadAddPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const rulesPath = require.resolve('../utils/foodRules')
  const pagePath = require.resolve('../pages/food/add')
  delete require.cache[servicePath]
  delete require.cache[rulesPath]
  delete require.cache[pagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }
  require.cache[rulesPath] = {
    id: rulesPath,
    filename: rulesPath,
    loaded: true,
    exports: {
      todayString: () => '2026-06-22'
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require('../pages/food/add')
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[rulesPath]
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

function createFoodService(addFoodRecord) {
  return {
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        babyPuree: '/assets/sprites/food/food_baby_puree.png'
      }
    }),
    addFoodRecord
  }
}

test('add page ignores duplicate save while a request is pending', async () => {
  let calls = 0
  let resolveAdd
  const pendingAdd = new Promise((resolve) => {
    resolveAdd = resolve
  })
  const page = createPageInstance(loadAddPage(createFoodService(async () => {
    calls += 1
    return pendingAdd
  })))
  global.wx = {
    showToast: () => {},
    switchTab: () => {}
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  const firstSave = page.save()
  const secondSave = page.save()

  assert.equal(calls, 1)
  resolveAdd()
  await Promise.all([firstSave, secondSave])

  global.setTimeout = originalSetTimeout
  delete global.wx
})

test('add page shows a failure toast and resets saving state', async () => {
  const toasts = []
  const page = createPageInstance(loadAddPage(createFoodService(async () => {
    throw new Error('storage failed')
  })))
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.save()

  delete global.wx
  assert.equal(page.data.saving, false)
  assert.deepEqual(toasts, [{ title: '保存失败，请重试', icon: 'none' }])
})
