const test = require('node:test')
const assert = require('node:assert/strict')

const {
  AUDIENCES,
  CATEGORIES,
  EVIDENCE_LEVELS,
  FOOD_STATUSES,
  FOOD_STATES,
  PACKAGE_STATES,
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
  assert.deepEqual(PACKAGE_STATES, ['not_applicable'])
  assert.equal(Object.isFrozen(PACKAGE_STATES), true)
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
    temperatureMaxC: 0,
    adultDaysMax: 3,
    evidenceBindings: zeroFixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  assert.deepEqual(validateFoodKnowledge(zeroFixture).errors, [])
})

test('requires an object input with all four collections explicitly provided as arrays', () => {
  for (const input of [null, [], 'invalid', 0, true]) {
    assert.deepEqual(validateFoodKnowledge(input), {
      ok: false,
      errors: ['input: expected object']
    })
  }

  for (const field of ['foods', 'searchTerms', 'storageRules', 'evidenceSources']) {
    const missingFixture = createFoodKnowledgeFixture()
    delete missingFixture[field]
    const missingResult = validateFoodKnowledge(missingFixture)
    assert.equal(missingResult.ok, false, `${field} should be required`)
    assert.ok(missingResult.errors.includes(`${field}: expected array`))

    const invalidFixture = createFoodKnowledgeFixture()
    invalidFixture[field] = null
    const invalidResult = validateFoodKnowledge(invalidFixture)
    assert.equal(invalidResult.ok, false, `${field} should reject non-arrays`)
    assert.ok(invalidResult.errors.includes(`${field}: expected array`))
  }

  assert.deepEqual(validateFoodKnowledge({
    foods: [],
    searchTerms: [],
    storageRules: [],
    evidenceSources: []
  }), {
    ok: true,
    errors: []
  })
})

test('reports indexed errors instead of throwing for invalid collection elements', () => {
  const cases = [
    {
      label: 'foods',
      arrange(fixture) { fixture.foods[0] = null },
      error: 'foods[0]: expected object'
    },
    {
      label: 'searchTerms',
      arrange(fixture) { fixture.searchTerms[0] = [] },
      error: 'searchTerms[0]: expected object'
    },
    {
      label: 'storageRules',
      arrange(fixture) { fixture.storageRules[0] = 'invalid-rule' },
      error: 'storageRules[0]: expected object'
    },
    {
      label: 'evidenceSources',
      arrange(fixture) { fixture.evidenceSources[0] = 42 },
      error: 'evidenceSources[0]: expected object'
    },
    {
      label: 'evidenceBindings',
      arrange(fixture) { fixture.storageRules[0].evidenceBindings[0] = false },
      error: 'storageRules[0].evidenceBindings[0]: expected object'
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    item.arrange(fixture)
    let result

    assert.doesNotThrow(() => {
      result = validateFoodKnowledge(fixture)
    }, item.label)
    assert.equal(result.ok, false, item.label)
    assert.ok(result.errors.includes(item.error), item.label)
  }
})

test('requires primary ids and complete evidence binding fields', () => {
  const fixture = createFoodKnowledgeFixture()
  delete fixture.foods[0].foodId
  delete fixture.searchTerms[0].termId
  delete fixture.storageRules[0].ruleId
  delete fixture.evidenceSources[0].sourceId
  delete fixture.storageRules[0].evidenceBindings[0].sourceId
  delete fixture.storageRules[0].evidenceBindings[0].locator

  const result = validateFoodKnowledge(fixture)

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('foods[0]: missing foodId'))
  assert.ok(result.errors.includes('search_terms[0]: missing termId'))
  assert.ok(result.errors.includes('storage_rules[0]: missing ruleId'))
  assert.ok(result.errors.includes('evidence_sources[0]: missing sourceId'))
  assert.ok(result.errors.includes('storageRules[0].evidenceBindings[0]: missing sourceId'))
  assert.ok(result.errors.includes('storageRules[0].evidenceBindings[0]: missing locator'))
  assert.ok(result.errors.includes('storage_rules[0]: adult deadline requires general or adult evidence'))
})

test('requires complete evidence source metadata and a controlled source status', () => {
  for (const field of ['organization', 'title', 'url', 'sourceType', 'locale', 'applicableScope']) {
    const fixture = createFoodKnowledgeFixture()
    fixture.evidenceSources[0][field] = '   '

    assert.ok(
      validateFoodKnowledge(fixture).errors.includes(`evidence_sources source-general-storage: missing ${field}`),
      field
    )
  }

  const fixture = createFoodKnowledgeFixture()
  fixture.evidenceSources[0].status = 'archived'
  assert.ok(validateFoodKnowledge(fixture).errors.includes(
    'evidence_sources source-general-storage: invalid status archived'
  ))
})

