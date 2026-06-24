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
      Object.keys(patch).forEach((key) => {
        if (!key.includes('.')) {
          this.data[key] = patch[key]
          return
        }
        const path = key.split('.')
        let target = this.data
        path.slice(0, -1).forEach((part) => {
          target[part] = { ...(target[part] || {}) }
          target = target[part]
        })
        target[path[path.length - 1]] = patch[key]
      })
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
    getFoodBaseById: async () => null,
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

test('add page enters custom food mode from a missing search keyword', async () => {
  const page = createPageInstance(loadAddPage(createFoodService(async () => {})))

  await page.onLoad({ name: encodeURIComponent('莲藕'), custom: '1' })

  assert.equal(page.data.isCustomFood, true)
  assert.equal(page.data.form.foodId, 'custom')
  assert.equal(page.data.form.name, '莲藕')
  assert.equal(page.data.form.quantity, '')
  assert.equal(page.data.form.unit, '')
  assert.match(page.data.selectedFoodHint, /自定义食材/)
  assert.match(page.data.form.remindText, /冷藏.*2 天/)

  page.chooseStorage({ currentTarget: { dataset: { key: 'freezer' } } })

  assert.equal(page.data.form.storageMethod, 'freezer')
  assert.match(page.data.form.remindText, /冷冻.*15 天/)
})
