const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    settings: {},
    babyAgeText: '8个月12天',
    records: [],
    sections: []
  },

  onLoad() {
    this.buildSections()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.refreshRecords()
  },

  async refreshRecords() {
    const settings = await foodService.getSettings()
    const records = await foodService.getFoodRecords()
    this.setData({
      settings,
      babyAgeText: settings.babyAgeText,
      records,
      sections: await foodService.getHomeSections()
    })
  },

  buildSections() {
    this.refreshRecords()
  },

  goAdd() {
    wx.switchTab({ url: '/pages/food/search' })
  },

  goRecognize() {
    wx.navigateTo({ url: '/pages/recognize/index' })
  }
})
