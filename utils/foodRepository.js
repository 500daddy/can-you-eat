const assets = require('./assets')
const { foodBase } = require('./foodBase')
const { resolveFoodIconStatus } = require('./foodIconPolicy')
const {
  calculateRecordState,
  groupRecords,
  sortRecordsByPriority,
  todayString
} = require('./foodRules')

const STORAGE_KEY = 'baby_food_records_v1'
const SETTINGS_KEY = 'baby_food_settings_v1'
const FEEDBACK_KEY = 'baby_food_feedback_v1'
const PURCHASE_PLAN_KEY = 'baby_food_purchase_plans_v1'

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

const defaultSeedRecords = [
  {
    id: 'record-broccoli',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '颗',
    isBabyFood: true
  },
  {
    id: 'record-carrot',
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '根',
    isBabyFood: true
  },
  {
    id: 'record-blueberry',
    foodBaseId: 'blueberry',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '盒',
    isBabyFood: true,
    status: 'not_recommended'
  },
  {
    id: 'record-pumpkin',
    foodBaseId: 'pumpkin',
    purchaseDate: '2026-06-11',
    storageMethod: 'room',
    quantity: 1,
    unit: '个',
    isBabyFood: true
  }
]

function hasWxStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeAliases(food) {
  return Array.isArray(food.aliases) ? food.aliases : String(food.aliases || '').split(/[、,，]/).filter(Boolean)
}

function findFood(idOrName) {
  return foodBase.find((item) => item.id === idOrName || item.name === idOrName) || null
}

function decorateFood(food) {
  return {
    ...food,
    aliases: normalizeAliases(food).join('、'),
    tips: food.storageTips || []
  }
}

function createCustomFood(name, storageMethod = 'fridge') {
  return {
    id: 'custom',
    name: name || '自定义食材',
    defaultStorage: storageMethod,
    icon: assets.food.customFood,
    iconStatus: 'none',
    room: { babyDaysMax: 1, adultDaysMax: 2 },
    fridge: { babyDaysMax: 2, adultDaysMax: 3 },
    freezer: { babyDaysMax: 15, adultDaysMax: 30 },
    storageTips: ['自定义食材请结合实际状态判断。']
  }
}

function storageLabel(storageMethod) {
  return {
    room: '常温',
    fridge: '冷藏',
    freezer: '冷冻'
  }[storageMethod] || '冷藏'
}

