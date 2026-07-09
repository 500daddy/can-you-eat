const test = require('node:test')
const assert = require('node:assert/strict')

const { createMemoryFoodRepository } = require('../utils/foodRepository')
const { createFoodService, LOGGED_OUT_KEY, markLoggedIn } = require('../utils/foodService')
const { foodBase } = require('../utils/foodBase')

test('uses local repository by default', async () => {
  const service = createFoodService({
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  })

  const added = await service.addFoodRecord({
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge'
  })
  const list = await service.getFoodRecords()

  assert.equal(added.status, 'baby_today')
  assert.equal(list.length, 1)
  assert.equal(list[0].id, added.id)
})

test('manages local purchase plans through the food service', async () => {
  const service = createFoodService({
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  })

  const plan = await service.addPurchasePlan({
    foodBaseId: 'broccoli',
    plannedDate: '2026-06-20',
    storageMethod: 'fridge'
  })
  const activePlans = await service.getPurchasePlans()
  const updated = await service.finishPurchasePlan({ planId: plan.id, action: 'purchased' })

  assert.equal(activePlans.length, 1)
  assert.equal(activePlans[0].name, '西兰花')
  assert.equal(updated.status, 'purchased')
  assert.deepEqual(await service.getPurchasePlans(), [])
})

test('keeps purchase plans local even when cloud food api is enabled', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      calls.push(data)
      return []
    }
  })

  await service.addPurchasePlan({
    foodName: '山药',
    plannedDate: '2026-06-18',
    storageMethod: 'room'
  })

  assert.equal(calls.some((item) => String(item.action).includes('PurchasePlan')), false)
  assert.equal((await service.getPurchasePlans())[0].name, '山药')
})

test('uses cloud foodApi when enabled', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      calls.push(data)
      if (data.action === 'getFoodRecords') {
        return [{ id: 'cloud-record', name: '云端西兰花' }]
      }
      return { ok: true }
    }
  })

  const list = await service.getFoodRecords()

  assert.equal(calls[0].action, 'getFoodRecords')
  assert.deepEqual(list, [{ id: 'cloud-record', name: '云端西兰花' }])
})

test('initializes cloud food base through foodApi when enabled', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      calls.push(data)
      return { inserted: 20, total: 20 }
    }
  })

  const result = await service.initFoodBase()

  assert.equal(calls[0].action, 'initFoodBase')
  assert.deepEqual(result, { inserted: 20, total: 20 })
})

test('initializing food base is a no-op for local repository', async () => {
  const service = createFoodService({
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  })

  const result = await service.initFoodBase()

  assert.deepEqual(result, { inserted: 0, total: foodBase.length, localOnly: true })
})

test('gets complete cloud food base through dedicated food base action', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      calls.push(data)
      if (data.action === 'getFoodBase') {
        return [{ id: 'broccoli' }, { id: 'yam' }]
      }
      if (data.action === 'searchFoods') {
        return [{ id: 'broccoli' }]
      }
      return []
    }
  })

  const result = await service.getFoodBase()

  assert.equal(calls[0].action, 'getFoodBase')
  assert.deepEqual(result.map((item) => item.id), ['broccoli', 'yam'])
})

test('falls back to local repository when cloud call fails', async () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  repo.addFoodRecord({
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })
  const service = createFoodService({
    useCloud: true,
    warnOnCloudFallback: false,
    repo,
    callCloud: async () => {
      throw new Error('cloud unavailable')
    }
  })

  const list = await service.getFoodRecords()

  assert.equal(list.length, 1)
  assert.equal(list[0].name, '胡萝卜')
  assert.equal(list[0].status, 'adult_only')
})

test('calculates stats from cloud records when cloud is enabled', async () => {
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      if (data.action === 'getFoodRecords') {
        return [
          { id: 'a', status: 'baby_today' },
          { id: 'b', status: 'adult_only' },
          { id: 'c', status: 'baby_ok' }
        ]
      }
      return []
    }
  })

  const stats = await service.getStats()

  assert.deepEqual(stats, [
    { label: '已记录食材', value: 3 },
    { label: '今日建议处理', value: 1 },
    { label: '即将过期', value: 1 },
    { label: '安心指数', value: '0%' }
  ])
})

