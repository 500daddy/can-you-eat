const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateRecordState,
  groupRecords,
  sortRecordsByPriority
} = require('../utils/foodRules')

const broccoli = {
  id: 'broccoli',
  name: '西兰花',
  defaultStorage: 'fridge',
  fridge: {
    babyDaysMax: 3,
    adultDaysMax: 5
  }
}

test('calculates baby_today when today is one day before baby expiry', () => {
  const record = calculateRecordState({
    food: broccoli,
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    today: '2026-06-12',
    remindBeforeDays: 1
  })

  assert.equal(record.status, 'baby_today')
  assert.equal(record.babyExpireDate, '2026-06-13')
  assert.equal(record.adultExpireDate, '2026-06-15')
  assert.equal(record.remindDate, '2026-06-12')
  assert.equal(record.babyLeft, '剩1天')
  assert.equal(record.adultLeft, '剩3天')
  assert.equal(record.group, '今天建议处理')
})

test('calculates adult_only after baby expiry but before adult reference expiry', () => {
  const record = calculateRecordState({
    food: {
      id: 'carrot',
      name: '胡萝卜',
      fridge: {
        babyDaysMax: 4,
        adultDaysMax: 10
      }
    },
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge',
    today: '2026-06-12'
  })

  assert.equal(record.status, 'adult_only')
  assert.equal(record.babyLeft, '已超过宝宝建议期')
  assert.equal(record.adultLeft, '剩5天')
  assert.equal(record.group, '可留给大人吃')
})

test('keeps finished records out of active recommendation groups', () => {
  const record = calculateRecordState({
    food: broccoli,
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    status: 'finished',
    today: '2026-06-12'
  })

  assert.equal(record.status, 'finished')
  assert.equal(record.group, '已处理')
})

test('preserves manual not_recommended status', () => {
  const record = calculateRecordState({
    food: broccoli,
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge',
    status: 'not_recommended',
    today: '2026-06-12'
  })

  assert.equal(record.status, 'not_recommended')
  assert.equal(record.group, '不建议继续食用')
})

test('preserves manual adult_only status', () => {
  const record = calculateRecordState({
    food: broccoli,
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge',
    status: 'adult_only',
    today: '2026-06-12'
  })

  assert.equal(record.status, 'adult_only')
  assert.equal(record.group, '可留给大人吃')
})

test('sorts records by homepage priority then nearest baby expiry', () => {
  const records = [
    { id: 'fresh', status: 'baby_ok', babyExpireDate: '2026-06-20' },
    { id: 'adult', status: 'adult_only', babyExpireDate: '2026-06-11' },
    { id: 'today-later', status: 'baby_today', babyExpireDate: '2026-06-13' },
    { id: 'today-sooner', status: 'baby_today', babyExpireDate: '2026-06-12' },
    { id: 'expired', status: 'expired', babyExpireDate: '2026-06-01' }
  ]

  assert.deepEqual(sortRecordsByPriority(records).map((item) => item.id), [
    'today-sooner',
    'today-later',
    'adult',
    'expired',
    'fresh'
  ])
})

test('groups records for homepage sections', () => {
  const sections = groupRecords([
    { id: 'a', status: 'baby_today', group: '今天建议处理' },
    { id: 'b', status: 'adult_only', group: '可留给大人吃' },
    { id: 'c', status: 'baby_ok', group: '新鲜食材' }
  ])

  assert.deepEqual(sections.map((section) => section.title), [
    '今天建议处理',
    '可留给大人吃',
    '新鲜食材'
  ])
})
