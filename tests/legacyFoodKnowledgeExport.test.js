const test = require('node:test')
const assert = require('node:assert/strict')

const { foodBase } = require('../utils/foodBase')
const { exportLegacyFoodKnowledge } = require('../scripts/lib/legacyFoodKnowledgeExport')

test('exports every legacy food as unverified and keeps tomato aliases searchable', () => {
  const result = exportLegacyFoodKnowledge(foodBase)
  const tomato = result.foods.find((food) => food.foodId === 'tomato')
  const tomatoAlias = result.searchTerms.find((term) => (
    term.foodId === 'tomato' && term.normalizedTerm === '西红柿'
  ))

  assert.deepEqual(Object.keys(result), ['foods', 'searchTerms', 'storageCandidates', 'report'])
  assert.equal(result.foods.length, foodBase.length)
  assert.deepEqual(result.foods.map((food) => food.foodId), foodBase.map((food) => food.id).sort())
  assert.ok(result.foods.every((food) => food.reviewStatus === 'legacy_unverified'))
  assert.deepEqual(tomato, {
    foodId: 'tomato',
    canonicalName: '番茄',
    category: '蔬菜',
    subCategory: '茄果类',
    defaultState: 'raw_whole',
    allergenTags: [],
    riskTags: [],
    iconKey: 'tomato',
    status: 'active',
    revision: 1,
    reviewStatus: 'legacy_unverified'
  })
  assert.deepEqual(tomatoAlias, {
    termId: `tomato-alias-${Buffer.from('西红柿').toString('hex')}`,
    foodId: 'tomato',
    term: '西红柿',
    normalizedTerm: '西红柿',
    type: 'alias',
    region: '',
    weight: 90,
    reviewStatus: 'legacy_unverified'
  })
  assert.equal(result.report.foodCount, foodBase.length)
  assert.equal(result.report.searchTermCount, result.searchTerms.length)
  assert.equal(result.report.storageCandidateCount, result.storageCandidates.length)
  assert.equal(result.report.publishableFoodCount, 0)
  assert.equal(result.report.publishableRuleCount, 0)
})

test('reports every normalized term shared by multiple foods without choosing a winner', () => {
  const { report } = exportLegacyFoodKnowledge(foodBase)
  const greenVegetableCollision = report.termCollisions.find((collision) => (
    collision.normalizedTerm === '青菜'
  ))

  assert.deepEqual(greenVegetableCollision, {
    normalizedTerm: '青菜',
    foodIds: ['bokChoy', 'cabbage']
  })
  assert.equal(report.termCollisionCount, report.termCollisions.length)
  assert.ok(report.termCollisions.every((collision) => collision.foodIds.length > 1))
})

test('preserves storage payloads only as unverified migration candidates', () => {
  const result = exportLegacyFoodKnowledge(foodBase)
  const legacyTomato = foodBase.find((food) => food.id === 'tomato')
  const candidate = result.storageCandidates.find((item) => (
    item.candidateId === 'tomato-fridge-legacy-v1'
  ))

  assert.deepEqual(Object.keys(candidate), [
    'candidateId',
    'foodId',
    'foodState',
    'storageMethod',
    'referenceDateType',
    'evidenceLevel',
    'migrationStatus',
    'legacyPayload'
  ])
  assert.deepEqual(candidate, {
    candidateId: 'tomato-fridge-legacy-v1',
    foodId: 'tomato',
    foodState: 'raw_whole',
    storageMethod: 'fridge',
    referenceDateType: 'purchased_at',
    evidenceLevel: 'insufficient',
    migrationStatus: 'legacy_unverified',
    legacyPayload: legacyTomato.fridge
  })
  assert.notStrictEqual(candidate.legacyPayload, legacyTomato.fridge)
  assert.equal(typeof candidate.legacyPayload.adultDaysMax, 'number')
  assert.equal(candidate.adultDaysMax, undefined)
  assert.equal(candidate.babyDaysMax, undefined)
})

