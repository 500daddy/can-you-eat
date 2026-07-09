const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createMemoryFoodRepository } = require('../utils/foodRepository')
const { createFoodService: createRealFoodService } = require('../utils/foodService')

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
        babyPuree: '/assets/sprites/food/food_baby_puree.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => null,
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord,
    finishPurchasePlan: async () => {}
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

test('add page limits start saving date to today and blocks future dates', async () => {
  const toasts = []
  let saved = false
  const page = createPageInstance(loadAddPage(createFoodService(async () => {
    saved = true
  })))
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  page.setData({ 'form.purchaseDate': '2026-06-23' })

  await page.save()

  delete global.wx
  assert.equal(page.data.maxSaveDate, '2026-06-22')
  assert.equal(saved, false)
  assert.deepEqual(toasts, [{ title: '开始保存日期不能晚于今天', icon: 'none' }])
})

test('add page enters custom food mode from a missing search keyword', async () => {
  const page = createPageInstance(loadAddPage(createFoodService(async () => {})))

  await page.onLoad({ name: encodeURIComponent('莲藕'), custom: '1' })

  assert.equal(page.data.isCustomFood, true)
  assert.equal(page.data.form.foodId, 'custom')
  assert.equal(page.data.form.name, '莲藕')
  assert.equal(page.data.form.icon, '')
  assert.match(page.data.selectedFoodHint, /自定义食材/)
  assert.match(page.data.form.remindText, /冷藏.*2 天/)

  page.chooseStorage({ currentTarget: { dataset: { key: 'freezer' } } })

  assert.equal(page.data.form.storageMethod, 'freezer')
  assert.match(page.data.form.remindText, /冷冻.*15 天/)
})

test('add page locks selected food name and asks users to reselect if wrong', async () => {
  const saved = []
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        fish: '/assets/sprites/food/food_fish.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'fish',
      name: '鳕鱼',
      aliases: ['鱼肉'],
      category: '肉禽水产',
      subCategory: '水产类',
      icon: '/assets/sprites/food/food_fish.png',
      defaultStorage: 'freezer'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async (input) => {
      saved.push(input)
    }
  }))
  global.wx = {
    showToast: () => {},
    switchTab: () => {}
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  await page.onLoad({ foodId: 'fish' })
  page.onNameInput({ detail: { value: '三文鱼' } })
  await page.save()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.equal(page.data.form.name, '鳕鱼')
  assert.equal(saved[0].foodBaseId, 'fish')
  assert.equal(saved[0].foodName, '鳕鱼')
})

test('add page uses neutral copy for selected known foods', async () => {
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        banana: '/assets/sprites/food/food_banana.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'banana',
      name: '香蕉',
      category: '水果',
      subCategory: '热带水果',
      icon: '/assets/sprites/food/food_banana.png',
      defaultStorage: 'room'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async () => {}
  }))
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')

  await page.onLoad({ foodId: 'banana' })

  assert.equal(page.data.selectedFoodHint, '已根据所选食材带入推荐信息')
  assert.doesNotMatch(page.data.selectedFoodHint, /选错|重新选择/)
  assert.doesNotMatch(markup, /选错|重新选择/)
})

test('add page shows only verified selected food icons', async () => {
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        apple: '/assets/sprites/food/food_apple.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'apple',
      name: '苹果',
      category: '水果',
      subCategory: '仁果类',
      icon: '/assets/sprites/food/food_apple.png',
      defaultStorage: 'fridge'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async () => {}
  }))
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')
  const styles = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxss'), 'utf8')

  await page.onLoad({ foodId: 'apple' })

  assert.equal(page.data.selectedFood.showFoodIcon, true)
  assert.equal(page.data.selectedFood.displayFoodIcon, '/assets/sprites/food/food_apple.png')
  assert.match(markup, /selectedFood\.showFoodIcon/)
  assert.match(markup, /selectedFood\.displayFoodIcon/)
  assert.doesNotMatch(markup, /src="\{\{form\.icon\}\}"/)
  assert.match(styles, /\.selected-food-icon/)
})

