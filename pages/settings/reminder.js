const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()
const settings = repo.getSettings()

Page({
  data: {
    reminderEnabled: settings.reminderEnabled,
    beforeDays: `${settings.remindBeforeDays}天前`,
    todayEnabled: settings.todayReminderEnabled,
    dailyEnabled: settings.dailySummaryEnabled,
    dailyTime: settings.dailySummaryTime
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

  save() {
    repo.updateSettings({
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
