const test = require('node:test')
const assert = require('node:assert/strict')

const { foodBase } = require('../utils/foodBase')
const { createMemoryFoodRepository } = require('../utils/foodRepository')

test('searches food by alias and returns normalized food metadata', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12' })
  const results = repo.searchFoods('西红柿')

  assert.equal(results[0].id, 'tomato')
  assert.equal(results[0].name, '番茄')
  assert.equal(results[0].defaultStorage, 'fridge')
})

test('food base uses broad categories with second-level categories', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12' })
  const carrot = repo.getFoodBaseById('carrot')
  const chicken = repo.getFoodBaseById('chicken')
  const mushroom = repo.getFoodBaseById('mushroom')

  assert.equal(carrot.category, '蔬菜')
  assert.equal(carrot.subCategory, '根茎类')
  assert.equal(chicken.category, '肉禽水产')
  assert.equal(chicken.subCategory, '禽肉类')
  assert.equal(mushroom.category, '蔬菜')
  assert.equal(mushroom.subCategory, '菌菇类')
})

test('food base covers daily family ingredients with authority-aligned categories', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12' })
  const requiredIds = [
    'bokChoy',
    'lettuce',
    'shiitake',
    'enoki',
    'yam',
    'pork',
    'salmon',
    'yogurt',
    'oat',
    'millet',
    'pear',
    'watermelon'
  ]

  for (const id of requiredIds) {
    assert.ok(repo.getFoodBaseById(id), `${id} should exist in food base`)
  }

  const ids = foodBase.map((item) => item.id)
  const uniqueIds = new Set(ids)
  const allowedCategories = new Set(['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食'])

  assert.ok(foodBase.length >= 100)
  assert.equal(uniqueIds.size, foodBase.length)

  for (const item of foodBase) {
    assert.ok(allowedCategories.has(item.category), `${item.name} category should be broad`)
    assert.ok(item.subCategory, `${item.name} should have second-level category`)
    assert.ok(!item.category.includes('根茎'), `${item.name} should not promote subcategory to top level`)
    assert.ok(!item.category.includes('蛋白'), `${item.name} should avoid nutrient-style category`)
  }
})

test('adds a food record and recalculates it for list/detail/reminders', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '颗',
    isBabyFood: true,
    note: '今晚做熟'
  })

  assert.equal(created.status, 'baby_today')
  assert.equal(created.foodName, '西兰花')
  assert.equal(created.name, '西兰花')

  const list = repo.getFoodRecords()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, created.id)
  assert.equal(repo.getFoodDetail(created.id).record.note, '今晚做熟')
  assert.equal(repo.getReminders().today[0].id, created.id)
})

test('marks records as finished and removes them from active lists', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  repo.finishFoodRecord({ recordId: created.id, action: 'finished' })

  assert.equal(repo.getFoodDetail(created.id).record.status, 'finished')
  assert.equal(repo.getFoodRecords().length, 0)
})

test('keeps raw finished records available for persistence', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  repo.finishFoodRecord({ recordId: created.id, action: 'finished' })

  assert.equal(repo.getAllRawRecords().length, 1)
  assert.equal(repo.getAllRawRecords()[0].status, 'finished')
})

test('updates a food record and recalculates status dates', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodBaseId: 'pumpkin',
    purchaseDate: '2026-06-11',
    storageMethod: 'room'
  })

  const updated = repo.updateFoodRecord({
    recordId: created.id,
    purchaseDate: '2026-06-04',
    storageMethod: 'fridge',
    note: '切开冷藏'
  })

  assert.equal(updated.purchaseDate, '2026-06-04')
  assert.equal(updated.storageMethod, 'fridge')
  assert.equal(updated.status, 'adult_only')
  assert.equal(repo.getFoodDetail(created.id).record.note, '切开冷藏')
})

test('returns null when updating a missing record', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  repo.addFoodRecord({
    foodBaseId: 'pumpkin',
    purchaseDate: '2026-06-11',
    storageMethod: 'room'
  })

  const updated = repo.updateFoodRecord({
    recordId: 'missing-record',
    note: '不应该更新'
  })

  assert.equal(updated, null)
  assert.equal(repo.getFoodRecords()[0].note, '当前仍在宝宝建议期内')
})

test('returns empty detail when a record is not found', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })

  const detail = repo.getFoodDetail('missing-record')

  assert.equal(detail.record, null)
  assert.equal(detail.base, null)
})

test('returns empty detail for missing id even when records exist', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  repo.addFoodRecord({
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  const detail = repo.getFoodDetail('missing-record')

  assert.equal(detail.record, null)
  assert.equal(detail.base, null)
})

test('returns null when finishing a missing record', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  repo.addFoodRecord({
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  const result = repo.finishFoodRecord({ recordId: 'missing-record', action: 'finished' })

  assert.equal(result, null)
  assert.equal(repo.getFoodRecords().length, 1)
})

test('keeps custom food detail base empty instead of falling back to broccoli', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodName: '雪莲果',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })

  const detail = repo.getFoodDetail(created.id)

  assert.equal(detail.record.foodBaseId, 'custom')
  assert.equal(detail.record.name, '雪莲果')
  assert.equal(detail.base, null)
})

test('calculates custom food reminders from the selected storage method', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })
  const created = repo.addFoodRecord({
    foodName: '自制肉泥',
    purchaseDate: '2026-06-12',
    storageMethod: 'freezer'
  })

  assert.equal(created.foodBaseId, 'custom')
  assert.equal(created.babyExpireDate, '2026-06-27')
  assert.equal(created.adultExpireDate, '2026-07-12')
  assert.equal(created.icon, '/assets/sprites/food/food_jar.png')
  assert.equal(created.status, 'baby_ok')
  assert.equal(repo.getReminders().today.length, 0)
})

test('returns null when local food base id is missing', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })

  assert.equal(repo.getFoodBaseById('not-exists'), null)
})

test('stores local feedback with pending status', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12', seedRecords: [] })

  const feedback = repo.submitFeedback({
    type: 'bug',
    content: '按钮文字没有居中',
    contact: 'tester'
  })

  assert.equal(feedback.status, 'pending')
  assert.equal(feedback.type, 'bug')
  assert.equal(feedback.content, '按钮文字没有居中')
  assert.equal(feedback.createdAt, '2026-06-12')
  assert.equal(repo.getFeedbackList().length, 1)
  assert.equal(repo.getFeedbackList()[0].id, feedback.id)
})
