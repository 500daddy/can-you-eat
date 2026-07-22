const test = require('node:test')
const assert = require('node:assert/strict')

const {
  AUDIENCES,
  CATEGORIES,
  EVIDENCE_LEVELS,
  FOOD_STATUSES,
  FOOD_STATES,
  REFERENCE_DATE_TYPES,
  REVIEW_STATUSES,
  STORAGE_METHODS,
  TERM_TYPES,
  validateFoodKnowledge
} = require('../scripts/lib/foodKnowledgeSchema')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')

test('accepts the complete shared fixture and exports the controlled vocabularies', () => {
  assert.deepEqual(FOOD_STATES, ['raw_whole', 'washed', 'cut', 'opened', 'cooked', 'homemade_baby_food', 'thawed'])
  assert.deepEqual(CATEGORIES, ['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食'])
  assert.deepEqual(FOOD_STATUSES, ['active', 'inactive'])
  assert.deepEqual(REVIEW_STATUSES, ['draft', 'sourced', 'validated', 'approved'])
  assert.deepEqual(STORAGE_METHODS, ['room', 'fridge', 'freezer'])
  assert.deepEqual(REFERENCE_DATE_TYPES, ['purchased_at', 'washed_at', 'cut_at', 'opened_at', 'cooked_at', 'made_at', 'thawed_at'])
  assert.deepEqual(TERM_TYPES, ['canonical', 'alias', 'regional', 'pinyin', 'typo'])
  assert.deepEqual(EVIDENCE_LEVELS, ['direct', 'derived', 'insufficient'])
  assert.deepEqual(AUDIENCES, ['general', 'adult', 'baby'])
  assert.deepEqual(validateFoodKnowledge(createFoodKnowledgeFixture()), {
    ok: true,
    errors: []
  })
})

test('reports duplicate food ids, unknown term foods, and invalid controlled values', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.foods.push({ ...fixture.foods[0] })
  fixture.foods[0].category = '蛋白'
  fixture.searchTerms[0].foodId = 'unknown-food'
  fixture.storageRules[0].storageMethod = 'cupboard'

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'foods tomato: invalid category 蛋白',
    'foods: duplicate foodId tomato',
    'search_terms tomato-canonical: unknown foodId unknown-food',
    'storage_rules tomato-cut-fridge-v1: invalid storageMethod cupboard'
  ])
})

test('rejects baby deadlines supported only by general evidence', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].babyDaysMin = 1
  fixture.storageRules[0].babyDaysMax = 1

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'storage_rules tomato-cut-fridge-v1: baby deadline requires direct baby evidence'
  ])
})

test('rejects deadline fields on derived rules', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].evidenceLevel = 'derived'

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'storage_rules tomato-cut-fridge-v1: derived rules cannot contain deadline fields'
  ])
})

test('rejects an adult deadline whose maximum is below its minimum', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].adultDaysMin = 3

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'storage_rules tomato-cut-fridge-v1: invalid adult deadline range 3-2'
  ])
})

test('rejects approved rules with the same conditions but conflicting guidance', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules.push({
    ...fixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-conflict-v1',
    adultDaysMax: 3,
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'storage_rules: conflicting rules tomato-cut-fridge-conflict-v1,tomato-cut-fridge-v1'
  ])
})

test('normalizes missing optional conditions without treating zero as missing', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules.push({
    ...fixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-null-temperature-v1',
    temperatureMinC: null,
    adultDaysMax: 3,
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [
    'storage_rules: conflicting rules tomato-cut-fridge-null-temperature-v1,tomato-cut-fridge-v1'
  ])

  const zeroFixture = createFoodKnowledgeFixture()
  zeroFixture.storageRules.push({
    ...zeroFixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-zero-temperature-v1',
    temperatureMinC: 0,
    adultDaysMax: 3,
    evidenceBindings: zeroFixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  assert.deepEqual(validateFoodKnowledge(zeroFixture).errors, [])
})
