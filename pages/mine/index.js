const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

const statActions = {
  已记录食材: { action: 'overview' },
  今日建议处理: { action: 'reminder', tab: 0 },
  即将过期: { action: 'reminder', tab: 1 },
  安心指数: { action: 'score' }
}

function decorateStats(stats = []) {
  return stats.map((item) => ({
    ...item,
    ...(statActions[item.label] || {})
  }))
}

Page({
  data: {
    assets: foodService.getAssets(),
    settings: {},
    stats: []
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.setData({
      settings: await foodService.getSettings(),
      stats: decorateStats(await foodService.getStats())
    })
  },

  handleStatTap(e) {
    const { action, tab } = e.currentTarget.dataset
    if (action === 'overview') {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    if (action === 'reminder') {
      if (wx.setStorageSync) wx.setStorageSync('mine_target_reminder_tab', Number(tab) || 0)
      wx.switchTab({ url: '/pages/reminder/index' })
      return
    }
    if (action === 'score') {
      wx.showModal({
        title: '安心指数',
        content: '安心指数会结合已处理记录和当前待处理风险食材估算，只用于帮助你快速了解食材管理状态。',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  goBaby() {
    wx.navigateTo({ url: '/pages/settings/baby' })
  },

  goReminder() {
    wx.navigateTo({ url: '/pages/settings/reminder' })
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' })
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  }
})
