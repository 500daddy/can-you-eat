const { createHash } = require('node:crypto')

const { validateFoodKnowledge } = require('./foodKnowledgeSchema')

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0))
  const rightPoints = Array.from(right, (character) => character.codePointAt(0))
  const length = Math.min(leftPoints.length, rightPoints.length)

  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index]
    }
  }

  return leftPoints.length - rightPoints.length
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  return Object.keys(value)
    .sort(compareCodePoints)
    .reduce((sorted, key) => {
      sorted[key] = sortObjectKeys(value[key])
      return sorted
    }, {})
}

function stableJson(value) {
  return JSON.stringify(sortObjectKeys(value))
}

function checksum(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`
}

function buildFoodKnowledgeRelease(input, options) {
  const validation = validateFoodKnowledge(input)
  if (!validation.ok) {
    throw new Error(`food knowledge validation failed:\n${validation.errors.join('\n')}`)
  }

  if (!options || !options.releaseId) {
    throw new Error('options.releaseId is required')
  }
  if (!options.generatedAt) {
    throw new Error('options.generatedAt is required')
  }

  const approvedFoods = input.foods
    .filter((food) => food.reviewStatus === 'approved' && food.status === 'active')
    .sort((left, right) => compareCodePoints(left.foodId, right.foodId))

  if (approvedFoods.length === 0) {
    throw new Error('at least one approved active food is required')
  }

  const approvedFoodIds = new Set(approvedFoods.map((food) => food.foodId))
  const approvedTerms = input.searchTerms
    .filter((term) => term.reviewStatus === 'approved' && approvedFoodIds.has(term.foodId))
    .sort((left, right) => (
      right.weight - left.weight || compareCodePoints(left.termId, right.termId)
    ))
  const approvedRules = input.storageRules
    .filter((rule) => rule.reviewStatus === 'approved' && approvedFoodIds.has(rule.foodId))
    .sort((left, right) => compareCodePoints(left.ruleId, right.ruleId))

  const foods = approvedFoods.map((food) => {
    const foodTerms = approvedTerms.filter((term) => term.foodId === food.foodId)
    const searchTerms = [...new Set(foodTerms.map((term) => term.term))]
    const rankedTerms = foodTerms.map((term) => ({
      term: term.term,
      normalizedTerm: term.normalizedTerm,
      type: term.type,
      weight: term.weight
    }))
    const activeRuleIds = approvedRules
      .filter((rule) => rule.foodId === food.foodId)
      .map((rule) => rule.ruleId)

    return {
      foodId: food.foodId,
      canonicalName: food.canonicalName,
      normalizedCanonicalName: food.canonicalName.trim().toLowerCase(),
      category: food.category,
      subCategory: food.subCategory,
      iconKey: food.iconKey ?? '',
      searchTerms,
      rankedTerms,
      activeRuleIds,
      releaseId: options.releaseId
    }
  })

  const snapshot = {
    releaseId: options.releaseId,
    generatedAt: options.generatedAt,
    foods,
    storageRules: approvedRules
  }
  const manifest = {
    releaseId: options.releaseId,
    previousReleaseId: options.previousReleaseId ?? null,
    status: 'release_candidate',
    generatedAt: options.generatedAt,
    foodCount: foods.length,
    searchTermCount: approvedTerms.length,
    ruleCount: approvedRules.length,
    sourceCount: input.evidenceSources.filter((source) => source.status === 'active').length,
    snapshotChecksum: checksum(snapshot)
  }

  return { manifest, snapshot }
}

module.exports = {
  buildFoodKnowledgeRelease,
  checksum,
  stableJson
}