test('deep copies legacy storage payloads so output mutations cannot pollute the source', () => {
  const sourcePayload = {
    adultDaysMax: 10,
    text: 'legacy only',
    nested: {
      notes: ['keep source unchanged']
    }
  }
  const sourceFoodBase = [{
    id: 'nestedStorage',
    name: '嵌套保存',
    aliases: [],
    category: '蔬菜',
    subCategory: '叶菜类',
    fridge: sourcePayload
  }]

  const result = exportLegacyFoodKnowledge(sourceFoodBase)
  const exportedPayload = result.storageCandidates[0].legacyPayload

  assert.deepEqual(exportedPayload, sourcePayload)
  assert.notStrictEqual(exportedPayload, sourcePayload)
  assert.notStrictEqual(exportedPayload.nested, sourcePayload.nested)
  assert.notStrictEqual(exportedPayload.nested.notes, sourcePayload.nested.notes)

  exportedPayload.adultDaysMax = 99
  exportedPayload.nested.notes[0] = 'mutated export'

  assert.equal(sourceFoodBase[0].fridge.adultDaysMax, 10)
  assert.equal(sourceFoodBase[0].fridge.nested.notes[0], 'keep source unchanged')
})

test('keeps one canonical-preferred term for each food and normalized term pair', () => {
  const { searchTerms } = exportLegacyFoodKnowledge(foodBase)
  const pairKeys = searchTerms.map((term) => `${term.foodId}\0${term.normalizedTerm}`)

  assert.equal(new Set(pairKeys).size, pairKeys.length)

  for (const [foodId, normalizedTerm] of [
    ['babyPuree', '辅食泥'],
    ['bass', '鲈鱼'],
    ['potato', '土豆'],
    ['salmon', '三文鱼']
  ]) {
    const matchingTerms = searchTerms.filter((term) => (
      term.foodId === foodId && term.normalizedTerm === normalizedTerm
    ))

    assert.equal(matchingTerms.length, 1, `${foodId}/${normalizedTerm}`)
    assert.equal(matchingTerms[0].type, 'canonical', `${foodId}/${normalizedTerm}`)
    assert.equal(matchingTerms[0].weight, 100, `${foodId}/${normalizedTerm}`)
  }
})

test('normalizes string and array aliases, removes blanks and duplicates, and tolerates missing aliases', () => {
  const storage = { adultDaysMax: 2, babyDaysMax: 1, text: 'legacy only' }
  const customFoodBase = [
    { id: 'stringAliases', name: ' Name ', aliases: '  Name、 Alpha 、alpha,,， Beta  ', category: '蔬菜', subCategory: '叶菜类', room: storage },
    { id: 'arrayAliases', name: '数组', aliases: [' 甲 ', '', null, undefined, '  ', '甲', '乙'], category: '蔬菜', subCategory: '叶菜类', fridge: storage },
    { id: 'missingAliases', name: '缺失', category: '蔬菜', subCategory: '叶菜类', freezer: storage }
  ]

  const result = exportLegacyFoodKnowledge(customFoodBase)
  const stringTerms = result.searchTerms.filter((term) => term.foodId === 'stringAliases')
  const arrayTerms = result.searchTerms.filter((term) => term.foodId === 'arrayAliases')
  const missingTerms = result.searchTerms.filter((term) => term.foodId === 'missingAliases')

  assert.deepEqual(stringTerms.map((term) => [term.type, term.term, term.normalizedTerm]), [
    ['alias', 'Alpha', 'alpha'],
    ['alias', 'Beta', 'beta'],
    ['canonical', 'Name', 'name']
  ])
  assert.deepEqual(arrayTerms.map((term) => [term.type, term.term]), [
    ['alias', '乙'],
    ['alias', '甲'],
    ['canonical', '数组']
  ])
  assert.deepEqual(missingTerms.map((term) => [term.type, term.term]), [['canonical', '缺失']])
  assert.equal(result.storageCandidates.length, 3)
})

test('produces identical deterministically sorted output when legacy foods are reversed', () => {
  const expected = exportLegacyFoodKnowledge(foodBase)
  const actual = exportLegacyFoodKnowledge([...foodBase].reverse())

  assert.deepEqual(actual, expected)
  assert.deepEqual(expected.foods.map((food) => food.foodId), [...expected.foods.map((food) => food.foodId)].sort())
  assert.deepEqual(expected.searchTerms.map((term) => term.termId), [...expected.searchTerms.map((term) => term.termId)].sort())
  assert.deepEqual(
    expected.storageCandidates.map((candidate) => candidate.candidateId),
    [...expected.storageCandidates.map((candidate) => candidate.candidateId)].sort()
  )
})
