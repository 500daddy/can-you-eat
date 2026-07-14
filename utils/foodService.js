const {
  defaultSettings,
  FEEDBACK_KEY,
  getFoodRepository,
  PURCHASE_PLAN_KEY,
  resetFoodRepository,
  SETTINGS_KEY,
  STORAGE_KEY
} = require('./foodRepository')
const {
  calculateBabyAgeMonths,
  calculateBabyAgeText,
  formatBabyAgeFromMonths,
  normalizeBabyAgeMonths
} = require('./babyAge')
const { todayString } = require('./foodRules')
const { getRecommendationStage, sortFoodsForBabyAge } = require('./foodRecommendations')
const { decorateBabyProfile } = require('./babyProfile')

const LOGGED_OUT_KEY = 'baby_food_logged_out_v1'

function unwrapCloudResult(result) {
  const payload = result && result.result !== undefined ? result.result : result
  if (payload && payload.ok === false) {
    throw new Error(payload.error || 'foodApi failed')
  }
  return payload && payload.data !== undefined ? payload.data : payload
}

function readLoggedOutFlag(value) {
  if (typeof value === 'boolean') return value
  if (typeof getApp === 'function') {
    const app = getApp()
    if (app && app.globalData && typeof app.globalData.loggedOut === 'boolean') {
      return app.globalData.loggedOut
    }
  }
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    return Boolean(wx.getStorageSync(LOGGED_OUT_KEY))
  }
  return false
}

function markLoggedOut() {
  if (typeof getApp === 'function') {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.accountLoggedIn = false
      app.globalData.loggedOut = true
      app.globalData.useCloudFoodApi = false
    }
  }
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(LOGGED_OUT_KEY, true)
    wx.setStorageSync(STORAGE_KEY, [])
    wx.setStorageSync(PURCHASE_PLAN_KEY, [])
    wx.setStorageSync(FEEDBACK_KEY, [])
    wx.setStorageSync(SETTINGS_KEY, {
      ...defaultSettings,
      babyName: '',
      babyAgeMonths: null,
      babyAgeText: '',
      babyMode: false
    })
  }
}

function markLoggedIn() {
  if (typeof getApp === 'function') {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.accountLoggedIn = true
      app.globalData.loggedOut = false
      app.globalData.useCloudFoodApi = app.globalData.cloudFoodApiConfigured === true
    }
  }
  if (typeof wx !== 'undefined') {
    if (wx.removeStorageSync) {
      wx.removeStorageSync(LOGGED_OUT_KEY)
    } else if (wx.setStorageSync) {
      wx.setStorageSync(LOGGED_OUT_KEY, false)
    }
  }
}

function defaultCallCloud(data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud is unavailable'))
  }
  return wx.cloud.callFunction({
    name: 'foodApi',
    data
  }).then(unwrapCloudResult)
}

function resolveUseCloud(value) {
  if (typeof value === 'boolean') return value
  if (typeof getApp === 'function') {
    const app = getApp()
    return Boolean(app && app.globalData && app.globalData.useCloudFoodApi)
  }
  return false
}

function needsBabyProfilePrompt(settings) {
  return !settings || !settings.babyProfileUpdatedAt
}