test('treats null and omitted deadline fields alike while preserving zero', () => {
  const fixture = createFoodKnowledgeFixture()
  const sameConclusionRule = {
    ...fixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-omitted-baby-v1',
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  }
  delete sameConclusionRule.babyDaysMin
  delete sameConclusionRule.babyDaysMax
  fixture.storageRules.push(sameConclusionRule)

  assert.deepEqual(validateFoodKnowledge(fixture).errors, [])

  const zeroFixture = createFoodKnowledgeFixture()
  zeroFixture.storageRules.push({
    ...zeroFixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-zero-deadline-v1',
    adultDaysMin: 0,
    evidenceBindings: zeroFixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })
  assert.deepEqual(validateFoodKnowledge(zeroFixture).errors, [
    'storage_rules: conflicting rules tomato-cut-fridge-v1,tomato-cut-fridge-zero-deadline-v1'
  ])
})

test('does not allow callers to extend exported controlled vocabularies', () => {
  const originalLength = STORAGE_METHODS.length
  let result

  try {
    try {
      STORAGE_METHODS.push('cupboard')
    } catch (error) {
      assert.ok(error instanceof TypeError)
    }

    const fixture = createFoodKnowledgeFixture()
    fixture.storageRules[0].storageMethod = 'cupboard'
    result = validateFoodKnowledge(fixture)
  } finally {
    if (STORAGE_METHODS.length > originalLength) {
      STORAGE_METHODS.splice(originalLength)
    }
  }

  assert.equal(Object.isFrozen(STORAGE_METHODS), true)
  assert.ok(result.errors.includes(
    'storage_rules tomato-cut-fridge-v1: invalid storageMethod cupboard'
  ))
})

