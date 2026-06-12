const { assets } = require('../../utils/mockData')

Page({
  data: {
    assets,
    nickname: '小芽贝',
    birthday: '2025-10-01',
    babyMode: true
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value })
  },

  onSwitch(e) {
    this.setData({ babyMode: e.detail.value })
  },

  save() {
    wx.showToast({ title: '已保存设置', icon: 'success' })
  }
})
