const FOOD_STATES = ['raw_whole', 'washed', 'cut', 'opened', 'cooked', 'homemade_baby_food', 'thawed']
const CATEGORIES = ['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食']
const FOOD_STATUSES = ['active', 'inactive']
const REVIEW_STATUSES = ['draft', 'sourced', 'validated', 'approved']
const STORAGE_METHODS = ['room', 'fridge', 'freezer']
const REFERENCE_DATE_TYPES = ['purchased_at', 'washed_at', 'cut_at', 'opened_at', 'cooked_at', 'made_at', 'thawed_at']
const TERM_TYPES = ['canonical', 'alias', 'regional', 'pinyin', 'typo']
const EVIDENCE_LEVELS = ['direct', 'derived', 'insufficient']
const AUDIENCES = ['general', 'adult', 'baby']

const DEADLINE_FIELDS = ['babyDaysMin', 'babyDaysMax', 'adultDaysMin', 'adultDaysMax']
const CONDITION_FIELDS = ['foodId', 'foodState', 'storageMethod', 'packageState', 'temperatureMinC', 'temperatureMaxC']

function hasValue(value) {
  return value !== null && value !== undefined
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

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

function addDuplicateErrors(items, idField, collectionName, errors) {
  const seen = new Set()
  const duplicates = new Set()

  for (const item of items) {
    const id = item && item[idField]
    if (seen.has(id)) {
      duplicates.add(id)
    }
    seen.add(id)
  }

  for (const id of duplicates) {
    errors.add(`${collectionName}: duplicate ${idField} ${String(id)}`)
  }
}

function validateEnum(value, allowedValues, fieldName, prefix, errors) {
  if (!allowedValues.includes(value)) {
    errors.add(`${prefix}: invalid ${fieldName} ${String(value)}`)
  }
}

function rangeValue(value) {
  return value === undefined ? 'undefined' : String(value)
}

function validateDeadlineRange(rule, audience, errors) {
  const min = rule[`${audience}DaysMin`]
  const max = rule[`${audience}DaysMax`]
  const hasMin = hasValue(min)
  const hasMax = hasValue(max)

  if (!hasMin && !hasMax) {
    return false
  }

  const valid = hasMin &&
    hasMax &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    max >= 0 &&
    max >= min

  if (!valid) {
    errors.add(`storage_rules ${rule.ruleId}: invalid ${audience} deadline range ${rangeValue(min)}-${rangeValue(max)}`)
  }

  return true
}

function sameFields(left, right, fields) {
  return fields.every((field) => Object.is(left[field], right[field]))
}

function sameOptionalFields(left, right, fields) {
  return fields.every((field) => (
    (!hasValue(left[field]) && !hasValue(right[field])) ||
    Object.is(left[field], right[field])
  ))
}

function validateFoodKnowledge(input) {
  const foods = Array.isArray(input && input.foods) ? input.foods : []
  const searchTerms = Array.isArray(input && input.searchTerms) ? input.searchTerms : []
  const storageRules = Array.isArray(input && input.storageRules) ? input.storageRules : []
  const evidenceSources = Array.isArray(input && input.evidenceSources) ? input.evidenceSources : []
  const errors = new Set()

  addDuplicateErrors(foods, 'foodId', 'foods', errors)
  addDuplicateErrors(searchTerms, 'termId', 'search_terms', errors)
  addDuplicateErrors(storageRules, 'ruleId', 'storage_rules', errors)
  addDuplicateErrors(evidenceSources, 'sourceId', 'evidence_sources', errors)

  const foodIds = new Set(foods.map((food) => food.foodId))
  const activeSourceIds = new Set(
    evidenceSources
      .filter((source) => source.status === 'active')
      .map((source) => source.sourceId)
  )

  for (let index = 0; index < foods.length; index += 1) {
    const food = foods[index]
    const label = hasText(food.foodId) ? food.foodId : `#${index}`
    const prefix = `foods ${label}`

    for (const field of ['foodId', 'canonicalName', 'category', 'subCategory']) {
      if (!hasText(food[field])) {
        errors.add(`${prefix}: missing ${field}`)
      }
    }

    if (hasValue(food.category)) {
      validateEnum(food.category, CATEGORIES, 'category', prefix, errors)
    }
    validateEnum(food.defaultState, FOOD_STATES, 'defaultState', prefix, errors)
    validateEnum(food.status, FOOD_STATUSES, 'status', prefix, errors)
    validateEnum(food.reviewStatus, REVIEW_STATUSES, 'reviewStatus', prefix, errors)
  }

  for (let index = 0; index < searchTerms.length; index += 1) {
    const searchTerm = searchTerms[index]
    const label = hasText(searchTerm.termId) ? searchTerm.termId : `#${index}`
    const prefix = `search_terms ${label}`

    if (!foodIds.has(searchTerm.foodId)) {
      errors.add(`${prefix}: unknown foodId ${String(searchTerm.foodId)}`)
    }
    if (!hasText(searchTerm.term)) {
      errors.add(`${prefix}: missing term`)
    }
    if (!hasText(searchTerm.normalizedTerm)) {
      errors.add(`${prefix}: missing normalizedTerm`)
    }
    validateEnum(searchTerm.type, TERM_TYPES, 'type', prefix, errors)
    validateEnum(searchTerm.reviewStatus, REVIEW_STATUSES, 'reviewStatus', prefix, errors)
  }

  for (const rule of storageRules) {
    const prefix = `storage_rules ${String(rule.ruleId)}`

    if (!foodIds.has(rule.foodId)) {
      errors.add(`${prefix}: unknown foodId ${String(rule.foodId)}`)
    }
    validateEnum(rule.foodState, FOOD_STATES, 'foodState', prefix, errors)
    validateEnum(rule.storageMethod, STORAGE_METHODS, 'storageMethod', prefix, errors)
    validateEnum(rule.referenceDateType, REFERENCE_DATE_TYPES, 'referenceDateType', prefix, errors)
    validateEnum(rule.evidenceLevel, EVIDENCE_LEVELS, 'evidenceLevel', prefix, errors)
    validateEnum(rule.reviewStatus, REVIEW_STATUSES, 'reviewStatus', prefix, errors)

    const hasBabyDeadline = validateDeadlineRange(rule, 'baby', errors)
    const hasAdultDeadline = validateDeadlineRange(rule, 'adult', errors)
    const bindings = Array.isArray(rule.evidenceBindings) ? rule.evidenceBindings : []

    for (const binding of bindings) {
      if (!activeSourceIds.has(binding.sourceId)) {
        errors.add(`${prefix}: evidence source ${String(binding.sourceId)} is not active`)
      }
      validateEnum(binding.audience, AUDIENCES, 'evidence audience', prefix, errors)
    }

    if (
      ['derived', 'insufficient'].includes(rule.evidenceLevel) &&
      DEADLINE_FIELDS.some((field) => hasValue(rule[field]))
    ) {
      errors.add(`${prefix}: ${rule.evidenceLevel} rules cannot contain deadline fields`)
    }

    const activeBindings = bindings.filter((binding) => activeSourceIds.has(binding.sourceId))
    if (
      hasBabyDeadline &&
      !(rule.evidenceLevel === 'direct' && activeBindings.some((binding) => binding.audience === 'baby'))
    ) {
      errors.add(`${prefix}: baby deadline requires direct baby evidence`)
    }
    if (
      hasAdultDeadline &&
      !activeBindings.some((binding) => binding.audience === 'general' || binding.audience === 'adult')
    ) {
      errors.add(`${prefix}: adult deadline requires general or adult evidence`)
    }
  }

  const approvedRules = storageRules.filter((rule) => rule.reviewStatus === 'approved')
  for (let leftIndex = 0; leftIndex < approvedRules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < approvedRules.length; rightIndex += 1) {
      const left = approvedRules[leftIndex]
      const right = approvedRules[rightIndex]
      const sameConditions = sameOptionalFields(left, right, CONDITION_FIELDS)
      const sameGuidance = sameFields(left, right, [...DEADLINE_FIELDS, 'advice'])

      if (sameConditions && !sameGuidance) {
        const ruleIds = [String(left.ruleId), String(right.ruleId)].sort(compareCodePoints)
        errors.add(`storage_rules: conflicting rules ${ruleIds.join(',')}`)
      }
    }
  }

  const sortedErrors = Array.from(errors).sort(compareCodePoints)
  return {
    ok: sortedErrors.length === 0,
    errors: sortedErrors
  }
}

module.exports = {
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
}