test('add page hides unverified selected food icons', async () => {
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        apple: '/assets/sprites/food/food_apple.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'unknownFood',
      name: '未知食材',
      category: '自定义',
      subCategory: '',
      icon: '/assets/sprites/food/food_apple.png',
      defaultStorage: 'fridge'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async () => {}
  }))

  await page.onLoad({ foodId: 'unknownFood' })

  assert.equal(page.data.selectedFood.showFoodIcon, false)
  assert.equal(page.data.selectedFood.displayFoodIcon, '')
})

test('add page completes the source purchase plan only after inventory save succeeds', async () => {
  const finished = []
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'broccoli',
      name: '西兰花',
      category: '蔬菜',
      subCategory: '花菜类',
      icon: '/assets/sprites/food/food_broccoli.png',
      defaultStorage: 'fridge'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async () => ({ id: 'record-1' }),
    finishPurchasePlan: async (input) => {
      finished.push(input)
    }
  }))
  global.wx = {
    showToast: () => {},
    switchTab: () => {}
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  await page.onLoad({ foodId: 'broccoli', fromPlan: 'plan-1' })
  await page.save()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.deepEqual(finished, [{ planId: 'plan-1', action: 'purchased' }])
})

test('add page makes recommended storage obvious without asking for quantity or unit', async () => {
  const saved = []
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        fish: '/assets/sprites/food/food_fish.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'fish',
      name: '鳕鱼',
      category: '肉禽水产',
      subCategory: '水产类',
      icon: '/assets/sprites/food/food_fish.png',
      defaultStorage: 'freezer'
    }),
    getSettings: async () => ({ babyAllergens: [] }),
    addFoodRecord: async (input) => {
      saved.push(input)
    }
  }))
  global.wx = {
    showToast: () => {},
    switchTab: () => {}
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  await page.onLoad({ foodId: 'fish' })

  assert.equal(page.data.recommendedStorageMethod, 'freezer')
  assert.match(page.data.storageRecommendationText, /小管家建议.*冷冻/)
  assert.equal(page.data.form.storageMethod, 'freezer')
  assert.equal('quantity' in page.data.form, false)
  assert.equal('unit' in page.data.form, false)

  page.chooseStorage({ currentTarget: { dataset: { key: 'fridge' } } })

  assert.equal(page.data.form.storageMethod, 'fridge')
  assert.match(page.data.storageRecommendationText, /已按实际保存方式改为冷藏/)

  await page.save()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.equal('quantity' in saved[0], false)
  assert.equal('unit' in saved[0], false)
})

test('add page does not render a change food shortcut', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')

  assert.doesNotMatch(markup, /change-btn/)
  assert.doesNotMatch(markup, /更换/)
  assert.doesNotMatch(markup, /goSearch/)
})

test('add page shows stronger custom food safety copy', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')

  assert.match(markup, /安全提醒/)
  assert.match(markup, /保守时间提醒/)
  assert.match(markup, /看外观/)
  assert.match(markup, /闻气味/)
  assert.match(markup, /摸质地/)
})

test('add page uses start saving date wording and a past-only custom date selector', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')

  assert.match(markup, /开始保存日期/)
  assert.match(markup, /按购买、开封或分装当天填写/)
  assert.match(markup, /picker-view/)
  assert.match(markup, /availableSaveDates/)
  assert.doesNotMatch(markup, /mode="date"/)
  assert.doesNotMatch(markup, /购买日期 <text class="required"/)
  assert.doesNotMatch(markup, /只显示今天及以前的日期/)
  assert.doesNotMatch(markup, /不会出现未来时间/)
})

test('add page date options never include dates after today', async () => {
  const page = createPageInstance(loadAddPage(createFoodService(async () => {})))

  assert.equal(page.data.maxSaveDate, '2026-06-22')
  assert.equal(page.data.availableSaveDates[0].value, '2026-06-22')
  assert.equal(page.data.availableSaveDates[0].label, '今天 2026-06-22')
  assert.ok(page.data.availableSaveDates.every((item) => item.value <= page.data.maxSaveDate))
  assert.equal(page.data.availableSaveDates.some((item) => item.value === '2026-06-23'), false)

  page.openDatePicker()
  assert.equal(page.data.showDateSheet, true)
  page.onDatePickerChange({ detail: { value: [1] } })
  page.confirmSaveDate()

  assert.equal(page.data.form.purchaseDate, '2026-06-21')
  assert.equal(page.data.showDateSheet, false)
})

