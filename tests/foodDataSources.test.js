const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('food data sources document authority, taxonomy, and safety limits', () => {
  const docPath = path.join(__dirname, '..', 'docs', 'food-data-sources.md')

  assert.ok(fs.existsSync(docPath), 'docs/food-data-sources.md should exist')

  const doc = fs.readFileSync(docPath, 'utf8')
  const requiredPhrases = [
    '国家卫生健康委',
    '中国营养学会',
    '中国疾病预防控制中心',
    'FoodSafety.gov',
    '不能替代专业医疗或食品安全判断',
    '一级分类',
    '二级分类'
  ]

  for (const phrase of requiredPhrases) {
    assert.ok(doc.includes(phrase), `document should mention ${phrase}`)
  }
})
