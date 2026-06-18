const { getFoodService } = require('../../utils/foodService')
const { TEMPLATE_ID_FOOD_EXPIRE } = require('../../utils/subscribeService')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    version: 'MVP 0.1',
    useCloudFoodApi: false,
    templateConfigured: false
  },

  onLoad() {
    const app = typeof getApp === 'function' ? getApp() : null
    this.setData({
      useCloudFoodApi: Boolean(app && app.globalData && app.globalData.useCloudFoodApi),
      templateConfigured: TEMPLATE_ID_FOOD_EXPIRE !== '请替换为实际订阅消息模板ID'
    })
  }
})
