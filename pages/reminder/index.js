const { getFoodService } = require('../../utils/foodService')
const { getSubscribeService } = require('../../utils/subscribeService')

const foodService = getFoodService()
const subscribeService = getSubscribeService()

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

  async requestSubscribe() {
    const result = await subscribeService.requestFoodExpireSubscribe()
    if (result.status === 'not_configured') {
      wx.showToast({ title: '请先配置订阅模板ID', icon: 'none' })
      return
    }
    if (result.status === 'failed') {
      wx.showToast({ title: '订阅请求失败', icon: 'none' })
      return
    }
    await foodService.updateSettings({
      subscribeMessageAccepted: result.accepted
    })
    wx.showToast({
      title: result.accepted ? '已开启微信提醒' : '未开启订阅',
      icon: result.accepted ? 'success' : 'none'
    })
  }
})
