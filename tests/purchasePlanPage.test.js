const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadPurchasePlanPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const rulesPath = require.resolve('../utils/foodRules')
  const pagePath = require.resolve('../pages/purchase-plan/index')
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
  require('../pages/purchase-plan/index')
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
        const parts = key.split('.')
        let target = this.data
        parts.slice(0, -1).forEach((part) => {
          target[part] = { ...(target[part] || {}) }
          target = target[part]
        })
        target[parts[parts.length - 1]] = patch[key]
      })
    },
    ...definition
  }
}

function createFoodService(overrides = {}) {
  const plans = overrides.plans || []
  return {
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        customFood: '/assets/sprites/food/food_jar.png'
      },
      actions: {}
    }),
    getFoodBase: async () => overrides.foodBase || [{
      id: 'broccoli',
      name: '西兰花',
      category: '蔬菜',
      subCategory: '花菜类',
      defaultStorage: 'fridge',
      icon: '/assets/sprites/food/food_broccoli.png'
    }],
    getPurchasePlans: async () => plans,
    addPurchasePlan: overrides.addPurchasePlan || (async (input) => ({ id: 'plan-new', ...input })),
    finishPurchasePlan: overrides.finishPurchasePlan || (async (input) => ({ id: input.planId, status: input.action })),
    ...overrides
  }
}

test('purchase plan page loads food base, plans, and defaults to today', async () => {
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    plans: [{
      id: 'plan-1',
      name: '西兰花',
      plannedDate: '2026-06-25',
      storageText: '冷藏保存'
    }]
  })))

  await page.onLoad()

  assert.equal(page.data.form.plannedDate, '2026-06-22')
  assert.equal(page.data.foodBase.length, 1)
  assert.equal(page.data.quickFoods.length, 1)
  assert.equal(page.data.plans.length, 1)
  assert.match(page.data.storageGuide, /输入食材名称后/)
})

test('purchase plan page validates food name before adding a plan', async () => {
  const toasts = []
  let added = false
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    addPurchasePlan: async () => {
      added = true
    }
  })))
  page.setData({ 'form.foodName': '' })

  await page.addPlan()

  delete global.wx
  assert.equal(added, false)
  assert.deepEqual(toasts, [{ title: '请填写计划购买的食材', icon: 'none' }])
})

test('purchase plan page adds selected known food plans', async () => {
  const added = []
  global.wx = {
    showToast: () => {}
  }
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    addPurchasePlan: async (input) => {
      added.push(input)
      return { id: 'plan-new', ...input }
    }
  })))
  await page.onLoad()
  page.selectFood({ currentTarget: { dataset: { id: 'broccoli' } } })

  await page.addPlan()

  delete global.wx
  assert.equal(added[0].foodBaseId, 'broccoli')
  assert.equal(added[0].foodName, '西兰花')
  assert.equal(added[0].plannedDate, '2026-06-22')
  assert.equal(added[0].storageMethod, 'fridge')
})

test('purchase plan page shows reference storage instead of editable storage options', async () => {
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    foodBase: [{
      id: 'shiitake',
      name: '香菇',
      category: '蔬菜',
      subCategory: '菌菇类',
      defaultStorage: 'fridge',
      icon: '/assets/sprites/food/food_mushroom.png',
      babyDays: '2-3天',
      adultDays: '3-5天'
    }]
  })))
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/purchase-plan/index.wxml'), 'utf8')

  await page.onLoad()
  page.onFoodNameInput({ detail: { value: '香菇' } })

  assert.equal(page.data.form.foodBaseId, 'shiitake')
  assert.equal(page.data.form.storageMethod, 'fridge')
  assert.match(page.data.storageGuide, /香菇/)
  assert.match(page.data.storageGuide, /参考冷藏保存/)
  assert.match(page.data.storageGuide, /宝宝建议期：2-3天/)
  assert.match(markup, /参考保存方式/)
  assert.doesNotMatch(markup, /计划保存方式/)
  assert.doesNotMatch(markup, /bindtap="chooseStorage"/)
  assert.doesNotMatch(markup, /class="segmented"/)
})

