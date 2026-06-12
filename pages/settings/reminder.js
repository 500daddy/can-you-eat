Page({
  data: {
    reminderEnabled: true,
    beforeDays: '1天前',
    todayEnabled: true,
    dailyEnabled: true,
    dailyTime: '08:00'
  },

  save() {
    wx.showToast({ title: '已保存提醒', icon: 'success' })
  },

  requestSubscribe() {
    wx.showToast({ title: '请配置订阅模板ID', icon: 'none' })
  }
})
