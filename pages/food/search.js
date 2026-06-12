const { assets, foodBase } = require('../../utils/mockData')

Page({
  data: {
    assets,
    keyword: '',
    foodBase,
    hotFoods: foodBase.slice(0, 8),
    results: foodBase.slice(0, 5)
  },

  onInput(e) {
    const keyword = e.detail.value.trim()
    const results = keyword
      ? foodBase.filter((item) => `${item.name}${item.aliases}`.includes(keyword))
      : foodBase.slice(0, 5)
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
    wx.navigateTo({ url: '/pages/food/add' })
  }
})
