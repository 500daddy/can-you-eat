const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    version: '安心版 0.1'
  }
})
