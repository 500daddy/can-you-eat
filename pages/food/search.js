const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    keyword: '',
    foodBase: [],
    hotFoods: [],
    results: [],
    resultTitle: '推荐食材',
    showAllCategories: false,
    categoryToggleText: '更多分类 ›'
  },

  async onLoad(query = {}) {
    const keyword = (query.keyword || '').trim()
    const foodBase = await foodService.getFoodBase()
    this.setData({
      keyword,
      foodBase,
      hotFoods: foodBase.slice(0, 8),
      results: (await foodService.searchFoods(keyword)).slice(0, 5),
      resultTitle: keyword ? '搜索结果' : '推荐食材',
      showAllCategories: false,
      categoryToggleText: '更多分类 ›'
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  async onInput(e) {
    const keyword = e.detail.value.trim()
    const results = (await foodService.searchFoods(keyword)).slice(0, 20)
    this.setData({
      keyword,
      results,
      resultTitle: keyword ? '搜索结果' : '推荐食材'
    })
  },

  search() {
    wx.showToast({ title: '已筛选参考食材', icon: 'none' })
  },

  chooseFood(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  toggleCategories() {
    const showAllCategories = !this.data.showAllCategories
    this.setData({
      showAllCategories,
      hotFoods: showAllCategories ? this.data.foodBase : this.data.foodBase.slice(0, 8),
      categoryToggleText: showAllCategories ? '收起分类' : '更多分类 ›'
    })
  },

  goAdd() {
    const keyword = this.data.keyword ? `?name=${encodeURIComponent(this.data.keyword)}` : ''
    wx.navigateTo({ url: `/pages/food/add${keyword}` })
  }
})