function createFoodService(options = {}) {
  const repo = options.repo || getFoodRepository()
  const callCloud = options.callCloud || defaultCallCloud
  const today = options.today || todayString

  function currentToday() {
    return typeof today === 'function' ? today() : today
  }

  function isLoggedOut() {
    return readLoggedOutFlag(options.loggedOut)
  }

  function loggedOutSettings() {
    return withComputedBabyAge({
      ...defaultSettings,
      babyName: '',
      babyAgeMonths: null,
      babyAgeText: '',
      babyAvatarUrl: '',
      babyAllergens: [],
      babyMode: false,
      babyProfileUpdatedAt: undefined
    })
  }

  function withComputedBabyAge(settings) {
    if (!settings) return settings
    let nextSettings = settings
    if (settings.babyAgeMonths !== undefined && settings.babyAgeMonths !== null) {
      const babyAgeMonths = normalizeBabyAgeMonths(settings.babyAgeMonths)
      nextSettings = {
        ...settings,
        babyAgeMonths,
        babyAgeText: formatBabyAgeFromMonths(babyAgeMonths)
      }
      return decorateBabyProfile(nextSettings, repo.getAssets())
    }
    if (!settings.babyBirthday) return decorateBabyProfile(settings, repo.getAssets())
    const babyAgeMonths = normalizeBabyAgeMonths(calculateBabyAgeMonths(settings.babyBirthday, currentToday()))
    nextSettings = {
      ...settings,
      babyAgeMonths,
      babyAgeText: calculateBabyAgeText(settings.babyBirthday, currentToday())
    }
    return decorateBabyProfile(nextSettings, repo.getAssets())
  }

  function settingsAgeMonths(settings) {
    if (settings && settings.babyAgeMonths !== undefined && settings.babyAgeMonths !== null) {
      return normalizeBabyAgeMonths(settings.babyAgeMonths)
    }
    return calculateBabyAgeMonths(settings && settings.babyBirthday, currentToday())
  }

  async function cloudOrLocal(action, data, localHandler) {
    if (!isLoggedOut() && resolveUseCloud(options.useCloud)) {
      try {
        return await callCloud({ action, ...data })
      } catch (error) {
        if (options.warnOnCloudFallback !== false && typeof console !== 'undefined' && console.warn) {
          console.warn(`foodApi ${action} failed, fallback to local repository`, error)
        }
      }
    }
    return localHandler()
  }

  function statsFromRecords(records) {
    const activeRecords = records.filter((item) => item.status !== 'deleted')
    const todayCount = activeRecords.filter((item) => item.status === 'baby_today').length
    const soonCount = activeRecords.filter((item) => item.status === 'adult_only').length
    const overdueCount = activeRecords.filter((item) => ['not_recommended', 'expired'].includes(item.status)).length
    const finishedCount = activeRecords.filter((item) => item.status === 'finished').length
    const riskyTotal = todayCount + soonCount + overdueCount
    const score = riskyTotal ? Math.round((finishedCount / (finishedCount + riskyTotal)) * 100) : 100

    return [
      { label: '已记录食材', value: activeRecords.length },
      { label: '今日建议处理', value: todayCount },
      { label: '即将过期', value: soonCount },
      { label: '安心指数', value: `${score}%` }
    ]
  }

  return {
    getAssets() {
      return repo.getAssets()
    },

    getLocalRecordsSnapshot() {
      return repo.getAllRawRecords()
    },

    async mergeLocalRecords(records) {
      return callCloud({ action: 'mergeLocalRecords', records })
    },

    async initFoodBase() {
      return cloudOrLocal('initFoodBase', {}, async () => ({
        inserted: 0,
        total: (await repo.getFoodBase()).length,
        localOnly: true
      }))
    },

    async getFoodBase() {
      return cloudOrLocal('getFoodBase', {}, () => repo.getFoodBase())
    },

    async getFoodBaseById(id) {
      return cloudOrLocal('getFoodBaseById', { foodBaseId: id }, () => repo.getFoodBaseById(id))
        .then((result) => result || repo.getFoodBaseById(id))
    },

    async searchFoods(keyword = '') {
      return cloudOrLocal('searchFoods', { keyword }, () => repo.searchFoods(keyword))
    },

    async getRecommendedFoods() {
      const settings = await this.getSettings()
      const foodBase = await this.getFoodBase()
      const ageMonths = settingsAgeMonths(settings)
      return sortFoodsForBabyAge(foodBase, ageMonths, {
        babyAllergens: settings && settings.babyAllergens,
        today: currentToday()
      })
    },

    async getRecommendationSummary() {
      const settings = await this.getSettings()
      const ageMonths = settingsAgeMonths(settings)
      const stage = getRecommendationStage(ageMonths)
      return {
        babyAgeText: settings && settings.babyAgeText,
        stageLabel: stage.label,
        hint: stage.hint,
        needsBabyProfilePrompt: needsBabyProfilePrompt(settings)
      }
    },

    async addFoodRecord(input) {
      return cloudOrLocal('addFoodRecord', input, () => repo.addFoodRecord(input))
    },

    async addPurchasePlan(input) {
      return repo.addPurchasePlan(input)
    },

    async getPurchasePlans() {
      return repo.getPurchasePlans()
    },

    async finishPurchasePlan(input) {
      return repo.finishPurchasePlan(input)
    },

    async getFoodRecords() {
      return cloudOrLocal('getFoodRecords', {}, () => repo.getFoodRecords())
    },

    async getHomeSections() {
      const records = await this.getFoodRecords()
      const groups = [
        '今天建议处理',
        '可留给大人吃',
        '不建议继续食用',
        '新鲜食材'
      ]
      return groups
        .map((title) => ({
          title,
          items: records.filter((item) => item.group === title)
        }))
        .filter((section) => section.items.length)
    },

    async getFoodDetail(recordId) {
      return cloudOrLocal('getFoodDetail', { recordId }, () => repo.getFoodDetail(recordId))
    },

    async getRecordAuditLogs(recordId) {
      return cloudOrLocal('getRecordAuditLogs', { recordId }, () => [])
    },

    async updateFoodRecord(input) {
      return cloudOrLocal('updateFoodRecord', input, () => repo.updateFoodRecord(input))
    },

    async finishFoodRecord(input) {
      return cloudOrLocal('finishFoodRecord', {
        recordId: input.recordId,
        finishAction: input.action || input.finishAction || 'finished'
      }, () => repo.finishFoodRecord(input))
    },

    async getReminders() {
      return cloudOrLocal('getReminders', {}, () => repo.getReminders())
    },

    async getStats() {
      if (!isLoggedOut() && resolveUseCloud(options.useCloud)) {
        const records = await this.getFoodRecords()
        return statsFromRecords(records)
      }
      return repo.getStats()
    },

    async getSettings() {
      if (isLoggedOut()) return loggedOutSettings()
      const settings = await cloudOrLocal('getUserSettings', {}, () => repo.getSettings())
      return withComputedBabyAge(settings)
    },

    async updateSettings(input) {
      const hasAgeMonths = input.babyAgeMonths !== undefined && input.babyAgeMonths !== null
      const babyAgeMonths = hasAgeMonths ? normalizeBabyAgeMonths(input.babyAgeMonths) : undefined
      const nextInput = {
        ...input,
        babyAgeMonths: hasAgeMonths ? babyAgeMonths : input.babyAgeMonths,
        babyBirthday: hasAgeMonths ? undefined : input.babyBirthday,
        babyAgeText: hasAgeMonths
          ? formatBabyAgeFromMonths(babyAgeMonths)
          : (input.babyBirthday ? calculateBabyAgeText(input.babyBirthday, currentToday()) : input.babyAgeText)
      }
      const settings = await cloudOrLocal('updateUserSettings', nextInput, () => repo.updateSettings(nextInput))
      return withComputedBabyAge(settings)
    },

    async submitFeedback(input) {
      return cloudOrLocal('submitFeedback', input, () => repo.submitFeedback(input))
    }
  }
}

let singleton

function getFoodService() {
  if (!singleton) {
    singleton = createFoodService()
  }
  return singleton
}

function resetFoodService() {
  singleton = null
  resetFoodRepository()
}

module.exports = {
  createFoodService,
  getFoodService,
  LOGGED_OUT_KEY,
  markLoggedIn,
  markLoggedOut,
  resetFoodService,
  unwrapCloudResult
}
