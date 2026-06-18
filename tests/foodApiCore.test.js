const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFoodApi,
  createMemoryStore
} = require('../cloudfunctions/foodApi/core')

test('initializes food base once and searches by alias', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const init = await api.handle({ action: 'initFoodBase' })
  const initAgain = await api.handle({ action: 'initFoodBase' })
  const search = await api.handle({ action: 'searchFoods', keyword: '西红柿' })

  assert.equal(init.inserted, 20)
  assert.equal(initAgain.inserted, 0)
  assert.equal(search.data[0].id, 'tomato')
  assert.equal(search.data[0].name, '番茄')
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

test('adds custom cloud food records without falling back to broccoli', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodName: '山药',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(added.data.foodBaseId, 'custom')
  assert.equal(added.data.name, '山药')
  assert.equal(detail.data.record.name, '山药')
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
    content: '想补充山药',
    foodName: '山药'
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
