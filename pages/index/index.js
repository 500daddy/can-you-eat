const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()

Page({
  data: {
    assets: repo.getAssets(),
    babyAgeText: repo.getSettings().babyAgeText,
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

  refreshRecords() {
    const records = repo.getFoodRecords()
    this.setData({
      babyAgeText: repo.getSettings().babyAgeText,
      records,
      sections: repo.getHomeSections()
    })
  },

  buildSections() {
    this.refreshRecords()
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/food/add' })
  },

  goRecognize() {
    wx.navigateTo({ url: '/pages/recognize/index' })
  }
})
