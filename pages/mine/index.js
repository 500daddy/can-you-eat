const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()

Page({
  data: {
    assets: repo.getAssets(),
    settings: repo.getSettings(),
    stats: repo.getStats()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.setData({
      settings: repo.getSettings(),
      stats: repo.getStats()
    })
  },

  goBaby() {
    wx.navigateTo({ url: '/pages/settings/baby' })
  },

  goReminder() {
    wx.navigateTo({ url: '/pages/settings/reminder' })
  },

  toast() {
    wx.showToast({ title: '后续迭代接入', icon: 'none' })
  }
})
