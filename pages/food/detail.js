const { getRecord, getFoodBase, assets } = require('../../utils/mockData')
const { getStatus } = require('../../utils/status')

Page({
  data: {
    assets,
    record: {},
    base: {},
    statusInfo: {}
  },

  onLoad(query) {
    const record = getRecord(query.id)
    const base = getFoodBase(record.foodId)
    this.setData({
      record,
      base,
      statusInfo: getStatus(record.status)
    })
  },

  edit() {
    wx.navigateTo({ url: `/pages/food/edit?id=${this.data.record.id}` })
  },

  finish() {
    wx.showToast({ title: '已标记处理', icon: 'success' })
  },

  keepAdult() {
    wx.showToast({ title: '已标记成人参考', icon: 'none' })
  },

  remove() {
    wx.showModal({
      title: '删除记录？',
      content: '删除后不会再出现在提醒中。',
      confirmText: '删除',
      confirmColor: '#c94c43',
      success(res) {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/index/index' })
        }
      }
    })
  }
})
