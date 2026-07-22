const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildFoodKnowledgeRelease,
  checksum,
  stableJson
} = require('../scripts/lib/foodKnowledgeCompiler')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')

const RELEASE_OPTIONS = {
  releaseId: 'food-kb-test.1',
  previousReleaseId: 'food-kb-test.0',
  generatedAt: '2026-07-22T00:00:00.000Z'
}

function createTwoFoodFixture() {
  const fixture = createFoodKnowledgeFixture()
  fixture.foods.push({
    ...fixture.foods[0],
    foodId: 'apple',
    canonicalName: '苹果',
    category: '水果',
    subCategory: '仁果类',
    iconKey: 'apple'
  })
  fixture.searchTerms.push(
    {
      ...fixture.searchTerms[0],
      termId: 'apple-canonical',
      foodId: 'apple',
      term: '苹果',
      normalizedTerm: '苹果'
    },
    {
      ...fixture.searchTerms[1],
      termId: 'apple-alias-pingan-guo',
      foodId: 'apple',
      term: '平安果',
      normalizedTerm: '平安果',
      weight: 80
    }
  )
  fixture.storageRules.push({
    ...fixture.storageRules[0],
    ruleId: 'apple-cut-fridge-v1',
    foodId: 'apple',
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  return fixture
}

test('builds a deterministic release with the exact publication contract', () => {
  const fixture = createTwoFoodFixture()

  const firstRelease = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)
  const secondRelease = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)

  assert.deepEqual(firstRelease, secondRelease)
  assert.deepEqual(firstRelease.snapshot, {
    schemaVersion: '1.0.0',
    releaseId: 'food-kb-test.1',
    generatedAt: '2026-07-22T00:00:00.000Z',
    previousReleaseId: 'food-kb-test.0',
    foods: [
      {
        foodId: 'apple',
        canonicalName: '苹果',
        normalizedCanonicalName: '苹果',
        category: '水果',
        subCategory: '仁果类',
        iconKey: 'apple',
        searchTerms: ['苹果', '平安果'],
        rankedTerms: [
          { term: '苹果', normalizedTerm: '苹果', type: 'canonical', weight: 100 },
          { term: '平安果', normalizedTerm: '平安果', type: 'alias', weight: 80 }
        ],
        activeRuleIds: ['apple-cut-fridge-v1'],
        releaseId: 'food-kb-test.1'
      },
      {
        foodId: 'tomato',
        canonicalName: '番茄',
        normalizedCanonicalName: '番茄',
        category: '蔬菜',
        subCategory: '茄果类',
        iconKey: 'tomato',
        searchTerms: ['番茄', '西红柿'],
        rankedTerms: [
          { term: '番茄', normalizedTerm: '番茄', type: 'canonical', weight: 100 },
          { term: '西红柿', normalizedTerm: '西红柿', type: 'alias', weight: 90 }
        ],
        activeRuleIds: ['tomato-cut-fridge-v1'],
        releaseId: 'food-kb-test.1'
      }
    ],
    searchTerms: [
      fixture.searchTerms.find((term) => term.termId === 'apple-alias-pingan-guo'),
      fixture.searchTerms.find((term) => term.termId === 'apple-canonical'),
      fixture.searchTerms.find((term) => term.termId === 'tomato-alias-xihongshi'),
      fixture.searchTerms.find((term) => term.termId === 'tomato-canonical')
    ],
    storageRules: [
      fixture.storageRules.find((rule) => rule.ruleId === 'apple-cut-fridge-v1'),
      fixture.storageRules.find((rule) => rule.ruleId === 'tomato-cut-fridge-v1')
    ]
  })
  assert.deepEqual(firstRelease.manifest, {
    releaseId: 'food-kb-test.1',
    generatedAt: '2026-07-22T00:00:00.000Z',
    previousReleaseId: 'food-kb-test.0',
    schemaVersion: '1.0.0',
    status: 'candidate',
    counts: {
      foods: 2,
      searchTerms: 4,
      storageRules: 2
    },
    snapshotChecksum: checksum(firstRelease.snapshot)
  })
  assert.deepEqual(Object.keys(firstRelease.snapshot), [
    'schemaVersion',
    'releaseId',
    'generatedAt',
    'previousReleaseId',
    'foods',
    'searchTerms',
    'storageRules'
  ])
  assert.deepEqual(Object.keys(firstRelease.manifest), [
    'releaseId',
    'generatedAt',
    'previousReleaseId',
    'schemaVersion',
    'status',
    'counts',
    'snapshotChecksum'
  ])
  assert.match(firstRelease.manifest.snapshotChecksum, /^[0-9a-f]{64}$/)
  assert.equal(
    stableJson({ '\u{10000}': { b: 2, a: 1 }, '\uE000': ['kept', { z: 1, a: 2 }] }),
    '{"":["kept",{"a":2,"z":1}],"𐀀":{"a":1,"b":2}}'
  )
})

