const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { formatShanghaiDate } = require('../cloudfunctions/familyApi/serverDate')

test('formats the Shanghai date across a UTC date boundary', () => {
  assert.equal(formatShanghaiDate(new Date('2026-07-18T15:59:59Z')), '2026-07-18')
  assert.equal(formatShanghaiDate(new Date('2026-07-18T16:30:00Z')), '2026-07-19')
})

test('familyApi entry injects the server Shanghai date and ignores event.today', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../cloudfunctions/familyApi/index.js'),
    'utf8'
  )

  assert.match(source, /require\(['"]\.\/serverDate['"]\)/)
  assert.match(source, /today:\s*formatShanghaiDate\(new Date\(\)\)/)
  assert.doesNotMatch(source, /event\.today/)
})