test('computes baby age text from birthday in settings', async () => {
  const service = createFoodService({
    today: '2026-06-16',
    repo: createMemoryFoodRepository({
      today: '2026-06-16',
      seedRecords: [],
      settings: {
        babyBirthday: '2025-10-01',
        babyAgeText: '旧月龄'
      }
    })
  })

  const settings = await service.getSettings()

  assert.equal(settings.babyAgeText, '8个月15天')
})

test('computes baby age text from age months in settings', async () => {
  const service = createFoodService({
    today: '2026-06-16',
    repo: createMemoryFoodRepository({
      today: '2026-06-16',
      seedRecords: [],
      settings: {
        babyAgeMonths: 30,
        babyAgeText: '旧月龄',
        babyBirthday: '2025-10-01'
      }
    })
  })

  const settings = await service.getSettings()

  assert.equal(settings.babyAgeText, '2岁半')
  assert.equal(settings.babyStageText, '家庭餐过渡')
  assert.match(settings.babyStageDescription, /2岁以上/)
})

test('decorates settings with custom or generated baby avatar', async () => {
  const service = createFoodService({
    today: '2026-06-16',
    repo: createMemoryFoodRepository({
      today: '2026-06-16',
      seedRecords: [],
      settings: {
        babyAgeMonths: 18,
        babyGender: 'girl',
        babyAvatarUrl: ''
      }
    })
  })

  const generated = await service.getSettings()
  assert.match(generated.babyAvatarImage, /mascot_baby_happy/)

  await service.updateSettings({ babyAvatarUrl: '/tmp/custom.jpg', babyAgeMonths: 18 })
  const custom = await service.getSettings()
  assert.equal(custom.babyAvatarImage, '/tmp/custom.jpg')
})

test('recommends foods from the current baby age stage', async () => {
  const repo = createMemoryFoodRepository({
    today: '2026-06-16',
    seedRecords: [],
    settings: {
      babyAgeMonths: 6
    }
  })
  const service = createFoodService({
    today: '2026-06-16',
    repo
  })

  const sixMonthRecommendations = await service.getRecommendedFoods()
  repo.updateSettings({ babyAgeMonths: 12 })
  const twelveMonthRecommendations = await service.getRecommendedFoods()

  assert.equal(
    sixMonthRecommendations.slice(0, 5).every((item) => [
      'babyPuree',
      'porridge',
      'carrot',
      'pumpkin',
      'apple',
      'banana',
      'broccoli',
      'rice',
      'sweetPotato'
    ].includes(item.id)),
    true
  )
  assert.equal(
    twelveMonthRecommendations.slice(0, 5).every((item) => [
      'porridge',
      'carrot',
      'chicken',
      'tofu',
      'banana',
      'egg',
      'fish',
      'broccoli',
      'tomato',
      'rice'
    ].includes(item.id)),
    true
  )
})

test('personalizes recommendations by allergens and rotates them by day', async () => {
  const repo = createMemoryFoodRepository({
    today: '2026-06-16',
    seedRecords: [],
    settings: {
      babyAgeMonths: 12,
      babyAllergens: ['鸡蛋', '鱼']
    }
  })
  const service = createFoodService({
    today: '2026-06-16',
    repo
  })

  const firstDay = await service.getRecommendedFoods()
  const secondDayService = createFoodService({
    today: '2026-06-17',
    repo
  })
  const secondDay = await secondDayService.getRecommendedFoods()

  assert.equal(firstDay.some((item) => item.id === 'egg'), false)
  assert.equal(firstDay.some((item) => item.id === 'fish'), false)
  assert.notDeepEqual(
    firstDay.slice(0, 5).map((item) => item.id),
    secondDay.slice(0, 5).map((item) => item.id)
  )
})

test('recommendation summary prompts profile editing only before baby profile is saved', async () => {
  const repo = createMemoryFoodRepository({
    today: '2026-06-16',
    seedRecords: [],
    settings: {
      babyAgeMonths: 12
    }
  })
  const service = createFoodService({
    today: '2026-06-16',
    repo
  })

  const initialSummary = await service.getRecommendationSummary()
  await service.updateSettings({ babyAgeMonths: 12, babyProfileUpdatedAt: '2026-06-16' })
  const updatedSummary = await service.getRecommendationSummary()

  assert.equal(initialSummary.needsBabyProfilePrompt, true)
  assert.equal(updatedSummary.needsBabyProfilePrompt, false)
})

