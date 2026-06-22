const test = require('node:test')
const assert = require('node:assert/strict')

function loadEditPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/food/edit')
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
  require('../pages/food/edit')
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

test('edit page loads an existing record into the form', async () => {
  const page = createPageInstance(loadEditPage({
    getAssets: () => ({}),
    getFoodDetail: async () => ({
      record: {
        id: 'record-carrot',
        name: '胡萝卜',
        quantity: '',
        unit: '',
        isBabyFood: true
      }
    })
  }))

  await page.onLoad({ id: 'record-carrot' })

  assert.equal(page.data.form.id, 'record-carrot')
  assert.equal(page.data.form.quantity, '1')
  assert.equal(page.data.form.unit, '份')
})

test('edit page shows a message and goes back when record is missing', async () => {
  const toasts = []
  let navigatedBack = false
  global.wx = {
    showToast: (input) => toasts.push(input),
    navigateBack: () => {
      navigatedBack = true
    }
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()
  const page = createPageInstance(loadEditPage({
    getAssets: () => ({}),
    getFoodDetail: async () => ({ record: null })
  }))

  await page.onLoad({ id: 'missing-record' })

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.deepEqual(toasts, [{ title: '记录不存在', icon: 'none' }])
  assert.equal(navigatedBack, true)
  assert.deepEqual(page.data.form, {})
})

test('edit page ignores duplicate save while a request is pending', async () => {
  let calls = 0
  let resolveUpdate
  const pendingUpdate = new Promise((resolve) => {
    resolveUpdate = resolve
  })
  const page = createPageInstance(loadEditPage({
    getAssets: () => ({}),
    updateFoodRecord: async () => {
      calls += 1
      return pendingUpdate
    }
  }))
  page.setData({
    form: {
      id: 'record-carrot',
      purchaseDate: '2026-06-22',
      storageMethod: 'fridge',
      quantity: '1',
      unit: '份',
      isBabyFood: true,
      note: ''
    }
  })
  global.wx = {
    showToast: () => {},
    navigateBack: () => {}
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  const firstSave = page.save()
  const secondSave = page.save()

  assert.equal(calls, 1)
  resolveUpdate()
  await Promise.all([firstSave, secondSave])

  global.setTimeout = originalSetTimeout
  delete global.wx
})

test('edit page shows a failure toast and resets saving state', async () => {
  const toasts = []
  const page = createPageInstance(loadEditPage({
    getAssets: () => ({}),
    updateFoodRecord: async () => {
      throw new Error('storage failed')
    }
  }))
  page.setData({
    form: {
      id: 'record-carrot',
      purchaseDate: '2026-06-22',
      storageMethod: 'fridge',
      quantity: '1',
      unit: '份',
      isBabyFood: true,
      note: ''
    }
  })
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.save()

  delete global.wx
  assert.equal(page.data.saving, false)
  assert.deepEqual(toasts, [{ title: '保存失败，请重试', icon: 'none' }])
})
