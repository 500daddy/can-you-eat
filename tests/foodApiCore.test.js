const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFoodApi,
  createMemoryStore,
  seedFoodBase
} = require('../cloudfunctions/foodApi/core')

test('initializes food base once and searches by alias', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const init = await api.handle({ action: 'initFoodBase' })
  const initAgain = await api.handle({ action: 'initFoodBase' })
  const search = await api.handle({ action: 'searchFoods', keyword: '西红柿' })
  const mushroom = await api.handle({ action: 'searchFoods', keyword: '菌菇' })

  assert.equal(init.inserted, seedFoodBase.length)
  assert.equal(initAgain.inserted, 0)
  assert.equal(search.data[0].id, 'tomato')
  assert.equal(search.data[0].name, '番茄')
  assert.equal(mushroom.data[0].id, 'mushroom')
})

test('cloud seed food base mirrors the expanded daily food coverage', () => {
  const ids = seedFoodBase.map((item) => item.id)
  const requiredIds = ['bokChoy', 'shiitake', 'yam', 'pork', 'salmon', 'yogurt', 'oat', 'pear']

  assert.ok(seedFoodBase.length >= 100)
  assert.equal(new Set(ids).size, ids.length)

  for (const id of requiredIds) {
    assert.ok(ids.includes(id), `${id} should exist in cloud seed food base`)
  }
})

test('gets complete cloud food base even when stored collection is partially seeded', async () => {
  const store = createMemoryStore()
  await store.add('food_base', {
    id: 'broccoli',
    name: '西兰花',
    category: '蔬菜',
    subCategory: '花菜类'
  })
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })

  const result = await api.handle({ action: 'getFoodBase' })
  const ids = result.data.map((item) => item.id)

  assert.ok(result.data.length >= 100)
  assert.ok(ids.includes('yam'))
  assert.ok(ids.includes('shiitake'))
  assert.ok(ids.includes('salmon'))
})

test('initFoodBase refreshes category metadata for existing foods', async () => {
  const store = createMemoryStore()
  await store.add('food_base', {
    id: 'carrot',
    name: '胡萝卜',
    category: '根茎',
    subCategory: '旧分类'
  })
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })

  const init = await api.handle({ action: 'initFoodBase' })
  const carrot = await api.handle({ action: 'getFoodBaseById', foodBaseId: 'carrot' })

  assert.equal(init.updated, 1)
  assert.equal(carrot.data.category, '蔬菜')
  assert.equal(carrot.data.subCategory, '根茎类')
})

test('adds and lists calculated user food records', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '颗',
    note: '今晚做熟'
  })
  const list = await api.handle({ action: 'getFoodRecords' })
  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(added.data.status, 'baby_today')
  assert.equal(list.data[0].id, added.data.id)
  assert.equal(detail.data.record.note, '今晚做熟')
  assert.equal(detail.data.base.name, '西兰花')
})

test('gets cloud food base by id', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })

  const result = await api.handle({ action: 'getFoodBaseById', foodBaseId: 'broccoli' })

  assert.equal(result.ok, true)
  assert.equal(result.data.id, 'broccoli')
  assert.equal(result.data.name, '西兰花')
})

test('adds custom cloud food records without falling back to broccoli', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodName: '雪莲果',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(added.data.foodBaseId, 'custom')
  assert.equal(added.data.name, '雪莲果')
  assert.equal(added.data.icon, '/assets/sprites/food/food_jar.png')
  assert.equal(detail.data.record.name, '雪莲果')
  assert.equal(detail.data.base, null)
})

test('returns empty cloud detail when a record is not found', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: 'missing-record' })

  assert.equal(detail.data.record, null)
  assert.equal(detail.data.base, null)
})

test('keeps user records isolated and handles finish action', async () => {
  const store = createMemoryStore()
  const userA = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  const userB = createFoodApi({ store, userId: 'user-b', today: '2026-06-12' })
  await userA.handle({ action: 'initFoodBase' })
  const added = await userA.handle({
    action: 'addFoodRecord',
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  assert.equal((await userB.handle({ action: 'getFoodRecords' })).data.length, 0)

  await userA.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'finished' })

  assert.equal((await userA.handle({ action: 'getFoodRecords' })).data.length, 0)
  assert.equal((await userA.handle({ action: 'getFoodDetail', recordId: added.data.id })).data.record.status, 'finished')
})

test('preserves manual cloud adult_only status', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })

  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(detail.data.record.status, 'adult_only')
  assert.equal(detail.data.record.group, '可留给大人吃')
})

test('expires manual cloud adult_only status after adult reference period', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-01',
    storageMethod: 'fridge'
  })

  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(detail.data.record.status, 'expired')
  assert.equal(detail.data.record.group, '不建议继续食用')
})

test('clears manual cloud status when a record is edited', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const updated = await api.handle({
    action: 'updateFoodRecord',
    recordId: added.data.id,
    note: '重新检查'
  })

  assert.equal(updated.data.status, 'baby_ok')
  assert.equal(updated.data.note, '重新检查')
})

test('updates settings and submits feedback', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const settings = await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒',
    reminderEnabled: false
  })
  const feedback = await api.handle({
    action: 'submitFeedback',
    type: 'food_not_found',
    content: '想补充雪莲果',
    foodName: '雪莲果'
  })

  assert.equal(settings.data.babyName, '小米粒')
  assert.equal(settings.data.reminderEnabled, false)
  assert.equal(feedback.data.status, 'pending')
  assert.equal(feedback.data.userId, 'user-a')
})

test('computes baby age text when updating cloud settings', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-16' })

  const settings = await api.handle({
    action: 'updateUserSettings',
    babyBirthday: '2025-10-01'
  })

  assert.equal(settings.data.babyAgeText, '8个月15天')
})

test('gets cloud user settings with computed baby age text', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-16' })
  await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒',
    babyBirthday: '2025-10-01'
  })

  const settings = await api.handle({ action: 'getUserSettings' })

  assert.equal(settings.data.babyName, '小米粒')
  assert.equal(settings.data.babyAgeText, '8个月15天')
})

test('logs recognition selections by user', async () => {
  const store = createMemoryStore()
  const userA = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  const userB = createFoodApi({ store, userId: 'user-b', today: '2026-06-12' })

  const log = await userA.handle({
    action: 'logRecognition',
    imageUrl: 'cloud://image',
    selectedFoodName: '胡萝卜',
    selectedFoodBaseId: 'carrot',
    confidence: 0.92
  })

  assert.equal(log.data.userId, 'user-a')
  assert.equal((await userA.handle({ action: 'getRecognitionLogs' })).data.length, 1)
  assert.equal((await userB.handle({ action: 'getRecognitionLogs' })).data.length, 0)
})

test('cloud api update payloads do not persist undefined fields', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge'
  })

  await api.handle({
    action: 'updateFoodRecord',
    recordId: added.data.id,
    note: '只改备注'
  })
  await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒'
  })

  const rawRecord = (await store.list('user_food_records'))[0]
  const rawSettings = (await store.list('user_settings'))[0]

  assert.equal(Object.prototype.hasOwnProperty.call(rawRecord, 'status'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(rawSettings, 'action'), false)
})
