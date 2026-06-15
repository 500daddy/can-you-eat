const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()

Page({
  data: {
    tabs: ['今天建议处理', '即将超过建议期', '已超过建议期'],
    active: 0,
    today: [],
    soon: [],
    overdue: [],
    reminderEnabled: repo.getSettings().reminderEnabled,
    dailyEnabled: repo.getSettings().dailySummaryEnabled
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.refreshReminders()
  },

  refreshReminders() {
    const reminders = repo.getReminders()
    const settings = repo.getSettings()
    this.setData({
      ...reminders,
      reminderEnabled: settings.reminderEnabled,
      dailyEnabled: settings.dailySummaryEnabled
    })
  },

  switchTab(e) {
    this.setData({ active: Number(e.currentTarget.dataset.index) })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/reminder' })
  },

  requestSubscribe() {
    wx.showToast({ title: '模板 ID 后续配置', icon: 'none' })
  }
})
