const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    reminderEnabled: true,
    beforeDays: '1天前',
    todayEnabled: true,
    dailyEnabled: true,
    dailyTime: '08:00'
  },

  async onLoad() {
    const settings = await foodService.getSettings()
    this.setData({
      reminderEnabled: settings.reminderEnabled,
      beforeDays: `${settings.remindBeforeDays}天前`,
      todayEnabled: settings.todayReminderEnabled,
      dailyEnabled: settings.dailySummaryEnabled,
      dailyTime: settings.dailySummaryTime
    })
  },

  onReminderSwitch(e) {
    this.setData({ reminderEnabled: e.detail.value })
  },

  onTodaySwitch(e) {
    this.setData({ todayEnabled: e.detail.value })
  },

  onDailySwitch(e) {
    this.setData({ dailyEnabled: e.detail.value })
  },

  async save() {
    await foodService.updateSettings({
      reminderEnabled: this.data.reminderEnabled,
      todayReminderEnabled: this.data.todayEnabled,
      dailySummaryEnabled: this.data.dailyEnabled,
      dailySummaryTime: this.data.dailyTime
    })
    wx.showToast({ title: '已保存提醒', icon: 'success' })
  },

  requestSubscribe() {
    wx.showToast({ title: '请配置订阅模板ID', icon: 'none' })
  }
})
