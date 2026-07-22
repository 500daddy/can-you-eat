const FOOD_STATES = Object.freeze(['raw_whole', 'washed', 'cut', 'opened', 'cooked', 'homemade_baby_food', 'thawed'])
const CATEGORIES = Object.freeze(['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食'])
const FOOD_STATUSES = Object.freeze(['active', 'inactive'])
const REVIEW_STATUSES = Object.freeze(['draft', 'sourced', 'validated', 'approved'])
const STORAGE_METHODS = Object.freeze(['room', 'fridge', 'freezer'])
const REFERENCE_DATE_TYPES = Object.freeze(['purchased_at', 'washed_at', 'cut_at', 'opened_at', 'cooked_at', 'made_at', 'thawed_at'])
const TERM_TYPES = Object.freeze(['canonical', 'alias', 'regional', 'pinyin', 'typo'])
const EVIDENCE_LEVELS = Object.freeze(['direct', 'derived', 'insufficient'])
const AUDIENCES = Object.freeze(['general', 'adult', 'baby'])

const FOOD_STATE_SET = new Set(FOOD_STATES)
const CATEGORY_SET = new Set(CATEGORIES)
const FOOD_STATUS_SET = new Set(FOOD_STATUSES)
const REVIEW_STATUS_SET = new Set(REVIEW_STATUSES)
const STORAGE_METHOD_SET = new Set(STORAGE_METHODS)
const REFERENCE_DATE_TYPE_SET = new Set(REFERENCE_DATE_TYPES)
const TERM_TYPE_SET = new Set(TERM_TYPES)
const EVIDENCE_LEVEL_SET = new Set(EVIDENCE_LEVELS)
const AUDIENCE_SET = new Set(AUDIENCES)

const DEADLINE_FIELDS = ['babyDaysMin', 'babyDaysMax', 'adultDaysMin', 'adultDaysMax']
const CONDITION_FIELDS = ['foodId', 'foodState', 'storageMethod', 'packageState', 'temperatureMinC', 'temperatureMaxC']

