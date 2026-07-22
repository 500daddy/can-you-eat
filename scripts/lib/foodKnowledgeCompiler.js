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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function stableJson(value) {
  const ancestors = new Set()

  function serialize(current) {
    if (current === null) {
      return 'null'
    }

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new TypeError('stableJson only supports JSON values')
      }
      return JSON.stringify(current)
    }

    if (typeof current === 'string' || typeof current === 'boolean') {
      return JSON.stringify(current)
    }

    if (typeof current !== 'object') {
      throw new TypeError('stableJson only supports JSON values')
    }

    if (!Array.isArray(current) && !isPlainObject(current)) {
      throw new TypeError('stableJson only supports JSON values')
    }
    if (ancestors.has(current)) {
      throw new TypeError('stableJson only supports JSON values')
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const items = []
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.hasOwn(current, index)) {
            throw new TypeError('stableJson only supports JSON values')
          }
          items.push(serialize(current[index]))
        }
        return `[${items.join(',')}]`
      }

      const members = Object.keys(current)
        .sort(compareCodePoints)
        .map((key) => `${JSON.stringify(key)}:${serialize(current[key])}`)
      return `{${members.join(',')}}`
    } finally {
      ancestors.delete(current)
    }
  }

  return serialize(value)
}

function checksum(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function isNonEmptyTrimmedString(value) {
  return typeof value === 'string' && value !== '' && value === value.trim()
}

function isCanonicalUtcIso8601(value) {
  if (typeof value !== 'string') {
    return false
  }

  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function buildFoodKnowledgeRelease(input, options) {
  const validation = validateFoodKnowledge(input)
  if (!validation.ok) {
    throw new Error(`food knowledge validation failed:\n${validation.errors.join('\n')}`)
  }

  const releaseId = options?.releaseId
  const generatedAt = options?.generatedAt
  const previousReleaseId = options?.previousReleaseId ?? null
  if (!isNonEmptyTrimmedString(releaseId)) {
    throw new Error('options.releaseId must be a non-empty trimmed string')
  }
  if (!isCanonicalUtcIso8601(generatedAt)) {
    throw new Error('options.generatedAt must be a canonical UTC ISO 8601 string')
  }
  if (previousReleaseId !== null && !isNonEmptyTrimmedString(previousReleaseId)) {
    throw new Error('options.previousReleaseId must be a non-empty trimmed string')
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
    .sort((left, right) => compareCodePoints(left.termId, right.termId))
  const approvedRules = input.storageRules
    .filter((rule) => rule.reviewStatus === 'approved' && approvedFoodIds.has(rule.foodId))
    .sort((left, right) => compareCodePoints(left.ruleId, right.ruleId))

  const foods = approvedFoods.map((food) => {
    const foodTerms = approvedTerms
      .filter((term) => term.foodId === food.foodId)
      .sort((left, right) => (
        right.weight - left.weight || compareCodePoints(left.termId, right.termId)
      ))
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
      releaseId
    }
  })

  const snapshot = {
    schemaVersion: '1.0.0',
    releaseId,
    generatedAt,
    previousReleaseId,
    foods,
    searchTerms: approvedTerms,
    storageRules: approvedRules
  }
  const manifest = {
    releaseId,
    generatedAt,
    previousReleaseId,
    schemaVersion: '1.0.0',
    status: 'candidate',
    counts: {
      foods: foods.length,
      searchTerms: approvedTerms.length,
      storageRules: approvedRules.length
    },
    snapshotChecksum: checksum(snapshot)
  }

  return { manifest, snapshot }
}

module.exports = {
  buildFoodKnowledgeRelease,
  checksum,
  stableJson
}