test('gets settings from cloud foodApi when enabled', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    today: '2026-06-16',
    repo: createMemoryFoodRepository({
      today: '2026-06-16',
      seedRecords: [],
      settings: {
        babyName: '本地宝宝',
        babyBirthday: '2026-01-01'
      }
    }),
    callCloud: async (data) => {
      calls.push(data)
      if (data.action === 'getUserSettings') {
        return {
          babyName: '云端宝宝',
          babyBirthday: '2025-10-01',
          babyAgeText: '旧月龄'
        }
      }
      return {}
    }
  })

  const settings = await service.getSettings()

  assert.equal(calls[0].action, 'getUserSettings')
  assert.equal(settings.babyName, '云端宝宝')
  assert.equal(settings.babyAgeText, '8个月15天')
})

test('logged out session stops cloud reads but still saves local food records', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    loggedOut: true,
    today: '2026-06-16',
    repo: createMemoryFoodRepository({
      today: '2026-06-16',
      seedRecords: [],
      settings: {
        babyName: '本地旧宝宝',
        babyAgeMonths: 30
      }
    }),
    callCloud: async (data) => {
      calls.push(data)
      return {
        babyName: '云端宝宝',
        babyAgeMonths: 11
      }
    }
  })

  const settings = await service.getSettings()
  const added = await service.addFoodRecord({
    foodBaseId: 'carrot',
    foodName: '胡萝卜',
    purchaseDate: '2026-06-16',
    storageMethod: 'fridge'
  })
  const records = await service.getFoodRecords()
  const stats = await service.getStats()

  assert.deepEqual(calls, [])
  assert.equal(settings.babyName, '未登录')
  assert.equal(settings.babyAgeText, '0个月')
  assert.equal(added.name, '胡萝卜')
  assert.equal(records.length, 1)
  assert.equal(records[0].name, '胡萝卜')
  assert.deepEqual(stats, [
    { label: '已记录食材', value: 1 },
    { label: '今日建议处理', value: 0 },
    { label: '即将过期', value: 0 },
    { label: '安心指数', value: '100%' }
  ])
})

test('markLoggedIn clears the logged out placeholder without forcing cloud back on', () => {
  const storage = {
    [LOGGED_OUT_KEY]: true
  }
  const app = {
    globalData: {
      loggedOut: true,
      useCloudFoodApi: false
    }
  }
  const originalGetApp = global.getApp
  const originalWx = global.wx
  try {
    global.getApp = () => app
    global.wx = {
      removeStorageSync: (key) => {
        delete storage[key]
      },
      getStorageSync: (key) => storage[key]
    }

    markLoggedIn()
  } finally {
    global.getApp = originalGetApp
    global.wx = originalWx
  }
  assert.equal(app.globalData.loggedOut, false)
  assert.equal(app.globalData.useCloudFoodApi, false)
  assert.equal(storage[LOGGED_OUT_KEY], undefined)
})

test('gets food base by id through cloud foodApi when enabled', async () => {
  const calls = []
  const service = createFoodService({
    useCloud: true,
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] }),
    callCloud: async (data) => {
      calls.push(data)
      return { id: data.foodBaseId, name: '云端西兰花', defaultStorage: 'fridge' }
    }
  })

  const food = await service.getFoodBaseById('broccoli')

  assert.equal(calls[0].action, 'getFoodBaseById')
  assert.equal(calls[0].foodBaseId, 'broccoli')
  assert.equal(food.name, '云端西兰花')
})

test('returns null for missing local food base id', async () => {
  const service = createFoodService({
    repo: createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  })

  const food = await service.getFoodBaseById('not-exists')

  assert.equal(food, null)
})

test('submits feedback to local repository by default', async () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const service = createFoodService({ repo })

  const feedback = await service.submitFeedback({
    type: 'idea',
    content: '希望增加常用食材快捷入口',
    contact: ''
  })

  assert.equal(feedback.status, 'pending')
  assert.equal(feedback.type, 'idea')
  assert.equal(repo.getFeedbackList().length, 1)
  assert.equal(repo.getFeedbackList()[0].content, '希望增加常用食材快捷入口')
})
