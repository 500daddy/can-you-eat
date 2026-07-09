const { getFoodService } = require('../../utils/foodService')
const { getStatus } = require('../../utils/status')
const { decorateFoodIconDisplay } = require('../../utils/foodIconPolicy')
const { buildProcessAdvice } = require('../../utils/processAdvice')

const foodService = getFoodService()

function normalizeBase(base, record = {}) {
  const tips = (base && (base.tips || base.storageTips)) || []
  if (base) {
    return {
      ...base,
      tips: Array.isArray(tips) ? tips : [tips].filter(Boolean)
    }
  }
  return {
    tips: [`${record.name || '自定义食材'}暂无标准保存建议，请按实际保存方式、外观、气味和触感谨慎判断。`],
    spoilageSigns: []
  }
}

function confirmFinish(foodName) {
  if (typeof wx === 'undefined' || !wx.showModal) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认已吃掉？',
      content: `确认「${foodName || '这个食材'}」已经吃掉或处理了吗？确认后会从首页和提醒列表移除。`,
      confirmText: '确认',
      cancelText: '取消',
      confirmColor: '#2f8d3d',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    })
  })
}

Page({
  data: {
    assets: foodService.getAssets(),
    record: {},
    base: {},
    statusInfo: {},
    processAdvice: {}
  },

  onLoad(query = {}) {
    this.loadDetail(query.id)
  },

  onShow() {
    if (this.data.record.id) {
      this.loadDetail(this.data.record.id)
    }
  },

  async loadDetail(id) {
    const { record, base } = await foodService.getFoodDetail(id)
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    const displayRecord = decorateFoodIconDisplay([record])[0]
    this.setData({
      record: displayRecord,
      base: normalizeBase(base, displayRecord),
      statusInfo: getStatus(displayRecord.status),
      processAdvice: buildProcessAdvice({
        ...base,
        ...displayRecord
      })
    })
  },

  edit() {
    wx.navigateTo({ url: `/pages/food/edit?id=${this.data.record.id}` })
  },

  async finish() {
    const confirmed = await confirmFinish(this.data.record.name)
    if (!confirmed) return
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

module.exports = {
  normalizeBase
}
