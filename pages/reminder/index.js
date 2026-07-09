const { getFoodService } = require('../../utils/foodService')
const { getSubscribeService } = require('../../utils/subscribeService')
const { buildDailySummaryTimeState } = require('../../utils/reminderTime')

const foodService = getFoodService()
const subscribeService = getSubscribeService()
const TARGET_TAB_KEY = 'mine_target_reminder_tab'
const defaultDailyTimeState = buildDailySummaryTimeState()

function showTestReminderError(error) {
  const rawContent = typeof error === 'string'
    ? error
    : (error && (error.error || error.errMsg || error.message)) || '请查看云函数日志'
  let content = rawContent
  if (/subscribe_message_refused|43101|user refuse to accept the msg/.test(rawContent)) {
    content = '微信还没有拿到本次提醒授权。请重新点试发提醒，并在弹窗里选择允许。'
  } else if (/-604101|no permission to call this API/.test(rawContent)) {
    content = '云函数缺少订阅消息发送权限。请重新上传 sendFoodReminder 云函数后再试。'
  }
  if (wx.showModal) {
    wx.showModal({
      title: '提醒发送失败',
      content,
      showCancel: false
    })
    return
  }
  wx.showToast({ title: '提醒发送失败', icon: 'none' })
}

function canShowTestReminder() {
  if (typeof wx === 'undefined' || !wx.getAccountInfoSync) return false
  const info = wx.getAccountInfoSync()
  const envVersion = info && info.miniProgram && info.miniProgram.envVersion
  return envVersion === 'develop'
}

Page({
  data: {
    tabs: ['今天建议处理', '即将超过建议期', '已超过建议期'],
    active: 0,
    today: [],
    soon: [],
    overdue: [],
    reminderEnabled: true,
    dailyEnabled: true,
    dailyTimeEditorVisible: false,
    showTestReminder: false,
    ...defaultDailyTimeState
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ showTestReminder: canShowTestReminder() })
    this.applyTargetTab()
    this.refreshReminders()
  },

  applyTargetTab() {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return
    const target = wx.getStorageSync(TARGET_TAB_KEY)
    if (target === undefined || target === null || target === '') return
    const active = Math.max(0, Math.min(2, Number(target) || 0))
    this.setData({ active })
    if (wx.removeStorageSync) wx.removeStorageSync(TARGET_TAB_KEY)
  },

  async refreshReminders() {
    const reminders = await foodService.getReminders()
    const settings = await foodService.getSettings()
    this.setData({
      ...reminders,
      reminderEnabled: settings.reminderEnabled,
      dailyEnabled: settings.dailySummaryEnabled,
      ...buildDailySummaryTimeState(settings.dailySummaryTime)
    })
  },

  switchTab(e) {
    this.setData({ active: Number(e.currentTarget.dataset.index) })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/reminder' })
  },

  toggleDailyTimeEditor() {
    this.setData({ dailyTimeEditorVisible: !this.data.dailyTimeEditorVisible })
  },

  async updateDailySummaryTime(value) {
    const nextState = buildDailySummaryTimeState(value)
    await foodService.updateSettings({ dailySummaryTime: nextState.dailyTime })
    this.setData({
      ...nextState,
      dailyTimeEditorVisible: false
    })
    wx.showToast({ title: `已改为${nextState.dailyTimeText}`, icon: 'success' })
  },

  async selectDailyTimeOption(e) {
    await this.updateDailySummaryTime(e.currentTarget.dataset.value)
  },

  async onDailyTimeChange(e) {
    await this.updateDailySummaryTime(e.detail.value)
  },

  async requestSubscribe() {
    const result = await subscribeService.requestFoodExpireSubscribe()
    if (result.status === 'not_configured') {
      wx.showToast({ title: '微信提醒暂不可用', icon: 'none' })
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
  },

  async sendTestReminder() {
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '云函数不可用', icon: 'none' })
      return
    }
    const subscribeResult = await subscribeService.requestFoodExpireSubscribe()
    if (!subscribeResult.accepted) {
      if (wx.showModal) {
        wx.showModal({
          title: '未开启本次提醒',
          content: '需要先允许微信提醒，才能发送试发消息。',
          showCancel: false
        })
      } else {
        wx.showToast({ title: '未开启本次提醒', icon: 'none' })
      }
      return
    }
    wx.showLoading({ title: '发送中' })
    try {
      const result = await wx.cloud.callFunction({
        name: 'sendFoodReminder',
        data: { test: true }
      })
      wx.hideLoading()
      if (result && result.result && result.result.ok) {
        wx.showToast({ title: '提醒已发送', icon: 'success' })
        return
      }
      showTestReminderError(result && result.result)
    } catch (error) {
      wx.hideLoading()
      showTestReminderError(error)
    }
  }
})
