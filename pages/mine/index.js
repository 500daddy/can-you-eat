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
    const recognitionCount = await recognitionService.getRecognitionCount()
    this.setData({
      settings: await foodService.getSettings(),
      stats: await foodService.getStats(),
      recognitionCount
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

  goRecognitionLog() {
    wx.navigateTo({ url: '/pages/recognition-log/index' })
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  }
})