test('is independent of each source collection order', () => {
  const expected = buildFoodKnowledgeRelease(createTwoFoodFixture(), RELEASE_OPTIONS)

  for (const collection of ['foods', 'searchTerms', 'storageRules']) {
    const fixture = createTwoFoodFixture()
    fixture[collection].reverse()

    assert.deepEqual(
      buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS),
      expected,
      collection
    )
  }
})

test('serializes object keys directly in Unicode code-point order', () => {
  const value = JSON.parse('{"2":"two","10":"ten","__proto__":"kept"}')

  assert.equal(
    stableJson(value),
    '{"10":"ten","2":"two","__proto__":"kept"}'
  )
})

test('rejects values outside the JSON data model', () => {
  for (const value of [undefined, () => {}, Symbol('unsupported'), 1n, NaN, Infinity, -Infinity]) {
    assert.throws(() => stableJson(value), /stableJson only supports JSON values/)
  }

  assert.throws(
    () => stableJson({ unsupported: undefined }),
    /stableJson only supports JSON values/
  )

  const sparseArray = new Array(1)
  assert.throws(
    () => stableJson(sparseArray),
    /stableJson only supports JSON values/
  )
})

test('excludes draft and inactive content from the runtime snapshot', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.foods.push({
    ...fixture.foods[0],
    foodId: 'draft-food',
    canonicalName: '草莓',
    category: '水果',
    subCategory: '浆果类',
    reviewStatus: 'draft'
  })
  fixture.searchTerms.push({
    ...fixture.searchTerms[0],
    termId: 'draft-food-canonical',
    foodId: 'draft-food',
    term: '草莓',
    normalizedTerm: '草莓',
    reviewStatus: 'draft'
  })
  fixture.foods.push({
    ...fixture.foods[0],
    foodId: 'inactive-food',
    canonicalName: '苹果',
    category: '水果',
    subCategory: '仁果类',
    status: 'inactive',
    reviewStatus: 'approved'
  })
  fixture.searchTerms.push({
    ...fixture.searchTerms[0],
    termId: 'inactive-food-canonical',
    foodId: 'inactive-food',
    term: '苹果',
    normalizedTerm: '苹果',
    reviewStatus: 'approved'
  })
  fixture.storageRules.push({
    ...fixture.storageRules[0],
    ruleId: 'inactive-food-cut-fridge-v1',
    foodId: 'inactive-food',
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding }))
  })

  const release = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)

  assert.deepEqual(release.snapshot.foods.map((food) => food.foodId), ['tomato'])
  assert.deepEqual(
    release.snapshot.searchTerms.map((term) => term.termId),
    ['tomato-alias-xihongshi', 'tomato-canonical']
  )
  assert.deepEqual(release.snapshot.storageRules.map((rule) => rule.ruleId), ['tomato-cut-fridge-v1'])
  assert.deepEqual(release.manifest.counts, {
    foods: 1,
    searchTerms: 2,
    storageRules: 1
  })
})

test('excludes draft terms and rules belonging to an approved active food', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.searchTerms.push({
    ...fixture.searchTerms[1],
    termId: 'tomato-draft-alias',
    term: '番茄草稿词',
    normalizedTerm: '番茄草稿词',
    weight: 110,
    reviewStatus: 'draft'
  })
  fixture.storageRules.push({
    ...fixture.storageRules[0],
    ruleId: 'tomato-cut-fridge-draft-v2',
    evidenceBindings: fixture.storageRules[0].evidenceBindings.map((binding) => ({ ...binding })),
    reviewStatus: 'draft'
  })

  const release = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)
  const tomato = release.snapshot.foods[0]

  assert.deepEqual(
    release.snapshot.searchTerms.map((term) => term.termId),
    ['tomato-alias-xihongshi', 'tomato-canonical']
  )
  assert.deepEqual(tomato.searchTerms, ['番茄', '西红柿'])
  assert.deepEqual(
    tomato.rankedTerms.map((term) => term.term),
    ['番茄', '西红柿']
  )
  assert.deepEqual(
    release.snapshot.storageRules.map((rule) => rule.ruleId),
    ['tomato-cut-fridge-v1']
  )
  assert.deepEqual(tomato.activeRuleIds, ['tomato-cut-fridge-v1'])
  assert.deepEqual(release.manifest.counts, {
    foods: 1,
    searchTerms: 2,
    storageRules: 1
  })
})

test('fails the whole build when validation fails', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.storageRules[0].babyDaysMax = 1

  assert.throws(
    () => buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS),
    /baby deadline requires direct baby evidence/
  )
})

test('refuses to produce an empty candidate release', () => {
  const fixture = createFoodKnowledgeFixture()
  fixture.foods[0].reviewStatus = 'draft'

  assert.throws(
    () => buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS),
    /at least one approved active food is required/
  )
})
