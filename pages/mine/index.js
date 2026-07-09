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

const aiLabItems = [
  {
    id: 'recognize',
    title: '拍照识别食材',
    desc: '拍照或从相册选择，识别后再确认保存',
    status: '可用'
  },
  {
    id: 'mealIdeas',
    title: '营养搭配灵感',
    desc: '根据库存和宝宝月龄，生成温和搭配建议',
    status: '即将上线'
  },
  {
    id: 'safetyQa',
    title: '辅食安全问答',
    desc: '围绕过敏源、处理方式和风险点给提示',
    status: '即将上线'
  },
  {
    id: 'fridgeSummary',
    title: '冰箱清单总结',
    desc: '把临期食材整理成今日处理小清单',
    status: '即将上线'
  }
]

Page({
  data: {
    assets: foodService.getAssets(),
    settings: {},
    stats: [],
    aiLabItems,
    aiLabExpanded: false
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

  goAiLabItem(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'recognize') {
      wx.navigateTo({ url: '/pages/recognize/index' })
      return
    }
    const item = aiLabItems.find((current) => current.id === id)
    wx.showModal({
      title: item ? item.title : '智能工具',
      content: '这个功能暂未开放。上线后会放在这里。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  toggleAiLab() {
    this.setData({ aiLabExpanded: !this.data.aiLabExpanded })
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
