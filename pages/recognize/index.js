const { getFoodService } = require('../../utils/foodService')
const { getRecognitionService } = require('../../utils/recognitionService')
const { createShareHandlers } = require('../../utils/share')

const foodService = getFoodService()
const recognitionService = getRecognitionService()
const assets = foodService.getAssets()

function compressRecognitionImage(filePath) {
  if (!filePath || typeof wx === 'undefined' || !wx.compressImage) return Promise.resolve(filePath)
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 55,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    })
  })
}

Page({
  ...createShareHandlers({ timeline: true }),

  data: {
    assets,
    hasImage: false,
    imagePath: '',
    recognizing: false,
    results: [],
    unmatchedCandidates: []
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const imagePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : ''
        const uploadImagePath = await compressRecognitionImage(imagePath)
        this.setData({ hasImage: true, imagePath: uploadImagePath, recognizing: true, results: [], unmatchedCandidates: [] })
        try {
          const recognized = await recognitionService.recognizeImage(uploadImagePath)
          this.setData({
            recognizing: false,
            imagePath: recognized.imageUrl || uploadImagePath,
            results: recognized.results || [],
            unmatchedCandidates: recognized.unmatchedCandidates || []
          })
        } catch (error) {
          this.setData({ recognizing: false, results: [], unmatchedCandidates: [] })
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
        }
      },
      fail: () => {
        this.mockRecognize()
      }
    })
  },

  async mockRecognize() {
    const fallbackImage = assets.actions && assets.actions.camera ? assets.actions.camera : ''
    const recognized = await recognitionService.recognizeImage(fallbackImage)
    this.setData({
      hasImage: true,
      recognizing: false,
      imagePath: recognized.imageUrl || fallbackImage,
      results: recognized.results || [],
      unmatchedCandidates: recognized.unmatchedCandidates || []
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

  chooseUnmatchedCandidate(e) {
    const foodName = String(e.currentTarget.dataset.name || '').trim()
    if (!foodName) return
    wx.navigateTo({ url: `/pages/food/add?name=${encodeURIComponent(foodName)}&custom=1` })
  },

  manualSearch() {
    wx.switchTab({ url: '/pages/food/search' })
  }
})
