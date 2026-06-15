const test = require('node:test')
const assert = require('node:assert/strict')

const { createMemoryFoodRepository } = require('../utils/foodRepository')

test('searches food by alias and returns normalized food metadata', () => {
  const repo = createMemoryFoodRepository({ today: '2026-06-12' })
  const results = repo.searchFoods('西红柿')

  assert.equal(results[0].id, 'tomato')
  assert.equal(results[0].name, '番茄')
  assert.equal(results[0].defaultStorage, 'fridge')
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
