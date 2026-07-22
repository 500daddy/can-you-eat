const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readDoc(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'docs', fileName), 'utf8')
}

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

test('cloud setup documents account collections environment id and family share verification', () => {
  const guide = readDoc('cloud-setup.md')

  assert.match(guide, /user_profiles/)
  assert.match(guide, /环境选择器|环境设置/)
  assert.match(guide, /utils\/cloudConfig\.local\.js/)
  assert.match(guide, /微信分享/)
  assert.match(guide, /正式家庭/)
  assert.match(guide, /两个.*微信账号|双账号/)
})

test('cloud setup lists every stage A food knowledge collection', () => {
  const guide = readDoc('cloud-setup.md')
  const collections = [
    'foods',
    'food_search_terms',
    'storage_rules',
    'evidence_sources',
    'knowledge_releases',
    'food_search_docs',
    'search_events'
  ]

  for (const collection of collections) {
    assert.match(guide, new RegExp(`\\b${collection}\\b`), `cloud setup should mention ${collection}`)
  }
})

test('cloud setup keeps knowledge editing publishing and search feedback behind trusted services', () => {
  const guide = readDoc('cloud-setup.md')

  assert.match(guide, /知识集合[^。\n]*(编辑|维护)[^。\n]*发布[^。\n]*(只允许|仅限)[^。\n]*(管理端[^。\n]*云函数|云函数[^。\n]*管理端)/)
  assert.match(guide, /小程序[^。\n]*(不能|不得|禁止)[^。\n]*直接写入[^。\n]*知识集合/)
  assert.match(guide, /search_events[^。\n]*云函数[^。\n]*字段白名单[^。\n]*限流/)
  assert.match(guide, /search_events[^。\n]*(不能|不得|禁止)[^。\n]*客户端[^。\n]*(任意)?直写/)
})

test('food data sources defines evidence levels and their deadline limits', () => {
  const doc = readDoc('food-data-sources.md')

  assert.match(doc, /direct[^。\n]*具体食材[^。\n]*状态[^。\n]*条件[^。\n]*(人群|适用对象)/i)
  assert.match(doc, /direct[^。\n]*(只有|仅)[^。\n]*(发布|填写)[^。\n]*(期限|天数)/i)
  assert.match(doc, /derived[^。\n]*(只能|仅能)[^。\n]*定性/i)
  assert.match(doc, /insufficient[^。\n]*(不发布|不得发布|不能发布)[^。\n]*(期限|天数)/i)
})

test('food data sources does not derive baby deadlines from adult guidance', () => {
  const doc = readDoc('food-data-sources.md')

  assert.match(doc, /(成人|一般家庭)[^。\n]*期限[^。\n]*(不能|不得|禁止)[^。\n]*(缩短|换算|转换)[^。\n]*宝宝[^。\n]*期限/)
  assert.match(doc, /没有[^。\n]*宝宝[^。\n]*direct[^。\n]*(baby|宝宝)[^。\n]*字段[^。\n]*(空|留空)/i)
  assert.match(doc, /UI[^。\n]*(不展示|不得展示|不能展示)[^。\n]*独立[^。\n]*宝宝[^。\n]*(天数|期限)/i)
})
