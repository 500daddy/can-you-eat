const { seedFoodBase } = require('./seedFoodBase')
const {
  ensureDefaultFamily,
  getActiveMembership,
  requirePermission
} = require('../familyApi/core')

const DAY_MS = 24 * 60 * 60 * 1000

const defaultSettings = {
  babyName: '小芽贝',
  babyAgeMonths: 8,
  babyAgeText: '8个月',
  babyGender: '',
  babyAvatarUrl: '',
  babyAllergens: [],
  babyMode: true,
  reminderEnabled: true,
  remindBeforeDays: 1,
  todayReminderEnabled: true,
  dailySummaryEnabled: true,
  dailySummaryTime: '08:00',
  subscribeMessageAccepted: false
}

const statusTextMap = {
  baby_ok: '建议给宝宝吃',
  baby_today: '建议今天给宝宝吃',
  adult_only: '可留给大人吃',
  not_recommended: '不建议给宝宝食用',
  expired: '不建议继续食用',
  finished: '已处理',
  deleted: '已删除'
}

const statusPriority = {
  baby_today: 0,
  adult_only: 1,
  not_recommended: 2,
  expired: 3,
  baby_ok: 4,
  finished: 5,
  deleted: 6
}

const manualStatusSet = new Set(['not_recommended', 'finished', 'deleted'])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function compactObject(value) {
  return Object.keys(value).reduce((result, key) => {
    if (value[key] !== undefined) {
      result[key] = value[key]
    }
    return result
  }, {})
}

function mergeWithUndefinedRemoval(target, patch) {
  const next = { ...target }
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) {
      delete next[key]
    } else {
      next[key] = patch[key]
    }
  }
  return next
}

function parseDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(value, days) {
  const date = parseDate(value)
  date.setDate(date.getDate() + Number(days || 0))
  return formatDate(date)
}

function addMonths(date, months) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const targetMonth = next.getMonth() + months
  next.setMonth(targetMonth)
  if (next.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    next.setDate(0)
  }
  return next
}

function daysBetween(from, to) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS)
}

function calculateBabyAgeText(birthday, currentDay) {
  if (!birthday) return ''
  const birth = parseDate(birthday)
  const current = parseDate(currentDay)
  if (current < birth) return '0天'
  let months = (current.getFullYear() - birth.getFullYear()) * 12 + current.getMonth() - birth.getMonth()
  let anchor = addMonths(birth, months)
  if (anchor > current) {
    months -= 1
    anchor = addMonths(birth, months)
  }
  const days = Math.max(0, Math.round((current.getTime() - anchor.getTime()) / DAY_MS))
  if (months <= 0) return `${daysBetween(birthday, currentDay)}天`
  return `${months}个月${days}天`
}

function calculateBabyAgeMonths(birthday, currentDay) {
  if (!birthday) return 0
  const birth = parseDate(birthday)
  const current = parseDate(currentDay)
  if (current < birth) return 0
  let months = (current.getFullYear() - birth.getFullYear()) * 12 + current.getMonth() - birth.getMonth()
  if (addMonths(birth, months) > current) {
    months -= 1
  }
  return Math.max(0, months)
}

function normalizeBabyAgeMonths(value) {
  const months = Math.max(0, Math.round(Number(value) || 0))
  if (months < 24) return months
  return Math.max(24, Math.round(months / 6) * 6)
}

function formatBabyAgeFromMonths(value) {
  const months = normalizeBabyAgeMonths(value)
  if (months < 24) return `${months}个月`
  const years = Math.floor(months / 12)
  return months % 12 >= 6 ? `${years}岁半` : `${years}岁`
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function aliasesOf(food) {
  return Array.isArray(food.aliases) ? food.aliases : []
}

function matchFood(food, keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return true
  return [food.name, food.category, food.subCategory, ...aliasesOf(food)]
    .some((value) => String(value || '').toLowerCase().includes(query))
}

function mergeFoodBaseWithSeed(foods) {
  const existingById = new Map((foods || []).map((food) => [food.id, food]))
  const seedIds = new Set(seedFoodBase.map((food) => food.id))
  const mergedSeed = seedFoodBase.map((food) => {
    const existing = existingById.get(food.id)
    return existing ? { ...existing, ...food } : food
  })
  const extraFoods = (foods || []).filter((food) => !seedIds.has(food.id))
  return [...mergedSeed, ...extraFoods]
}

function storageText(storageMethod) {
  return {
    room: '常温保存',
    fridge: '冷藏保存',
    freezer: '冷冻保存'
  }[storageMethod] || '冷藏保存'
}

function normalizeAllergens(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value || '').split(/[、,，\s]/).map((item) => item.trim()).filter(Boolean)
}