test('validates food revision, tag arrays, and optional iconKey type', () => {
  const cases = [
    {
      arrange(food) { food.revision = 0 },
      error: 'foods tomato: invalid revision 0'
    },
    {
      arrange(food) { food.allergenTags = 'egg' },
      error: 'foods tomato: allergenTags must be an array'
    },
    {
      arrange(food) { food.riskTags = [''] },
      error: 'foods tomato: invalid riskTags[0]'
    },
    {
      arrange(food) { food.iconKey = null },
      error: 'foods tomato: iconKey must be a string'
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    item.arrange(fixture.foods[0])
    assert.ok(validateFoodKnowledge(fixture).errors.includes(item.error), item.error)
  }
})

test('validates search term weight and region before publication', () => {
  const cases = [
    {
      arrange(term) { term.weight = null },
      error: 'search_terms tomato-canonical: invalid weight null'
    },
    {
      arrange(term) { delete term.weight },
      error: 'search_terms tomato-canonical: invalid weight undefined'
    },
    {
      arrange(term) { term.weight = Infinity },
      error: 'search_terms tomato-canonical: invalid weight Infinity'
    },
    {
      arrange(term) { term.region = null },
      error: 'search_terms tomato-canonical: region must be a string'
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    item.arrange(fixture.searchTerms[0])
    assert.ok(validateFoodKnowledge(fixture).errors.includes(item.error), item.error)
  }
})

test('validates storage rule publication fields and the single-valued packageState enum independently', () => {
  const cases = [
    {
      arrange(rule) { rule.priority = '100' },
      error: 'storage_rules tomato-cut-fridge-v1: priority must be a finite number'
    },
    {
      arrange(rule) { delete rule.advice },
      error: 'storage_rules tomato-cut-fridge-v1: missing advice'
    },
    {
      arrange(rule) { rule.discardSigns = '霉点' },
      error: 'storage_rules tomato-cut-fridge-v1: discardSigns must be an array'
    },
    {
      arrange(rule) { rule.discardSigns = [''] },
      error: 'storage_rules tomato-cut-fridge-v1: invalid discardSigns[0]'
    },
    {
      arrange(rule) { rule.ruleVersion = 0 },
      error: 'storage_rules tomato-cut-fridge-v1: invalid ruleVersion 0'
    },
    {
      arrange(rule) { rule.packageState = 'sealed' },
      error: 'storage_rules tomato-cut-fridge-v1: invalid packageState sealed'
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    item.arrange(fixture.storageRules[0])
    assert.ok(validateFoodKnowledge(fixture).errors.includes(item.error), item.error)
  }
})

test('rejects reversed or one-sided temperature ranges', () => {
  const cases = [
    {
      temperatureMinC: 5,
      temperatureMaxC: 1,
      error: 'storage_rules tomato-cut-fridge-v1: invalid temperatureMinC/temperatureMaxC range 5-1'
    },
    {
      temperatureMinC: 5,
      error: 'storage_rules tomato-cut-fridge-v1: invalid temperatureMinC/temperatureMaxC range 5-undefined'
    },
    {
      temperatureMaxC: 5,
      error: 'storage_rules tomato-cut-fridge-v1: invalid temperatureMinC/temperatureMaxC range undefined-5'
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    if (Object.hasOwn(item, 'temperatureMinC')) {
      fixture.storageRules[0].temperatureMinC = item.temperatureMinC
    }
    if (Object.hasOwn(item, 'temperatureMaxC')) {
      fixture.storageRules[0].temperatureMaxC = item.temperatureMaxC
    }
    assert.ok(validateFoodKnowledge(fixture).errors.includes(item.error), item.error)
  }
})

test('requires approved direct rules to bind at least one complete active source', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].evidenceBindings = []

  assert.ok(validateFoodKnowledge(fixture).errors.includes(
    'storage_rules tomato-cut-fridge-v1: evidenceBindings requires at least one complete active binding for approved direct rule'
  ))
})

test('does not conflict when any multi-valued condition dimension differs', () => {
  const cases = [
    {
      name: 'foodId',
      arrange(fixture, rule) {
        fixture.foods.push({
          ...fixture.foods[0],
          foodId: 'apple',
          canonicalName: '苹果',
          category: '水果',
          subCategory: '仁果类',
          iconKey: 'apple'
        })
        rule.foodId = 'apple'
      }
    },
    {
      name: 'foodState',
      arrange(fixture, rule) { rule.foodState = 'opened' }
    },
    {
      name: 'storageMethod',
      arrange(fixture, rule) { rule.storageMethod = 'freezer' }
    },
    {
      name: 'temperatureMinC/temperatureMaxC',
      arrange(fixture, rule) {
        rule.temperatureMinC = 0
        rule.temperatureMaxC = 4
      }
    },
    {
      name: 'referenceDateType',
      arrange(fixture, rule) { rule.referenceDateType = 'purchased_at' }
    },
    {
      name: 'priority',
      arrange(fixture, rule) { rule.priority = 90 }
    }
  ]

  // packageState has one legal schema-v1 value; its dimension is covered by enum rejection
  // until a future explicit schema version adds another legal value.
  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    const rule = {
      ...fixture.storageRules[0],
      ruleId: `tomato-cut-fridge-condition-${item.name}-v1`,
      advice: '仅用于验证条件差异的另一条合法建议。',
      discardSigns: [...fixture.storageRules[0].discardSigns],
      evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
    }
    item.arrange(fixture, rule)
    fixture.storageRules.push(rule)

    assert.deepEqual(validateFoodKnowledge(fixture), {
      ok: true,
      errors: []
    }, item.name)
  }
})

test('reports the exact conflict when any user-visible result field differs', () => {
  const cases = [
    {
      name: 'baby-days-min',
      prepare(rule) {
        rule.babyDaysMin = 1
        rule.babyDaysMax = 3
        rule.evidenceBindings.push({
          sourceId: 'source-general-storage',
          audience: 'baby',
          locator: '测试宝宝表格第 1 行'
        })
      },
      change(rule) { rule.babyDaysMin = 2 }
    },
    {
      name: 'baby-days-max',
      prepare(rule) {
        rule.babyDaysMin = 1
        rule.babyDaysMax = 3
        rule.evidenceBindings.push({
          sourceId: 'source-general-storage',
          audience: 'baby',
          locator: '测试宝宝表格第 1 行'
        })
      },
      change(rule) { rule.babyDaysMax = 4 }
    },
    {
      name: 'adult-days-min',
      change(rule) { rule.adultDaysMin = 0 }
    },
    {
      name: 'adult-days-max',
      change(rule) { rule.adultDaysMax = 3 }
    },
    {
      name: 'advice',
      change(rule) { rule.advice = '另一条冲突的可见建议。' }
    },
    {
      name: 'discard-signs',
      change(rule) { rule.discardSigns = ['变色'] }
    }
  ]

  for (const item of cases) {
    const fixture = createFoodKnowledgeFixture()
    if (item.prepare) {
      item.prepare(fixture.storageRules[0])
    }
    const rule = {
      ...fixture.storageRules[0],
      ruleId: `tomato-cut-fridge-result-${item.name}-v1`,
      discardSigns: [...fixture.storageRules[0].discardSigns],
      evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
    }
    item.change(rule)
    fixture.storageRules.push(rule)

    assert.deepEqual(validateFoodKnowledge(fixture).errors, [
      `storage_rules: conflicting rules tomato-cut-fridge-result-${item.name}-v1,tomato-cut-fridge-v1`
    ], item.name)
  }
})