test('purchase plan page explains unknown foods before custom inventory save', async () => {
  const added = []
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    foodBase: [{
      id: 'broccoli',
      name: '西兰花',
      category: '蔬菜',
      subCategory: '花菜类',
      defaultStorage: 'fridge',
      icon: '/assets/sprites/food/food_broccoli.png'
    }],
    addPurchasePlan: async (input) => {
      added.push(input)
      return { id: 'plan-new', ...input }
    }
  })))
  global.wx = {
    showToast: () => {}
  }

  await page.onLoad()
  page.onFoodNameInput({ detail: { value: '雪莲果' } })
  assert.equal(page.data.form.foodBaseId, '')
  assert.match(page.data.storageGuide, /暂未收录/)
  assert.match(page.data.storageGuide, /转为库存时/)

  await page.addPlan()

  delete global.wx
  assert.equal(added[0].foodBaseId, '')
  assert.equal(added[0].foodName, '雪莲果')
})

test('purchase plan page converts plans into the add-food flow without completing before save', async () => {
  const navigations = []
  const finished = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    plans: [{
      id: 'plan-1',
      foodBaseId: 'broccoli',
      name: '西兰花',
      plannedDate: '2026-06-25',
      storageMethod: 'fridge'
    }],
    finishPurchasePlan: async (input) => {
      finished.push(input)
      return { id: input.planId, status: input.action }
    }
  })))
  await page.onLoad()

  await page.convertToFoodRecord({ currentTarget: { dataset: { id: 'plan-1' } } })

  delete global.wx
  assert.deepEqual(finished, [])
  assert.deepEqual(navigations, [{ url: '/pages/food/add?foodId=broccoli&fromPlan=plan-1' }])
})

test('purchase plan page deletes a pending plan after confirmation', async () => {
  const modals = []
  const toasts = []
  const finished = []
  let refreshed = false
  global.wx = {
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    },
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    plans: [{
      id: 'plan-1',
      foodBaseId: 'broccoli',
      name: '西兰花',
      plannedDate: '2026-06-25',
      storageMethod: 'fridge'
    }],
    finishPurchasePlan: async (input) => {
      finished.push(input)
      return { id: input.planId, status: input.action }
    }
  })))
  page.refresh = async () => {
    refreshed = true
  }
  await page.onLoad()

  await page.deletePlan({ currentTarget: { dataset: { id: 'plan-1', name: '西兰花' } } })

  delete global.wx
  assert.equal(modals.length, 1)
  assert.equal(modals[0].title, '删除采购计划')
  assert.match(modals[0].content, /西兰花/)
  assert.deepEqual(finished, [{ planId: 'plan-1', action: 'deleted' }])
  assert.deepEqual(toasts, [{ title: '已删除', icon: 'success' }])
  assert.equal(refreshed, true)
})

test('purchase plan page keeps a pending plan when deletion is cancelled', async () => {
  const finished = []
  global.wx = {
    showModal: (input) => input.success({ confirm: false }),
    showToast: () => {}
  }
  const page = createPageInstance(loadPurchasePlanPage(createFoodService({
    plans: [{
      id: 'plan-1',
      foodBaseId: 'broccoli',
      name: '西兰花',
      plannedDate: '2026-06-25',
      storageMethod: 'fridge'
    }],
    finishPurchasePlan: async (input) => {
      finished.push(input)
      return { id: input.planId, status: input.action }
    }
  })))
  await page.onLoad()

  await page.deletePlan({ currentTarget: { dataset: { id: 'plan-1', name: '西兰花' } } })

  delete global.wx
  assert.deepEqual(finished, [])
})

test('purchase plan list exposes visible delete controls', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/purchase-plan/index.wxml'), 'utf8')

  assert.match(markup, /bindtap="deletePlan"/)
  assert.match(markup, /删除/)
})

test('purchase plan page renders planning copy instead of inventory expiry copy', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/purchase-plan/index.wxml'), 'utf8')

  assert.match(markup, /计划采购/)
  assert.match(markup, /买到后再转为库存/)
  assert.match(markup, /不计算过期/)
  assert.match(markup, /预计购买日/)
})
