const { getRecognitionService } = require('../../utils/recognitionService')
const { getFoodService } = require('../../utils/foodService')
const { createShareHandlers } = require('../../utils/share')

const recognitionService = getRecognitionService()
const foodService = getFoodService()

Page({
  ...createShareHandlers(),

  data: {
    assets: foodService.getAssets(),
    logs: []
  },

  async onShow() {
    const logs = await recognitionService.getRecognitionLogs()
    this.setData({
      logs: logs.map((item) => ({
        ...item,
        displayName: item.selectedFoodName || item.foodName || '未命名食材',
        displayTime: item.createdAt || '刚刚记录',
        confidenceText: item.confidence ? `${Math.round(Number(item.confidence) * 100)}%` : '参考'
      }))
    })
  },

  goRecognize() {
    wx.navigateTo({ url: '/pages/recognize/index' })
  },

  goAdd(e) {
    const foodId = e.currentTarget.dataset.id
    if (foodId) {
      wx.navigateTo({ url: `/pages/food/add?foodId=${foodId}` })
    }
  }
})
