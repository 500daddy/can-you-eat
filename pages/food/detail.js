const { getFoodService } = require('../../utils/foodService')
const { getStatus } = require('../../utils/status')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    record: {},
    base: {},
    statusInfo: {}
  },

  onLoad(query) {
    this.loadDetail(query.id)
  },

  onShow() {
    if (this.data.record.id) {
      this.loadDetail(this.data.record.id)
    }
  },

  async loadDetail(id) {
    const { record, base } = await foodService.getFoodDetail(id)
    this.setData({
      record,
      base,
      statusInfo: getStatus(record.status)
    })
  },

  edit() {
    wx.navigateTo({ url: `/pages/food/edit?id=${this.data.record.id}` })
  },

  async finish() {
    await foodService.finishFoodRecord({ recordId: this.data.record.id, action: 'finished' })
    wx.showToast({ title: '已标记处理', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 500)
  },

  async keepAdult() {
    await foodService.finishFoodRecord({ recordId: this.data.record.id, action: 'adult_only' })
    wx.showToast({ title: '已标记成人参考', icon: 'none' })
    this.loadDetail(this.data.record.id)
  },

  remove() {
    wx.showModal({
      title: '删除记录？',
      content: '删除后不会再出现在提醒中。',
      confirmText: '删除',
      confirmColor: '#c94c43',
      success: (res) => {
        if (res.confirm) {
          foodService.finishFoodRecord({ recordId: this.data.record.id, action: 'deleted' })
          wx.switchTab({ url: '/pages/index/index' })
        }
      }
    })
  }
})
