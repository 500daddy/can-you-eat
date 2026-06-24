const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

function buildCategoryGroups(foods) {
  const groups = []
  const groupMap = {}
  ;(foods || []).forEach((food) => {
    const category = food.category || '其他'
    const subCategory = food.subCategory || '其他'
    if (!groupMap[category]) {
      groupMap[category] = {
        name: category,
        count: 0,
        subMap: {},
        subCategories: []
      }
      groups.push(groupMap[category])
    }
    const group = groupMap[category]
    group.count += 1
    if (!group.subMap[subCategory]) {
      group.subMap[subCategory] = { name: subCategory, count: 0 }
      group.subCategories.push(group.subMap[subCategory])
    }
    group.subMap[subCategory].count += 1
  })
  return groups.map((group) => ({
    name: group.name,
    count: group.count,
    subCategories: group.subCategories
  }))
}

function filterFoodsByCategory(foods, category, subCategory = '') {
  return (foods || []).filter((food) => {
    if (category && food.category !== category) return false
    if (subCategory && food.subCategory !== subCategory) return false
    return true
  })
}

Page({
  data: {
    assets: foodService.getAssets(),
    keyword: '',
    foodBase: [],
    results: [],
    resultTitle: '推荐食材',
    categoryGroups: [],
    subCategories: [],
    activeCategory: '',
    activeSubCategory: ''
  },

  async onLoad(query = {}) {
    const keyword = (query.keyword || '').trim()
    const foodBase = await foodService.getFoodBase()
    this.setData({
      keyword,
      foodBase,
      results: (await foodService.searchFoods(keyword)).slice(0, 5),
      resultTitle: keyword ? '搜索结果' : '推荐食材',
      categoryGroups: buildCategoryGroups(foodBase),
      subCategories: [],
      activeCategory: '',
      activeSubCategory: ''
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
      resultTitle: keyword ? '搜索结果' : '推荐食材',
      subCategories: [],
      activeCategory: '',
      activeSubCategory: ''
    })
  },

  search() {
    wx.showToast({ title: '已筛选参考食材', icon: 'none' })
  },

  chooseFood(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  clearCategory() {
    this.setData({
      activeCategory: '',
      activeSubCategory: '',
      subCategories: [],
      resultTitle: this.data.keyword ? '搜索结果' : '推荐食材',
      results: this.data.keyword
        ? this.data.results
        : this.data.foodBase.slice(0, 5)
    })
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.name
    const group = this.data.categoryGroups.find((item) => item.name === category) || { subCategories: [] }
    this.setData({
      keyword: '',
      activeCategory: category,
      activeSubCategory: '',
      subCategories: group.subCategories,
      resultTitle: `${category}食材`,
      results: filterFoodsByCategory(this.data.foodBase, category).slice(0, 20)
    })
  },

  selectSubCategory(e) {
    const subCategory = e.currentTarget.dataset.name
    this.setData({
      keyword: '',
      activeSubCategory: subCategory,
      resultTitle: `${this.data.activeCategory} / ${subCategory}`,
      results: filterFoodsByCategory(this.data.foodBase, this.data.activeCategory, subCategory).slice(0, 20)
    })
  },

  goAdd() {
    const keyword = this.data.keyword ? `?name=${encodeURIComponent(this.data.keyword)}` : ''
    wx.navigateTo({ url: `/pages/food/add${keyword}` })
  }
})