function hasValue(value) {
  return value !== null && value !== undefined
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
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

function addDuplicateErrors(entries, idField, collectionName, errors) {
  const seen = new Set()
  const duplicates = new Set()

  for (const { value } of entries) {
    const id = value[idField]
    if (!hasText(id)) {
      continue
    }
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
  if (!allowedValues.has(value)) {
    errors.add(`${prefix}: invalid ${fieldName} ${String(value)}`)
  }
}

function readCollection(input, field, errors) {
  if (!Array.isArray(input[field])) {
    errors.add(`${field}: expected array`)
    return []
  }

  return input[field]
}

function collectObjectEntries(items, collectionName, errors) {
  const entries = []

  for (let index = 0; index < items.length; index += 1) {
    if (!isPlainObject(items[index])) {
      errors.add(`${collectionName}[${index}]: expected object`)
      continue
    }
    entries.push({ value: items[index], index })
  }

  return entries
}

function rangeValue(value) {
  return value === undefined ? 'undefined' : String(value)
}

function validateDeadlineRange(rule, audience, prefix, errors) {
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
    errors.add(`${prefix}: invalid ${audience} deadline range ${rangeValue(min)}-${rangeValue(max)}`)
  }

  return true
}

function sameOptionalFields(left, right, fields) {
  return fields.every((field) => (
    (!hasValue(left[field]) && !hasValue(right[field])) ||
    Object.is(left[field], right[field])
  ))
}

function validateFoodKnowledge(input) {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ['input: expected object']
    }
  }

  const errors = new Set()
  const foods = readCollection(input, 'foods', errors)
  const searchTerms = readCollection(input, 'searchTerms', errors)
  const storageRules = readCollection(input, 'storageRules', errors)
  const evidenceSources = readCollection(input, 'evidenceSources', errors)
  const foodEntries = collectObjectEntries(foods, 'foods', errors)
  const searchTermEntries = collectObjectEntries(searchTerms, 'searchTerms', errors)
  const storageRuleEntries = collectObjectEntries(storageRules, 'storageRules', errors)
  const evidenceSourceEntries = collectObjectEntries(evidenceSources, 'evidenceSources', errors)

  addDuplicateErrors(foodEntries, 'foodId', 'foods', errors)
  addDuplicateErrors(searchTermEntries, 'termId', 'search_terms', errors)
  addDuplicateErrors(storageRuleEntries, 'ruleId', 'storage_rules', errors)
  addDuplicateErrors(evidenceSourceEntries, 'sourceId', 'evidence_sources', errors)

  const foodIds = new Set(
    foodEntries
      .map(({ value }) => value.foodId)
      .filter(hasText)
  )
  const activeSourceIds = new Set(
    evidenceSourceEntries
      .map(({ value }) => value)
      .filter((source) => hasText(source.sourceId) && source.status === 'active')
      .map((source) => source.sourceId)
  )

  for (const { value: food, index } of foodEntries) {
    const prefix = hasText(food.foodId) ? `foods ${food.foodId}` : `foods[${index}]`

    for (const field of ['foodId', 'canonicalName', 'category', 'subCategory']) {
      if (!hasText(food[field])) {
        errors.add(`${prefix}: missing ${field}`)
      }
    }

    if (hasValue(food.category)) {
      validateEnum(food.category, CATEGORY_SET, 'category', prefix, errors)
    }
    validateEnum(food.defaultState, FOOD_STATE_SET, 'defaultState', prefix, errors)
    validateEnum(food.status, FOOD_STATUS_SET, 'status', prefix, errors)
    validateEnum(food.reviewStatus, REVIEW_STATUS_SET, 'reviewStatus', prefix, errors)
  }

  for (const { value: searchTerm, index } of searchTermEntries) {
    const prefix = hasText(searchTerm.termId) ? `search_terms ${searchTerm.termId}` : `search_terms[${index}]`

    if (!hasText(searchTerm.termId)) {
      errors.add(`${prefix}: missing termId`)
    }
    if (!foodIds.has(searchTerm.foodId)) {
      errors.add(`${prefix}: unknown foodId ${String(searchTerm.foodId)}`)
    }
    if (!hasText(searchTerm.term)) {
      errors.add(`${prefix}: missing term`)
    }
    if (!hasText(searchTerm.normalizedTerm)) {
      errors.add(`${prefix}: missing normalizedTerm`)
    }
    validateEnum(searchTerm.type, TERM_TYPE_SET, 'type', prefix, errors)
    validateEnum(searchTerm.reviewStatus, REVIEW_STATUS_SET, 'reviewStatus', prefix, errors)
  }

  for (const { value: source, index } of evidenceSourceEntries) {
    const prefix = hasText(source.sourceId) ? `evidence_sources ${source.sourceId}` : `evidence_sources[${index}]`

    for (const field of ['sourceId', 'organization', 'title', 'url', 'sourceType', 'locale', 'applicableScope', 'status']) {
      if (!hasText(source[field])) {
        errors.add(`${prefix}: missing ${field}`)
      }
    }
    if (hasValue(source.status)) {
      validateEnum(source.status, FOOD_STATUS_SET, 'status', prefix, errors)
    }
  }

  for (const { value: rule, index: ruleIndex } of storageRuleEntries) {
    const prefix = hasText(rule.ruleId) ? `storage_rules ${rule.ruleId}` : `storage_rules[${ruleIndex}]`

    if (!hasText(rule.ruleId)) {
      errors.add(`${prefix}: missing ruleId`)
    }

    if (!foodIds.has(rule.foodId)) {
      errors.add(`${prefix}: unknown foodId ${String(rule.foodId)}`)
    }
    validateEnum(rule.foodState, FOOD_STATE_SET, 'foodState', prefix, errors)
    validateEnum(rule.storageMethod, STORAGE_METHOD_SET, 'storageMethod', prefix, errors)
    validateEnum(rule.referenceDateType, REFERENCE_DATE_TYPE_SET, 'referenceDateType', prefix, errors)
    validateEnum(rule.evidenceLevel, EVIDENCE_LEVEL_SET, 'evidenceLevel', prefix, errors)
    validateEnum(rule.reviewStatus, REVIEW_STATUS_SET, 'reviewStatus', prefix, errors)

    const hasBabyDeadline = validateDeadlineRange(rule, 'baby', prefix, errors)
    const hasAdultDeadline = validateDeadlineRange(rule, 'adult', prefix, errors)
    let bindings = []

    if (Array.isArray(rule.evidenceBindings)) {
      bindings = collectObjectEntries(
        rule.evidenceBindings,
        `storageRules[${ruleIndex}].evidenceBindings`,
        errors
      )
    } else if (hasValue(rule.evidenceBindings)) {
      errors.add(`storageRules[${ruleIndex}].evidenceBindings: expected array`)
    }

    for (const { value: binding, index: bindingIndex } of bindings) {
      const bindingPrefix = `storageRules[${ruleIndex}].evidenceBindings[${bindingIndex}]`

      if (!hasText(binding.sourceId)) {
        errors.add(`${bindingPrefix}: missing sourceId`)
      } else if (!activeSourceIds.has(binding.sourceId)) {
        errors.add(`${bindingPrefix}: evidence source ${binding.sourceId} is not active`)
      }
      validateEnum(binding.audience, AUDIENCE_SET, 'audience', bindingPrefix, errors)
      if (!hasText(binding.locator)) {
        errors.add(`${bindingPrefix}: missing locator`)
      }
    }

    if (
      ['derived', 'insufficient'].includes(rule.evidenceLevel) &&
      DEADLINE_FIELDS.some((field) => hasValue(rule[field]))
    ) {
      errors.add(`${prefix}: ${rule.evidenceLevel} rules cannot contain deadline fields`)
    }

    const activeBindings = bindings
      .map(({ value }) => value)
      .filter((binding) => (
        hasText(binding.sourceId) &&
        activeSourceIds.has(binding.sourceId) &&
        AUDIENCE_SET.has(binding.audience) &&
        hasText(binding.locator)
      ))
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

  const approvedRules = storageRuleEntries
    .map(({ value }) => value)
    .filter((rule) => hasText(rule.ruleId) && rule.reviewStatus === 'approved')
  for (let leftIndex = 0; leftIndex < approvedRules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < approvedRules.length; rightIndex += 1) {
      const left = approvedRules[leftIndex]
      const right = approvedRules[rightIndex]
      const sameConditions = sameOptionalFields(left, right, CONDITION_FIELDS)
      const sameGuidance = sameOptionalFields(left, right, DEADLINE_FIELDS) && Object.is(left.advice, right.advice)

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
