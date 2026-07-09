const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateBabyAgeText,
  formatBabyAgeFromMonths,
  getBabyAgePickerOptions,
  normalizeBabyAgeMonths
} = require('../utils/babyAge')

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

test('formats baby age from privacy-preserving age units', () => {
  assert.equal(formatBabyAgeFromMonths(8), '8个月')
  assert.equal(formatBabyAgeFromMonths(23), '23个月')
  assert.equal(formatBabyAgeFromMonths(24), '2岁')
  assert.equal(formatBabyAgeFromMonths(30), '2岁半')
  assert.equal(formatBabyAgeFromMonths(36), '3岁')
})

test('normalizes age units monthly before two years and half-yearly after', () => {
  assert.equal(normalizeBabyAgeMonths(17), 17)
  assert.equal(normalizeBabyAgeMonths(29), 30)
  assert.equal(normalizeBabyAgeMonths(34), 36)
})

test('builds age picker options without exact birthdays', () => {
  const options = getBabyAgePickerOptions()
  assert.ok(options.some((item) => item.months === 23 && item.text === '23个月'))
  assert.ok(options.some((item) => item.months === 24 && item.text === '2岁'))
  assert.ok(options.some((item) => item.months === 30 && item.text === '2岁半'))
  assert.equal(options.some((item) => String(item.text).includes('生日')), false)
})
