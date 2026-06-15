const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()

Page({
  data: {
    assets: repo.getAssets(),
    keyword: '',
    foodBase: [],
    hotFoods: [],
    results: []
  },

  onLoad(query) {
    const keyword = query.keyword || ''
    const foodBase = repo.getFoodBase()
    this.setData({
      keyword,
      foodBase,
      hotFoods: foodBase.slice(0, 8),
      results: repo.searchFoods(keyword).slice(0, 5)
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onInput(e) {
    const keyword = e.detail.value.trim()
    const results = repo.searchFoods(keyword).slice(0, 20)
    this.setData({ keyword, results })
  },

  search() {
    wx.showToast({ title: '已筛选参考食材', icon: 'none' })
  },

  chooseFood(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  goAdd() {
    const keyword = this.data.keyword ? `?name=${encodeURIComponent(this.data.keyword)}` : ''
    wx.navigateTo({ url: `/pages/food/add${keyword}` })
  }
})
