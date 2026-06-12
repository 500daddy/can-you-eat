const { records } = require('../../utils/mockData')

Page({
  data: {
    tabs: ['今天建议处理', '即将超过宝宝建议期', '已超过宝宝建议期'],
    active: 0,
    today: records.filter((item) => item.status === 'baby_today'),
    soon: records.filter((item) => item.status === 'adult_only'),
    overdue: records.filter((item) => ['not_recommended', 'expired'].includes(item.status)),
    reminderEnabled: true,
    dailyEnabled: true
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
