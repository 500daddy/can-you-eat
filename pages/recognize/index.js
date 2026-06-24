const { getFoodService } = require('../../utils/foodService')
const { getRecognitionService } = require('../../utils/recognitionService')

const foodService = getFoodService()
const recognitionService = getRecognitionService()
const assets = foodService.getAssets()

Page({
  data: {
    assets,
    hasImage: false,
    imagePath: '',
    recognizing: false,
    results: []
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const imagePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : ''
        this.setData({ hasImage: true, imagePath, recognizing: true, results: [] })
        try {
          const recognized = await recognitionService.recognizeImage(imagePath)
          this.setData({
            recognizing: false,
            imagePath: recognized.imageUrl || imagePath,
            results: recognized.results
          })
        } catch (error) {
          this.setData({ recognizing: false, results: [] })
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
        }
      },
      fail: () => {
        this.mockRecognize()
      }
    })
  },

  async mockRecognize() {
    const recognized = await recognitionService.recognizeImage(assets.food.carrot)
    this.setData({
      hasImage: true,
      recognizing: false,
      imagePath: recognized.imageUrl || assets.food.carrot,
      results: recognized.results
    })
  },

  async chooseResult(e) {
    const { id } = e.currentTarget.dataset
    const selected = this.data.results.find((item) => item.foodId === id) || {}
    await recognitionService.logSelection({
      imageUrl: this.data.imagePath,
      mockResult: this.data.results,
      selectedFoodName: selected.foodName || '',
      selectedFoodBaseId: id,
      confidence: selected.confidence || 0
    })
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  manualSearch() {
    wx.switchTab({ url: '/pages/food/search' })
  }
})
