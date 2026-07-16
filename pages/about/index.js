const { getFoodService } = require('../../utils/foodService')
const { createShareHandlers } = require('../../utils/share')

const foodService = getFoodService()

Page({
  ...createShareHandlers({ timeline: true }),

  data: {
    assets: foodService.getAssets(),
    version: '安心版 0.1'
  }
})
