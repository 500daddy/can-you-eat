const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readDoc(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'docs', fileName), 'utf8')
}

function findLine(doc, marker, message) {
  const line = doc.split('\n').find((candidate) => (
    marker instanceof RegExp ? marker.test(candidate) : candidate.includes(marker)
  ))
  assert.ok(line, message || `document should contain a line for ${marker}`)
  return line
}

function extractSection(doc, heading) {
  const start = doc.indexOf(heading)
  assert.notEqual(start, -1, `document should contain section ${heading}`)

  const remainder = doc.slice(start + heading.length)
  const nextHeading = remainder.search(/\n##\s/)
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)
}

function assertSemantics(text, patterns, subject) {
  for (const pattern of patterns) {
    assert.match(text, pattern, `${subject} should match ${pattern}`)
  }
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

test('cloud setup documents each stage A food knowledge collection responsibility', () => {
  const guide = readDoc('cloud-setup.md')
  const responsibilities = {
    foods: [/食材身份/],
    food_search_terms: [/(搜索名|检索名)/, /别名/],
    storage_rules: [/条件/, /规则/],
    evidence_sources: [/来源/, /追溯/],
    knowledge_releases: [/(不可变|不得改写)/, /版本/, /checksum/i],
    food_search_docs: [/(发布流程|发布)[^；。]*生成/, /(运行时[^；。]*快照|快照[^；。]*运行时)/, /(禁止|不得|不能)[^；。]*人工编辑/],
    search_events: [/(最小化|最少)/, /零结果/, /(用户)?选择反馈/]
  }

  for (const [collection, patterns] of Object.entries(responsibilities)) {
    const line = findLine(guide, `\`${collection}\``, `cloud setup should mention ${collection}`)
    assertSemantics(line, patterns, collection)
  }
})

test('cloud setup keeps knowledge editing publishing and search feedback behind trusted services', () => {
  const guide = readDoc('cloud-setup.md')

  assert.match(guide, /知识集合[^。\n]*(编辑|维护)[^。\n]*发布[^。\n]*(只允许|仅限)[^。\n]*(管理端[^。\n]*云函数|云函数[^。\n]*管理端)/)
  assert.match(guide, /小程序[^。\n]*(不能|不得|禁止)[^。\n]*直接写入[^。\n]*知识集合/)
  assert.match(guide, /search_events[^。\n]*云函数[^。\n]*字段白名单[^。\n]*限流/)
  assert.match(guide, /search_events[^。\n]*(不能|不得|禁止)[^。\n]*客户端[^。\n]*(任意)?直写/)
})

test('cloud setup keeps stage A local and does not claim a deployed runtime switch', () => {
  const guide = readDoc('cloud-setup.md')
  const section = extractSection(guide, '### 食材知识库阶段 A / 集合')

  assert.match(section, /小程序[^。\n]*只读[^。\n]*正式[^。\n]*快照/)
  assert.match(section, /阶段 A[^。\n]*(仅|只)[^。\n]*本地候选[^。\n]*迁移报告/)
  assert.match(section, /(不创建|不得创建)[^。\n]*线上[^。\n]*正式版本/)
  assert.match(section, /(不切换|不得切换)[^。\n]*当前搜索/)
  assert.match(section, /CloudBase[^。\n]*上传[^。\n]*(活动版本|生效版本)[^。\n]*切换[^。\n]*(后续|下一阶段)/)
  assert.match(section, /(不表示|并非|不是)[^。\n]*(已经|已)[^。\n]*部署/)
})

test('food data sources defines evidence levels and their deadline limits', () => {
  const doc = readDoc('food-data-sources.md')
  const section = extractSection(doc, '## 规则证据等级')
  const direct = findLine(section, '`direct`')
  const derived = findLine(section, '`derived`')
  const insufficient = findLine(section, '`insufficient`')

  assertSemantics(direct, [
    /具体食材/,
    /状态/,
    /条件/,
    /(人群|适用对象)/,
    /只有[^。\n]*direct[^。\n]*(发布|填写)[^。\n]*(期限|天数)/i
  ], 'direct evidence')
  assertSemantics(derived, [
    /(只能|仅能)[^。\n]*定性/,
    /(不能|不得)[^。\n]*填写[^。\n]*期限字段/
  ], 'derived evidence')
  assertSemantics(insufficient, [
    /(信息不足|证据不足)/,
    /(不发布|不得发布|不能发布)[^。\n]*(期限|天数)/,
    /字段[^。\n]*留白/
  ], 'insufficient evidence')
})

test('food data sources does not derive baby deadlines from adult guidance', () => {
  const doc = readDoc('food-data-sources.md')
  const policy = findLine(doc, /(成人|一般家庭)[^。\n]*宝宝/, 'document should separate adult and baby deadline review')

  assert.match(policy, /(成人|一般家庭)[^。\n]*保存期限/)
  assert.match(policy, /(不能|不得)[^。\n]*简单缩短/)
  assert.match(policy, /(不能|不得)[^。\n]*换算/)
  assert.match(policy, /(不能|不得)[^。\n]*转换成[^。\n]*宝宝[^。\n]*期限/)
  assert.match(policy, /成人[^。\n]*宝宝[^。\n]*(必须|需要|需)[^。\n]*分开审核/)
})

test('food data sources leaves unsupported baby deadlines empty without hiding sourced general guidance', () => {
  const doc = readDoc('food-data-sources.md')
  const policy = findLine(doc, 'babyDaysMin')

  assert.match(policy, /没有[^。\n]*宝宝[^。\n]*direct[^。\n]*证据/i)
  assert.match(policy, /babyDaysMin/i)
  assert.match(policy, /babyDaysMax/i)
  assert.match(policy, /宝宝[^。\n]*期限字段[^。\n]*(保持空|留空)/)
  assert.match(policy, /UI[^。\n]*(不展示|不得展示|不能展示)[^。\n]*独立[^。\n]*宝宝[^。\n]*(天数|期限)/i)
  assert.match(policy, /(可以|仍可)[^。\n]*有来源[^。\n]*一般保存提醒[^。\n]*谨慎提示/)
})
