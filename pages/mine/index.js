const { getFoodService } = require('../../utils/foodService')
const { getRecognitionService } = require('../../utils/recognitionService')

const foodService = getFoodService()
const recognitionService = getRecognitionService()

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
      stats: await foodService.getStats(),
      recognitionCount: await recognitionService.getRecognitionCount()
    })
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

  toast() {
    wx.showToast({ title: '后续迭代接入', icon: 'none' })
  }
})
