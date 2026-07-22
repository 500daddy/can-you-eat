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

function normalizeAliases(aliases) {
  const values = Array.isArray(aliases)
    ? aliases
    : String(aliases || '').split(/[、,，]/)
  const aliasesByNormalizedTerm = new Map()

  for (const value of values) {
    if (value === null || value === undefined) {
      continue
    }
    const alias = String(value).trim()
    const normalizedTerm = alias.toLowerCase()
    if (alias && !aliasesByNormalizedTerm.has(normalizedTerm)) {
      aliasesByNormalizedTerm.set(normalizedTerm, alias)
    }
  }

  return [...aliasesByNormalizedTerm.values()]
}

function createSearchTerm(food, term, type) {
  const trimmedTerm = String(term).trim()
  const normalizedTerm = trimmedTerm.toLowerCase()

  return {
    termId: `${food.id}-${type}-${Buffer.from(normalizedTerm).toString('hex')}`,
    foodId: food.id,
    term: trimmedTerm,
    normalizedTerm,
    type,
    region: '',
    weight: type === 'canonical' ? 100 : 90,
    reviewStatus: 'legacy_unverified'
  }
}

function exportLegacyFoodKnowledge(foodBase) {
  const foods = []
  const searchTerms = []
  const storageCandidates = []
  const foodIdsByNormalizedTerm = new Map()

  for (const food of foodBase) {
    foods.push({
      foodId: food.id,
      canonicalName: food.name,
      category: food.category,
      subCategory: food.subCategory,
      defaultState: 'raw_whole',
      allergenTags: [],
      riskTags: [],
      iconKey: food.id,
      status: 'active',
      revision: 1,
      reviewStatus: 'legacy_unverified'
    })

    const terms = [
      createSearchTerm(food, food.name, 'canonical'),
      ...normalizeAliases(food.aliases).map((alias) => createSearchTerm(food, alias, 'alias'))
    ]

    for (const term of terms) {
      searchTerms.push(term)
      if (!foodIdsByNormalizedTerm.has(term.normalizedTerm)) {
        foodIdsByNormalizedTerm.set(term.normalizedTerm, new Set())
      }
      foodIdsByNormalizedTerm.get(term.normalizedTerm).add(food.id)
    }

    for (const storageMethod of ['room', 'fridge', 'freezer']) {
      if (!food[storageMethod] || typeof food[storageMethod] !== 'object') {
        continue
      }

      storageCandidates.push({
        candidateId: `${food.id}-${storageMethod}-legacy-v1`,
        foodId: food.id,
        foodState: 'raw_whole',
        storageMethod,
        referenceDateType: 'purchased_at',
        evidenceLevel: 'insufficient',
        migrationStatus: 'legacy_unverified',
        legacyPayload: food[storageMethod]
      })
    }
  }

  foods.sort((left, right) => compareCodePoints(left.foodId, right.foodId))
  searchTerms.sort((left, right) => compareCodePoints(left.termId, right.termId))
  storageCandidates.sort((left, right) => compareCodePoints(left.candidateId, right.candidateId))

  const termCollisions = [...foodIdsByNormalizedTerm.entries()]
    .map(([normalizedTerm, foodIds]) => ({
      normalizedTerm,
      foodIds: [...foodIds].sort(compareCodePoints)
    }))
    .filter((collision) => collision.foodIds.length > 1)
    .sort((left, right) => compareCodePoints(left.normalizedTerm, right.normalizedTerm))

  return {
    foods,
    searchTerms,
    storageCandidates,
    report: {
      foodCount: foods.length,
      searchTermCount: searchTerms.length,
      storageCandidateCount: storageCandidates.length,
      termCollisionCount: termCollisions.length,
      termCollisions,
      publishableFoodCount: 0,
      publishableRuleCount: 0
    }
  }
}

module.exports = {
  exportLegacyFoodKnowledge
}
