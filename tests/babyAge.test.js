const test = require('node:test')
const assert = require('node:assert/strict')

const { calculateBabyAgeText } = require('../utils/babyAge')

test('calculates months and days for a baby older than one month', () => {
  assert.equal(calculateBabyAgeText('2025-10-01', '2026-06-16'), '8个月15天')
})

test('calculates days for a baby younger than one month', () => {
  assert.equal(calculateBabyAgeText('2026-06-01', '2026-06-16'), '15天')
})

test('clamps future birthday to 0 days', () => {
  assert.equal(calculateBabyAgeText('2026-07-01', '2026-06-16'), '0天')
})

test('handles month boundary dates', () => {
  assert.equal(calculateBabyAgeText('2026-01-31', '2026-03-01'), '1个月1天')
})
