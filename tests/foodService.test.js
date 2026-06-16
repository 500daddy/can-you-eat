const test = require('node:test')
const assert = require('node:assert/strict')

const { createMemoryFoodRepository } = require('../utils/foodRepository')
const { createFoodService } = require('../utils/foodService')

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

  assert.deepEqual(result, { inserted: 0, total: 20, localOnly: true })
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
