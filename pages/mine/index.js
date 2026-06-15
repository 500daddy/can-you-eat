const { assets } = require('../../utils/mockData')

Page({
  data: {
    assets,
    stats: [
      { label: '已记录食材', value: 12 },
      { label: '今日建议处理', value: 2 },
      { label: '即将过期', value: 1 },
      { label: '安心指数', value: '98%' }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
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
