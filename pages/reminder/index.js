const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    tabs: ['今天建议处理', '即将超过建议期', '已超过建议期'],
    active: 0,
    today: [],
    soon: [],
    overdue: [],
    reminderEnabled: true,
    dailyEnabled: true
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.refreshReminders()
  },

  async refreshReminders() {
    const reminders = await foodService.getReminders()
    const settings = await foodService.getSettings()
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