function foodAllergenText(food) {
  return [
    food && food.name,
    food && food.aliases,
    food && food.category,
    food && food.subCategory
  ].flatMap((item) => Array.isArray(item) ? item : String(item || '').split(/[、,，\s]/))
    .join(' ')
}

function getMatchedAllergens(food, babyAllergens) {
  const searchText = foodAllergenText(food)
  return normalizeAllergens(babyAllergens).filter((allergen) => searchText.includes(allergen))
}

function createCustomFood(name, storageMethod = 'fridge') {
  return {
    id: 'custom',
    name: name || '自定义食材',
    defaultStorage: storageMethod,
    icon: '/assets/sprites/food/food_jar.png',
    iconStatus: 'none',
    room: { babyDaysMax: 1, adultDaysMax: 2, text: '自定义食材请尽量短期保存。' },
    fridge: { babyDaysMax: 2, adultDaysMax: 3, text: '自定义食材按保守冷藏建议计算。' },
    freezer: { babyDaysMax: 15, adultDaysMax: 30, text: '自定义食材冷冻后仍建议尽快处理。' },
    storageTips: ['自定义食材请结合实际状态判断。'],
    spoilageSigns: ['异味', '发黏', '发霉', '明显出水']
  }
}

function calculateRecord({ record, food, settings, today }) {
  const storageMethod = record.storageMethod || food.defaultStorage || 'fridge'
  const range = food[storageMethod] || food[food.defaultStorage] || { babyDaysMax: 1, adultDaysMax: 2 }
  const babyExpireDate = addDays(record.purchaseDate, range.babyDaysMax)
  const adultExpireDate = addDays(record.purchaseDate, range.adultDaysMax)
  const remindDate = addDays(babyExpireDate, -(settings.remindBeforeDays || 1))
  const daysToBaby = daysBetween(today, babyExpireDate)
  const daysToAdult = daysBetween(today, adultExpireDate)
  let status = record.status
  const matchedAllergens = getMatchedAllergens(food, settings.babyAllergens)
  const riskNote = matchedAllergens.length ? `包含宝宝过敏源：${matchedAllergens.join('、')}，请不要给宝宝食用。` : ''

  if (status === 'adult_only') {
    status = daysToAdult >= 0 ? 'adult_only' : 'expired'
  } else if (!manualStatusSet.has(status)) {
    if (matchedAllergens.length) status = 'not_recommended'
    else if (daysToBaby >= 2) status = 'baby_ok'
    else if (daysToBaby >= 0) status = 'baby_today'
    else if (daysToAdult >= 0) status = 'adult_only'
    else status = 'expired'
  }

  return {
    ...record,
    foodId: food.id,
    foodBaseId: food.id,
    foodName: food.name,
    name: food.name,
    icon: food.icon,
    iconStatus: food.iconStatus || 'none',
    storageMethod,
    storageText: storageText(storageMethod),
    babyExpireDate,
    adultExpireDate,
    remindDate,
    savedDays: `${Math.max(0, daysBetween(record.purchaseDate, today))}天`,
    babyLeft: daysToBaby > 0 ? `剩${daysToBaby}天` : daysToBaby === 0 ? '今天到期' : '已超过宝宝建议期',
    adultLeft: daysToAdult > 0 ? `剩${daysToAdult}天` : daysToAdult === 0 ? '今天到期' : '已超过参考期',
    status,
    statusText: statusTextMap[status] || statusTextMap.baby_ok,
    group: {
      baby_today: '今天建议处理',
      adult_only: '可留给大人吃',
      not_recommended: '不建议继续食用',
      expired: '不建议继续食用',
      baby_ok: '新鲜食材',
      finished: '已处理',
      deleted: '已删除'
    }[status] || '新鲜食材',
    note: riskNote || record.riskNote || record.note || {
      baby_today: '今天优先做熟食用',
      adult_only: '可留给大人结合状态判断',
      expired: '已超过参考期，建议谨慎处理',
      not_recommended: '如有出水或异味请处理',
      finished: '这条记录已处理'
    }[status] || '当前仍在宝宝建议期内',
    riskNote
  }
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const priority = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99)
    if (priority) return priority
    return daysBetween('1970-01-01', a.babyExpireDate || '2999-12-31') -
      daysBetween('1970-01-01', b.babyExpireDate || '2999-12-31')
  })
}

