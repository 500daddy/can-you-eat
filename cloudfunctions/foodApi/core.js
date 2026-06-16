const { seedFoodBase } = require('./seedFoodBase')

const DAY_MS = 24 * 60 * 60 * 1000

const defaultSettings = {
  babyName: '小芽贝',
  babyBirthday: '2025-10-01',
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

function daysBetween(from, to) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS)
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

function storageText(storageMethod) {
  return {
    room: '常温保存',
    fridge: '冷藏保存',
    freezer: '冷冻保存'
  }[storageMethod] || '冷藏保存'
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

  if (!['finished', 'deleted'].includes(status)) {
    if (daysToBaby >= 2) status = 'baby_ok'
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
    note: record.note || {
      baby_today: '今天优先做熟食用',
      adult_only: '可留给大人结合状态判断',
      expired: '已超过参考期，建议谨慎处理',
      not_recommended: '如有出水或异味请处理',
      finished: '这条记录已处理'
    }[status] || '当前仍在宝宝建议期内'
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
    recognition_logs: []
  }

  return {
    async list(collection, predicate = () => true) {
      return clone(data[collection].filter(predicate))
    },
    async get(collection, predicate) {
      return clone(data[collection].find(predicate) || null)
    },
    async add(collection, doc) {
      const next = { ...clone(doc), _id: doc._id || doc.id || makeId(collection) }
      data[collection].push(next)
      return clone(next)
    },
    async update(collection, predicate, patch) {
      let updated = null
      data[collection] = data[collection].map((doc) => {
        if (!predicate(doc)) return doc
        updated = { ...doc, ...clone(patch) }
        return updated
      })
      return clone(updated)
    }
  }
}

function createFoodApi({ store, userId, today = formatDate(new Date()) }) {
  async function getSettings() {
    const settings = await store.get('user_settings', (item) => item.userId === userId)
    if (settings) return settings
    return store.add('user_settings', { id: `settings_${userId}`, userId, ...defaultSettings })
  }

  async function getFood(foodBaseId) {
    const food = await store.get('food_base', (item) => item.id === foodBaseId || item.name === foodBaseId)
    return food || seedFoodBase.find((item) => item.id === foodBaseId || item.name === foodBaseId) || seedFoodBase[0]
  }

  async function listCalculatedRecords(includeHandled = false) {
    const settings = await getSettings()
    const records = await store.list('user_food_records', (item) => item.userId === userId)
    const calculated = []
    for (const record of records) {
      const food = await getFood(record.foodBaseId || record.foodName)
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
        for (const food of seedFoodBase) {
          if (!existingIds.has(food.id)) {
            await store.add('food_base', { ...food, createdAt: now, updatedAt: now })
            inserted += 1
          }
        }
        return { ok: true, inserted, total: seedFoodBase.length }
      }

      if (action === 'searchFoods') {
        const foods = await store.list('food_base')
        const source = foods.length ? foods : seedFoodBase
        return { ok: true, data: source.filter((food) => matchFood(food, event.keyword)).slice(0, 20) }
      }

      if (action === 'addFoodRecord') {
        const food = await getFood(event.foodBaseId || event.foodName)
        const record = await store.add('user_food_records', {
          id: makeId('record'),
          userId,
          foodBaseId: food.id,
          customFoodName: '',
          purchaseDate: event.purchaseDate || today,
          storageMethod: event.storageMethod || food.defaultStorage || 'fridge',
          quantity: event.quantity || '',
          unit: event.unit || '',
          isBabyFood: event.isBabyFood !== false,
          note: event.note || '',
          createdAt: today,
          updatedAt: today
        })
        return { ok: true, data: calculateRecord({ record, food, settings: await getSettings(), today }) }
      }

      if (action === 'getFoodRecords') {
        return { ok: true, data: await listCalculatedRecords(false) }
      }

      if (action === 'getFoodDetail') {
        const records = await listCalculatedRecords(true)
        const record = records.find((item) => item.id === event.recordId || item._id === event.recordId)
        const base = record ? await getFood(record.foodBaseId) : null
        return { ok: true, data: { record, base } }
      }

      if (action === 'updateFoodRecord') {
        await store.update('user_food_records', (item) => item.userId === userId && (item.id === event.recordId || item._id === event.recordId), compactObject({
          purchaseDate: event.purchaseDate,
          storageMethod: event.storageMethod,
          quantity: event.quantity,
          unit: event.unit,
          isBabyFood: event.isBabyFood,
          note: event.note,
          status: undefined,
          updatedAt: today
        }))
        const detail = await this.handle({ action: 'getFoodDetail', recordId: event.recordId })
        return { ok: true, data: detail.data.record }
      }

      if (action === 'finishFoodRecord') {
        const finishAction = ['finished', 'adult_only', 'deleted'].includes(event.finishAction) ? event.finishAction : 'finished'
        await store.update('user_food_records', (item) => item.userId === userId && (item.id === event.recordId || item._id === event.recordId), {
          status: finishAction,
          updatedAt: today
        })
        const detail = await this.handle({ action: 'getFoodDetail', recordId: event.recordId })
        return { ok: true, data: detail.data.record }
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
        const settings = await getSettings()
        const data = await store.update('user_settings', (item) => item.userId === userId, compactObject({
          ...settings,
          ...event,
          action: undefined,
          userId,
          updatedAt: today
        }))
        return { ok: true, data }
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
