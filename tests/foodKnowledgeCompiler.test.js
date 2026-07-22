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

test('builds one deterministic published search document', () => {
  const fixture = createFoodKnowledgeFixture()

  const firstRelease = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)
  const secondRelease = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)

  assert.deepEqual(firstRelease, secondRelease)
  assert.equal(firstRelease.manifest.foodCount, 1)
  assert.equal(firstRelease.snapshot.foods[0].foodId, 'tomato')
  assert.deepEqual(firstRelease.snapshot.foods[0].searchTerms, ['番茄', '西红柿'])
  assert.deepEqual(firstRelease.snapshot.foods[0].activeRuleIds, ['tomato-cut-fridge-v1'])
  assert.match(firstRelease.manifest.snapshotChecksum, /^sha256:[0-9a-f]{64}$/)
  assert.equal(firstRelease.manifest.snapshotChecksum, checksum(firstRelease.snapshot))
  assert.equal(
    stableJson({ '\u{10000}': { b: 2, a: 1 }, '\uE000': ['kept', { z: 1, a: 2 }] }),
    '{"":["kept",{"a":2,"z":1}],"𐀀":{"a":1,"b":2}}'
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

  const release = buildFoodKnowledgeRelease(fixture, RELEASE_OPTIONS)

  assert.deepEqual(release.snapshot.foods.map((food) => food.foodId), ['tomato'])
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