function createMemoryStore() {
  const data = {
    food_base: [],
    user_food_records: [],
    user_settings: [],
    feedback: [],
    recognition_logs: [],
    families: [],
    family_members: [],
    family_invites: [],
    family_audit_logs: [],
    family_settings: [],
    purchase_plans: []
  }

  function collectionItems(collection) {
    if (!data[collection]) data[collection] = []
    return data[collection]
  }

  return {
    async list(collection, predicate = () => true) {
      return clone(collectionItems(collection).filter(predicate))
    },
    async get(collection, predicate) {
      return clone(collectionItems(collection).find(predicate) || null)
    },
    async add(collection, doc) {
      const next = { ...clone(doc), _id: doc._id || doc.id || makeId(collection) }
      collectionItems(collection).push(next)
      return clone(next)
    },
    async update(collection, predicate, patch) {
      let updated = null
      data[collection] = collectionItems(collection).map((doc) => {
        if (!predicate(doc)) return doc
        updated = mergeWithUndefinedRemoval(doc, patch)
        return updated
      })
      return clone(updated)
    }
  }
}

function createFoodApi({ store, userId, today = formatDate(new Date()) }) {
  async function getFamilyContext() {
    const existing = await getActiveMembership(store, userId)
    const context = existing
      ? { membership: existing }
      : await ensureDefaultFamily(store, userId, today)
    const membership = context.membership
    return {
      familyId: membership.familyId,
      membership
    }
  }

  async function writeAuditLog(input) {
    const { familyId, membership } = await getFamilyContext()
    return store.add('family_audit_logs', {
      id: makeId('audit'),
      familyId,
      actorOpenId: userId,
      actorName: input.actorName || membership.nickname || userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      before: input.before || null,
      after: input.after || null,
      createdAt: today
    })
  }

  async function getSettings() {
    const { familyId } = await getFamilyContext()
    const settings = await store.get('family_settings', (item) => item.familyId === familyId)
    if (settings) return settings
    return store.add('family_settings', { id: `settings_${familyId}`, familyId, ...defaultSettings })
  }

  async function withSettingsPermission(settings) {
    const { membership } = await getFamilyContext()
    return {
      ...settings,
      canEditBabySettings: membership.role === 'owner'
    }
  }

  async function getFood(foodBaseId) {
    const food = await store.get('food_base', (item) => item.id === foodBaseId || item.name === foodBaseId)
    return food || seedFoodBase.find((item) => item.id === foodBaseId || item.name === foodBaseId) || null
  }

  async function listCalculatedRecords(includeHandled = false) {
    const settings = await getSettings()
    const { familyId } = await getFamilyContext()
    const records = await store.list('user_food_records', (item) => item.familyId === familyId || (!item.familyId && item.userId === userId))
    const calculated = []
    for (const record of records) {
      const food = await getFood(record.foodBaseId || record.foodName) ||
        createCustomFood(record.customFoodName || record.foodName, record.storageMethod)
      calculated.push(calculateRecord({ record, food, settings, today }))
    }
    return sortRecords(calculated.filter((item) => includeHandled || !['finished', 'deleted'].includes(item.status)))
  }

  return {
    async handle(event = {}) {
      const action = event.action

      if (action === 'initFoodBase') {
        const existing = await store.list('food_base')
        const existingIds = new Set(existing.map((item) => item.id))
        const now = today
        let inserted = 0
        let updated = 0
        for (const food of seedFoodBase) {
          if (!existingIds.has(food.id)) {
            await store.add('food_base', { ...food, createdAt: now, updatedAt: now })
            inserted += 1
          } else {
            const patch = { ...food, updatedAt: now }
            delete patch.createdAt
            await store.update('food_base', (item) => item.id === food.id, patch)
            updated += 1
          }
        }
        return { ok: true, inserted, updated, total: seedFoodBase.length }
      }

      if (action === 'searchFoods') {
        const foods = await store.list('food_base')
        const source = mergeFoodBaseWithSeed(foods)
        return { ok: true, data: source.filter((food) => matchFood(food, event.keyword)).slice(0, 20) }
      }

      if (action === 'getFoodBase') {
        const foods = await store.list('food_base')
        return { ok: true, data: mergeFoodBaseWithSeed(foods) }
      }

      if (action === 'getFoodBaseById') {
        const food = await getFood(event.foodBaseId || event.id || event.name)
        return { ok: true, data: food }
      }

      if (action === 'getUserSettings') {
        const settings = await getSettings()
        let data = settings
        if (settings.babyAgeMonths !== undefined && settings.babyAgeMonths !== null) {
          const babyAgeMonths = normalizeBabyAgeMonths(settings.babyAgeMonths)
          data = { ...settings, babyAgeMonths, babyAgeText: formatBabyAgeFromMonths(babyAgeMonths) }
        } else if (settings.babyBirthday) {
          const babyAgeMonths = normalizeBabyAgeMonths(calculateBabyAgeMonths(settings.babyBirthday, today))
          data = { ...settings, babyAgeMonths, babyAgeText: calculateBabyAgeText(settings.babyBirthday, today) }
        }
        return { ok: true, data: await withSettingsPermission(data) }
      }

      if (action === 'addFoodRecord') {
        const { familyId } = await getFamilyContext()
        await requirePermission(store, userId, 'edit_food_records')
        const foundFood = await getFood(event.foodBaseId || event.foodName)
        const food = foundFood || createCustomFood(event.foodName, event.storageMethod)
        const record = await store.add('user_food_records', {
          id: makeId('record'),
          userId,
          familyId,
          foodBaseId: foundFood ? food.id : 'custom',
          customFoodName: foundFood ? '' : event.foodName || '自定义食材',
          purchaseDate: event.purchaseDate || today,
          storageMethod: event.storageMethod || food.defaultStorage || 'fridge',
          quantity: event.quantity || '',
          unit: event.unit || '',
          isBabyFood: event.isBabyFood !== false,
          note: event.note || '',
          ...(event.riskNote ? { riskNote: event.riskNote } : {}),
          ...(event.status === 'not_recommended' ? { status: 'not_recommended' } : {}),
          createdAt: today,
          updatedAt: today
        })
        await writeAuditLog({
          action: 'food_record_created',
          targetType: 'food_record',
          targetId: record.id,
          summary: `新增了「${food.name}」`,
          after: {
            foodBaseId: record.foodBaseId,
            customFoodName: record.customFoodName,
            purchaseDate: record.purchaseDate,
            storageMethod: record.storageMethod
          }
        })
        return { ok: true, data: calculateRecord({ record, food, settings: await getSettings(), today }) }
      }

      if (action === 'getFoodRecords') {
        return { ok: true, data: await listCalculatedRecords(false) }
      }

      if (action === 'getFoodDetail') {
        const records = await listCalculatedRecords(true)
        const record = records.find((item) => item.id === event.recordId || item._id === event.recordId)
        if (!record) {
          return { ok: true, data: { record: null, base: null } }
        }
        const base = record && record.foodBaseId !== 'custom' ? await getFood(record.foodBaseId) : null
        return { ok: true, data: { record, base } }
      }

      if (action === 'updateFoodRecord') {
        const { familyId } = await getFamilyContext()
        await requirePermission(store, userId, 'edit_food_records')
        const patch = compactObject({
          purchaseDate: event.purchaseDate,
          storageMethod: event.storageMethod,
          quantity: event.quantity,
          unit: event.unit,
          isBabyFood: event.isBabyFood,
          note: event.note,
          updatedAt: today
        })
        patch.status = undefined
        await store.update('user_food_records', (item) => item.familyId === familyId && (item.id === event.recordId || item._id === event.recordId), patch)
        await writeAuditLog({
          action: 'food_record_updated',
          targetType: 'food_record',
          targetId: event.recordId,
          summary: '编辑了这条食材记录',
          after: patch
        })
        const detail = await this.handle({ action: 'getFoodDetail', recordId: event.recordId })
        return { ok: true, data: detail.data.record }
      }

      if (action === 'finishFoodRecord') {
        const { familyId } = await getFamilyContext()
        await requirePermission(store, userId, 'edit_food_records')
        const finishAction = ['finished', 'adult_only', 'deleted'].includes(event.finishAction) ? event.finishAction : 'finished'
        await store.update('user_food_records', (item) => item.familyId === familyId && (item.id === event.recordId || item._id === event.recordId), {
          status: finishAction,
          updatedAt: today
        })
        await writeAuditLog({
          action: 'food_record_finished',
          targetType: 'food_record',
          targetId: event.recordId,
          summary: finishAction === 'deleted' ? '删除了这条食材记录' : '处理了这条食材记录',
          after: { status: finishAction }
        })
        const detail = await this.handle({ action: 'getFoodDetail', recordId: event.recordId })
        return { ok: true, data: detail.data.record }
      }

      if (action === 'getRecordAuditLogs') {
        const { familyId } = await getFamilyContext()
        const logs = await store.list('family_audit_logs', (item) => item.familyId === familyId && item.targetType === 'food_record' && item.targetId === event.recordId)
        return { ok: true, data: logs.slice(-10).reverse() }
      }

      if (action === 'getReminders') {
        const records = await listCalculatedRecords(false)
        return {
          ok: true,
          data: {
            today: records.filter((item) => item.status === 'baby_today'),
            soon: records.filter((item) => item.status === 'adult_only'),
            overdue: records.filter((item) => ['not_recommended', 'expired'].includes(item.status))
          }
        }
      }

      if (action === 'updateUserSettings') {
        const { familyId, membership } = await getFamilyContext()
        if (membership.role !== 'owner') {
          return { ok: false, error: '宝宝资料由家庭创建者维护' }
        }
        const settings = await getSettings()
        const nextSettings = compactObject({
          ...settings,
          ...event,
          action: undefined,
          familyId,
          updatedAt: today
        })
        if (nextSettings.babyBirthday) {
          nextSettings.babyAgeText = calculateBabyAgeText(nextSettings.babyBirthday, today)
          if (event.babyAgeMonths === undefined) {
            nextSettings.babyAgeMonths = undefined
          }
        }
        if (event.babyAgeMonths !== undefined && event.babyAgeMonths !== null) {
          nextSettings.babyAgeMonths = normalizeBabyAgeMonths(event.babyAgeMonths)
          nextSettings.babyAgeText = formatBabyAgeFromMonths(nextSettings.babyAgeMonths)
          nextSettings.babyBirthday = undefined
        }
        const data = await store.update('family_settings', (item) => item.familyId === familyId, nextSettings)
        await writeAuditLog({
          action: 'baby_settings_updated',
          targetType: 'baby_settings',
          targetId: familyId,
          summary: '修改了宝宝资料',
          after: nextSettings
        })
        return { ok: true, data: await withSettingsPermission(data) }
      }

      if (action === 'submitFeedback') {
        const feedback = await store.add('feedback', {
          id: makeId('feedback'),
          userId,
          type: event.type || 'general',
          content: event.content || '',
          foodName: event.foodName || '',
          imageUrl: event.imageUrl || '',
          status: 'pending',
          createdAt: today
        })
        return { ok: true, data: feedback }
      }

      if (action === 'logRecognition') {
        const log = await store.add('recognition_logs', {
          id: makeId('recognition'),
          userId,
          imageUrl: event.imageUrl || '',
          mockResult: event.mockResult || [],
          selectedFoodName: event.selectedFoodName || '',
          selectedFoodBaseId: event.selectedFoodBaseId || '',
          confidence: event.confidence || 0,
          createdAt: today
        })
        return { ok: true, data: log }
      }

      if (action === 'getRecognitionLogs') {
        const logs = await store.list('recognition_logs', (item) => item.userId === userId)
        return { ok: true, data: logs }
      }

      return { ok: false, error: `Unknown action: ${action || 'empty'}` }
    }
  }
}

module.exports = {
  createFoodApi,
  createMemoryStore,
  compactObject,
  seedFoodBase
}