test('add page marks selected food name as not editable in markup', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')

  assert.match(markup, /已选食材/)
  assert.match(markup, /wx:if="\{\{isCustomFood\}\}"[\s\S]*bindinput="onNameInput"/)
  assert.match(markup, /wx:else[\s\S]*class="readonly-food-name"/)
  assert.match(markup, /推荐/)
  assert.doesNotMatch(markup, /数量/)
  assert.doesNotMatch(markup, /单位/)
  assert.doesNotMatch(markup, /onQuantityInput/)
  assert.doesNotMatch(markup, /onUnitInput/)
})

test('add page keeps the save action visible in a bottom dock', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxml'), 'utf8')
  const styles = fs.readFileSync(path.resolve(__dirname, '../pages/food/add.wxss'), 'utf8')

  assert.match(markup, /class="save-dock"/)
  assert.match(markup, /确认日期和保存方式后保存/)
  assert.match(markup, /bindtap="save"/)
  assert.match(styles, /\.save-dock\s*\{[\s\S]*position:\s*fixed/)
  assert.match(styles, /\.page\s*\{[\s\S]*padding-bottom:\s*calc\(176rpx \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(styles, /\.save-btn\s*\{[\s\S]*box-shadow:/)
})

test('add page warns before saving a food that matches baby allergens', async () => {
  const added = []
  const modals = []
  const page = createPageInstance(loadAddPage({
    getAssets: () => ({
      food: {
        broccoli: '/assets/sprites/food/food_broccoli.png',
        egg: '/assets/sprites/food/food_egg.png',
        customFood: '/assets/sprites/food/food_jar.png'
      }
    }),
    getFoodBaseById: async () => ({
      id: 'egg',
      name: '鸡蛋',
      aliases: '蛋',
      category: '蛋奶豆制品',
      subCategory: '蛋类',
      icon: '/assets/sprites/food/food_egg.png',
      defaultStorage: 'fridge'
    }),
    getSettings: async () => ({ babyAllergens: ['鸡蛋'] }),
    addFoodRecord: async (input) => {
      added.push(input)
    }
  }))
  global.wx = {
    showToast: () => {},
    switchTab: () => {},
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    }
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  await page.onLoad({ foodId: 'egg' })
  await page.save()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.equal(modals.length, 1)
  assert.match(modals[0].content, /鸡蛋/)
  assert.equal(added.length, 1)
  assert.equal(added[0].foodBaseId, 'egg')
  assert.equal(added[0].status, 'not_recommended')
  assert.match(added[0].riskNote, /宝宝过敏源.*鸡蛋/)
})

test('add page can save local food after logout stops cloud sync', async () => {
  const toasts = []
  const switches = []
  const repo = createMemoryFoodRepository({
    today: '2026-06-22',
    seedRecords: [],
    settings: {
      babyName: '未登录',
      babyAgeMonths: 0,
      babyAllergens: []
    }
  })
  const service = createRealFoodService({
    useCloud: true,
    loggedOut: true,
    today: '2026-06-22',
    repo,
    callCloud: async () => {
      throw new Error('should not call cloud after logout')
    }
  })
  const page = createPageInstance(loadAddPage(service))
  global.wx = {
    showToast: (input) => toasts.push(input),
    switchTab: (input) => switches.push(input)
  }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (fn) => fn()

  await page.onLoad({ foodId: 'carrot' })
  await page.save()

  global.setTimeout = originalSetTimeout
  delete global.wx
  assert.equal(repo.getFoodRecords().length, 1)
  assert.equal(repo.getFoodRecords()[0].name, '胡萝卜')
  assert.deepEqual(toasts, [{ title: '已添加，可开启提醒', icon: 'success' }])
  assert.deepEqual(switches, [{ url: '/pages/index/index' }])
})
