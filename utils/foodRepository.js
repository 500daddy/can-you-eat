const assets = require('./assets')
const { foodBase } = require('./foodBase')
const {
  calculateRecordState,
  groupRecords,
  sortRecordsByPriority,
  todayString
} = require('./foodRules')

const STORAGE_KEY = 'baby_food_records_v1'
const SETTINGS_KEY = 'baby_food_settings_v1'
const FEEDBACK_KEY = 'baby_food_feedback_v1'

const defaultSettings = {
  babyName: '小芽贝',
  babyBirthday: '2025-10-01',
  babyAgeText: '8个月12天',
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

function createMemoryFoodRepository(options = {}) {
  const today = options.today || todayString
  let counter = 0
  let feedbackCounter = 0
  let records = clone(options.seedRecords === undefined ? defaultSeedRecords : options.seedRecords)
  let feedbackList = clone(options.feedbackList || [])
  let settings = { ...defaultSettings, ...(options.settings || {}) }

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

  function normalizeRecord(raw) {
    const food = findFood(raw.foodBaseId || raw.foodId || raw.foodName || raw.name)
    const fallbackName = raw.customFoodName || raw.foodName || raw.name || '自定义食材'
    const storageMethod = raw.storageMethod || (food && food.defaultStorage) || 'fridge'
    const calculated = calculateRecordState({
      food: food || { id: 'custom', name: fallbackName, defaultStorage: storageMethod },
      purchaseDate: raw.purchaseDate,
      storageMethod,
      status: raw.status,
      today: currentToday(),
      remindBeforeDays: settings.remindBeforeDays
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
      icon: raw.icon || (food && food.icon) || assets.food.babyPuree,
      storageMethod,
      quantity: raw.quantity || '',
      unit: raw.unit || '',
      isBabyFood: raw.isBabyFood !== false,
      userNote: raw.note || '',
      note: raw.note || calculated.note,
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
      const food = findFood(id) || foodBase[0]
      return decorateFood(food)
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
      const raw = readRecords().find((item) => item.id === recordId) || readRecords()[0]
      if (!raw) {
        return { record: null, base: null }
      }
      const record = normalizeRecord(raw)
      const base = this.getFoodBaseById(record.foodBaseId)
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
      return normalizeRecord(updatedRecord || readRecords()[0])
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
    }
  }
}

let singleton

function createWxRepository() {
  const repo = createMemoryFoodRepository({
    seedRecords: hasWxStorage() ? (wx.getStorageSync(STORAGE_KEY) || defaultSeedRecords) : defaultSeedRecords,
    feedbackList: hasWxStorage() ? (wx.getStorageSync(FEEDBACK_KEY) || []) : [],
    settings: hasWxStorage() ? (wx.getStorageSync(SETTINGS_KEY) || defaultSettings) : defaultSettings
  })
  const originalAdd = repo.addFoodRecord.bind(repo)
  const originalUpdate = repo.updateFoodRecord.bind(repo)
  const originalFinish = repo.finishFoodRecord.bind(repo)
  const originalUpdateSettings = repo.updateSettings.bind(repo)
  const originalSubmitFeedback = repo.submitFeedback.bind(repo)

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

  return repo
}

function getFoodRepository() {
  if (!singleton) {
    singleton = createWxRepository()
  }
  return singleton
}

module.exports = {
  createMemoryFoodRepository,
  getFoodRepository
}
