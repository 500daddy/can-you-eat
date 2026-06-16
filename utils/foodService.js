const { getFoodRepository } = require('./foodRepository')

function unwrapCloudResult(result) {
  const payload = result && result.result !== undefined ? result.result : result
  if (payload && payload.ok === false) {
    throw new Error(payload.error || 'foodApi failed')
  }
  return payload && payload.data !== undefined ? payload.data : payload
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

function createFoodService(options = {}) {
  const repo = options.repo || getFoodRepository()
  const callCloud = options.callCloud || defaultCallCloud

  async function cloudOrLocal(action, data, localHandler) {
    if (resolveUseCloud(options.useCloud)) {
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

    async initFoodBase() {
      return cloudOrLocal('initFoodBase', {}, async () => ({
        inserted: 0,
        total: (await repo.getFoodBase()).length,
        localOnly: true
      }))
    },

    async getFoodBase() {
      return cloudOrLocal('searchFoods', { keyword: '' }, () => repo.getFoodBase())
    },

    async getFoodBaseById(id) {
      return cloudOrLocal('searchFoods', { keyword: id }, () => repo.getFoodBaseById(id))
        .then((result) => Array.isArray(result) ? (result.find((item) => item.id === id) || repo.getFoodBaseById(id)) : result)
    },

    async searchFoods(keyword = '') {
      return cloudOrLocal('searchFoods', { keyword }, () => repo.searchFoods(keyword))
    },

    async addFoodRecord(input) {
      return cloudOrLocal('addFoodRecord', input, () => repo.addFoodRecord(input))
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
      if (resolveUseCloud(options.useCloud)) {
        const records = await this.getFoodRecords()
        return statsFromRecords(records)
      }
      return repo.getStats()
    },

    async getSettings() {
      return repo.getSettings()
    },

    async updateSettings(input) {
      return cloudOrLocal('updateUserSettings', input, () => repo.updateSettings(input))
    },

    async submitFeedback(input) {
      return cloudOrLocal('submitFeedback', input, () => ({
        ...input,
        status: 'pending'
      }))
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

module.exports = {
  createFoodService,
  getFoodService,
  unwrapCloudResult
}