function createMemoryFoodRepository(options = {}) {
  const today = options.today || todayString
  let counter = 0
  let feedbackCounter = 0
  let purchasePlanCounter = 0
  let records = clone(options.seedRecords === undefined ? defaultSeedRecords : options.seedRecords)
  let feedbackList = clone(options.feedbackList || [])
  let purchasePlans = clone(options.purchasePlans || [])
  const inputSettings = options.settings || {}
  let settings = { ...defaultSettings, ...inputSettings }
  if (inputSettings.babyBirthday && inputSettings.babyAgeMonths === undefined) {
    delete settings.babyAgeMonths
  }

  function currentToday() {
    return typeof today === 'function' ? today() : today
  }

  function readRecords() {
    return records
  }

  function writeRecords(nextRecords) {
    records = clone(nextRecords)
  }

  function readFeedbackList() {
    return feedbackList
  }

  function writeFeedbackList(nextList) {
    feedbackList = clone(nextList)
  }

  function readPurchasePlans() {
    return purchasePlans
  }

  function writePurchasePlans(nextPlans) {
    purchasePlans = clone(nextPlans)
  }

  function normalizePurchasePlan(raw) {
    const food = findFood(raw.foodBaseId || raw.foodId || raw.foodName || raw.name)
    const fallbackName = raw.customFoodName || raw.foodName || raw.name || '自定义食材'
    const storageMethod = raw.storageMethod || (food && food.defaultStorage) || ''
    return {
      ...raw,
      id: raw.id,
      foodId: food ? food.id : raw.foodBaseId || 'custom',
      foodBaseId: food ? food.id : raw.foodBaseId || 'custom',
      foodName: food ? food.name : fallbackName,
      name: food ? food.name : fallbackName,
      customFoodName: food ? '' : fallbackName,
      icon: raw.icon || (food && food.icon) || assets.food.customFood,
      iconStatus: food ? food.iconStatus : resolveFoodIconStatus(raw),
      plannedDate: raw.plannedDate || currentToday(),
      storageMethod,
      storageText: storageMethod ? `${storageLabel(storageMethod)}保存` : '保存方式待确认',
      quantity: raw.quantity || '',
      unit: raw.unit || '',
      status: raw.status || 'active',
      createdAt: raw.createdAt || currentToday(),
      updatedAt: raw.updatedAt || raw.createdAt || currentToday()
    }
  }

  function normalizeRecord(raw) {
    const food = findFood(raw.foodBaseId || raw.foodId || raw.foodName || raw.name)
    const fallbackName = raw.customFoodName || raw.foodName || raw.name || '自定义食材'
    const storageMethod = raw.storageMethod || (food && food.defaultStorage) || 'fridge'
    const calculated = calculateRecordState({
      food: food || createCustomFood(fallbackName, storageMethod),
      purchaseDate: raw.purchaseDate,
      storageMethod,
      status: raw.status,
      today: currentToday(),
      remindBeforeDays: settings.remindBeforeDays,
      babyAllergens: settings.babyAllergens
    })
    const foodName = food ? food.name : fallbackName

    return {
      ...raw,
      ...calculated,
      id: raw.id,
      foodId: food ? food.id : raw.foodBaseId || 'custom',
      foodBaseId: food ? food.id : raw.foodBaseId || 'custom',
      foodName,
      name: foodName,
      customFoodName: food ? '' : fallbackName,
      icon: raw.icon || (food && food.icon) || assets.food.customFood,
      iconStatus: food ? food.iconStatus : resolveFoodIconStatus(raw),
      storageMethod,
      quantity: raw.quantity || '',
      unit: raw.unit || '',
      isBabyFood: raw.isBabyFood !== false,
      userNote: raw.note || '',
      note: calculated.riskNote || raw.riskNote || raw.note || calculated.note,
      updatedAt: raw.updatedAt || raw.createdAt || currentToday()
    }
  }

  function activeRecords() {
    return readRecords()
      .map(normalizeRecord)
      .filter((item) => !['finished', 'deleted'].includes(item.status))
  }

  return {
    getAssets() {
      return assets
    },

    getFoodBase() {
      return foodBase.map(decorateFood)
    },

    getFoodBaseById(id) {
      const food = findFood(id)
      return food ? decorateFood(food) : null
    },

    searchFoods(keyword = '') {
      const query = String(keyword).trim().toLowerCase()
      const source = query
        ? foodBase.filter((item) => {
          const aliases = normalizeAliases(item)
          return [
            item.name,
            item.category,
            item.subCategory,
            ...aliases
          ].some((value) => String(value || '').toLowerCase().includes(query))
        })
        : foodBase.slice(0, 20)
      return source.slice(0, 20).map(decorateFood)
    },

    addFoodRecord(input) {
      const food = findFood(input.foodBaseId || input.foodName || input.name)
      const id = input.id || `record-${Date.now()}-${counter += 1}`
      const record = {
        id,
        foodBaseId: food ? food.id : 'custom',
        customFoodName: food ? '' : input.foodName || input.name,
        purchaseDate: input.purchaseDate || currentToday(),
        storageMethod: input.storageMethod || (food && food.defaultStorage) || 'fridge',
        quantity: input.quantity || '',
        unit: input.unit || '',
        isBabyFood: input.isBabyFood !== false,
        note: input.note || '',
        ...(input.riskNote ? { riskNote: input.riskNote } : {}),
        ...(input.status === 'not_recommended' ? { status: 'not_recommended' } : {}),
        createdAt: currentToday(),
        updatedAt: currentToday()
      }
      writeRecords([record, ...readRecords()])
      return normalizeRecord(record)
    },

    getFoodRecords() {
      return sortRecordsByPriority(activeRecords())
    },

    getAllRawRecords() {
      return clone(readRecords())
    },

    getHomeSections() {
      return groupRecords(this.getFoodRecords())
    },

    getFoodDetail(recordId) {
      const raw = readRecords().find((item) => item.id === recordId)
      if (!raw) {
        return { record: null, base: null }
      }
      const record = normalizeRecord(raw)
      const base = record.foodBaseId === 'custom' ? null : this.getFoodBaseById(record.foodBaseId)
      return { record, base }
    },

    updateFoodRecord(input) {
      let updatedRecord = null
      const nextRecords = readRecords().map((item) => {
        if (item.id !== input.recordId) return item
        updatedRecord = {
          ...item,
          purchaseDate: input.purchaseDate || item.purchaseDate,
          storageMethod: input.storageMethod || item.storageMethod,
          quantity: input.quantity === undefined ? item.quantity : input.quantity,
          unit: input.unit === undefined ? item.unit : input.unit,
          isBabyFood: input.isBabyFood === undefined ? item.isBabyFood : input.isBabyFood,
          note: input.note === undefined ? item.note : input.note,
          status: undefined,
          updatedAt: currentToday()
        }
        return updatedRecord
      })
      writeRecords(nextRecords)
      return updatedRecord ? normalizeRecord(updatedRecord) : null
    },

    finishFoodRecord({ recordId, action = 'finished' }) {
      const allowed = ['finished', 'adult_only', 'deleted']
      const nextAction = allowed.includes(action) ? action : 'finished'
      const nextRecords = readRecords().map((item) => (
        item.id === recordId
          ? { ...item, status: nextAction, updatedAt: currentToday() }
          : item
      ))
      writeRecords(nextRecords)
      return this.getFoodDetail(recordId).record
    },

    getReminders() {
      const list = this.getFoodRecords()
      return {
        today: list.filter((item) => item.status === 'baby_today'),
        soon: list.filter((item) => item.status === 'adult_only'),
        overdue: list.filter((item) => ['not_recommended', 'expired'].includes(item.status))
      }
    },

    getStats() {
      const list = this.getFoodRecords()
      const reminders = this.getReminders()
      const riskyTotal = reminders.today.length + reminders.soon.length + reminders.overdue.length
      const finishedCount = readRecords().filter((item) => item.status === 'finished').length
      const score = riskyTotal ? Math.round((finishedCount / (finishedCount + riskyTotal)) * 100) : 100
      return [
        { label: '已记录食材', value: readRecords().filter((item) => item.status !== 'deleted').length },
        { label: '今日建议处理', value: reminders.today.length },
        { label: '即将过期', value: reminders.soon.length },
        { label: '安心指数', value: `${score}%` }
      ]
    },

    getSettings() {
      return { ...settings }
    },

    updateSettings(nextSettings) {
      settings = { ...settings, ...nextSettings }
      return this.getSettings()
    },

    submitFeedback(input) {
      const feedback = {
        id: input.id || `feedback-${Date.now()}-${feedbackCounter += 1}`,
        type: input.type || 'idea',
        content: input.content || '',
        contact: input.contact || '',
        status: input.status || 'pending',
        createdAt: input.createdAt || currentToday()
      }
      writeFeedbackList([feedback, ...readFeedbackList()])
      return clone(feedback)
    },

    getFeedbackList() {
      return clone(readFeedbackList())
    },

    addPurchasePlan(input) {
      const food = findFood(input.foodBaseId || input.foodName || input.name)
      const id = input.id || `purchase-plan-${Date.now()}-${purchasePlanCounter += 1}`
      const plan = {
        id,
        foodBaseId: food ? food.id : 'custom',
        customFoodName: food ? '' : input.foodName || input.name,
        plannedDate: input.plannedDate || currentToday(),
        storageMethod: input.storageMethod || (food && food.defaultStorage) || '',
        quantity: input.quantity || '',
        unit: input.unit || '',
        status: input.status || 'active',
        createdAt: input.createdAt || currentToday(),
        updatedAt: input.updatedAt || currentToday()
      }
      writePurchasePlans([plan, ...readPurchasePlans()])
      return normalizePurchasePlan(plan)
    },

    getPurchasePlans() {
      return readPurchasePlans()
        .map(normalizePurchasePlan)
        .filter((item) => item.status === 'active')
        .sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)))
    },

    getAllRawPurchasePlans() {
      return clone(readPurchasePlans())
    },

    finishPurchasePlan({ planId, action = 'purchased' }) {
      const allowed = ['purchased', 'deleted']
      const nextAction = allowed.includes(action) ? action : 'purchased'
      let updatedPlan = null
      const nextPlans = readPurchasePlans().map((item) => {
        if (item.id !== planId) return item
        updatedPlan = { ...item, status: nextAction, updatedAt: currentToday() }
        return updatedPlan
      })
      writePurchasePlans(nextPlans)
      return updatedPlan ? normalizePurchasePlan(updatedPlan) : null
    }
  }
}

