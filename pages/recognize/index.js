const { assets, recognitionResults } = require('../../utils/mockData')

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
      success: (res) => {
        const imagePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : ''
        this.setData({ hasImage: true, imagePath, recognizing: true, results: [] })
        setTimeout(() => {
          this.setData({ recognizing: false, results: recognitionResults })
        }, 700)
      },
      fail: () => {
        this.mockRecognize()
      }
    })
  },

  mockRecognize() {
    this.setData({
      hasImage: true,
      recognizing: false,
      imagePath: assets.food.carrot,
      results: recognitionResults
    })
  },

  chooseResult(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  manualSearch() {
    wx.navigateTo({ url: '/pages/food/search' })
  }
})