let singleton

function createWxRepository() {
  const repo = createMemoryFoodRepository({
    seedRecords: hasWxStorage() ? (wx.getStorageSync(STORAGE_KEY) || defaultSeedRecords) : defaultSeedRecords,
    feedbackList: hasWxStorage() ? (wx.getStorageSync(FEEDBACK_KEY) || []) : [],
    purchasePlans: hasWxStorage() ? (wx.getStorageSync(PURCHASE_PLAN_KEY) || []) : [],
    settings: hasWxStorage() ? (wx.getStorageSync(SETTINGS_KEY) || defaultSettings) : defaultSettings
  })
  const originalAdd = repo.addFoodRecord.bind(repo)
  const originalUpdate = repo.updateFoodRecord.bind(repo)
  const originalFinish = repo.finishFoodRecord.bind(repo)
  const originalUpdateSettings = repo.updateSettings.bind(repo)
  const originalSubmitFeedback = repo.submitFeedback.bind(repo)
  const originalAddPurchasePlan = repo.addPurchasePlan.bind(repo)
  const originalFinishPurchasePlan = repo.finishPurchasePlan.bind(repo)

  repo.addFoodRecord = function addFoodRecord(input) {
    const result = originalAdd(input)
    if (hasWxStorage()) wx.setStorageSync(STORAGE_KEY, repo.getAllRawRecords())
    return result
  }

  repo.finishFoodRecord = function finishFoodRecord(input) {
    const result = originalFinish(input)
    if (hasWxStorage()) wx.setStorageSync(STORAGE_KEY, repo.getAllRawRecords())
    return result
  }

  repo.updateFoodRecord = function updateFoodRecord(input) {
    const result = originalUpdate(input)
    if (hasWxStorage()) wx.setStorageSync(STORAGE_KEY, repo.getAllRawRecords())
    return result
  }

  repo.updateSettings = function updateSettings(input) {
    const result = originalUpdateSettings(input)
    if (hasWxStorage()) wx.setStorageSync(SETTINGS_KEY, result)
    return result
  }

  repo.submitFeedback = function submitFeedback(input) {
    const result = originalSubmitFeedback(input)
    if (hasWxStorage()) wx.setStorageSync(FEEDBACK_KEY, repo.getFeedbackList())
    return result
  }

  repo.addPurchasePlan = function addPurchasePlan(input) {
    const result = originalAddPurchasePlan(input)
    if (hasWxStorage()) wx.setStorageSync(PURCHASE_PLAN_KEY, repo.getAllRawPurchasePlans())
    return result
  }

  repo.finishPurchasePlan = function finishPurchasePlan(input) {
    const result = originalFinishPurchasePlan(input)
    if (hasWxStorage()) wx.setStorageSync(PURCHASE_PLAN_KEY, repo.getAllRawPurchasePlans())
    return result
  }

  return repo
}

function getFoodRepository() {
  if (!singleton) {
    singleton = createWxRepository()
  }
  return singleton
}

function resetFoodRepository() {
  singleton = null
}

module.exports = {
  createMemoryFoodRepository,
  getFoodRepository,
  resetFoodRepository,
  defaultSettings,
  STORAGE_KEY,
  SETTINGS_KEY,
  FEEDBACK_KEY,
  PURCHASE_PLAN_KEY
}
