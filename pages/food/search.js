const { getFoodService } = require('../../utils/foodService')
const { decorateFoodIconDisplay } = require('../../utils/foodIconPolicy')
const { createShareHandlers } = require('../../utils/share')

const foodService = getFoodService()

const categoryOrder = ['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食', '其他']
const subCategoryMap = {
  花菜类: '叶花菜类',
  叶菜类: '叶花菜类',
  根茎薯芋类: '根茎类',
  茄果瓜类: '茄果类',
  菌藻类: '菌菇类',
  莓果类: '浆果类'
}

function normalizeSubCategory(subCategory) {
  const value = subCategory || '其他'
  return subCategoryMap[value] || value
}

function withNormalizedSubCategory(food) {
  return {
    ...food,
    subCategory: normalizeSubCategory(food.subCategory)
  }
}

function normalizeFoodCategory(food) {
  const category = food.category || '其他'
  const subCategory = food.subCategory || '其他'
  const name = food.name || ''
  const id = food.id || ''
  const aliases = Array.isArray(food.aliases) ? food.aliases.join('') : String(food.aliases || '')
  const searchText = `${id}${name}${aliases}`

  if (category === '根茎' || category === '根茎类') {
    return withNormalizedSubCategory({ ...food, category: '蔬菜', subCategory: '根茎类' })
  }
  if (['肉类', '肉蛋奶'].includes(category)) {
    let nextSubCategory = subCategory
    if (['禽类', '禽肉'].includes(subCategory)) nextSubCategory = '禽肉类'
    else if (['畜类', '畜肉'].includes(subCategory)) nextSubCategory = '畜肉类'
    else if (/鸡|鸭|鹅|chicken/i.test(searchText)) nextSubCategory = '禽肉类'
    else if (/牛|猪|羊|beef|pork/i.test(searchText)) nextSubCategory = '畜肉类'
    else if (/鱼|虾|蟹|fish|shrimp/i.test(searchText)) nextSubCategory = '水产类'
    else if (subCategory === '蛋白') nextSubCategory = '肉类'
    return withNormalizedSubCategory({ ...food, category: '肉禽水产', subCategory: nextSubCategory })
  }
  if (category === '蛋奶') {
    let nextSubCategory = subCategory
    if (subCategory === '蛋白' || /蛋|egg/i.test(searchText)) nextSubCategory = '蛋类'
    else if (/奶|芝士|奶酪|milk|cheese/i.test(searchText)) nextSubCategory = '奶制品'
    return withNormalizedSubCategory({ ...food, category: '蛋奶豆制品', subCategory: nextSubCategory })
  }
  if (category === '蛋白') {
    let nextSubCategory = subCategory
    if (subCategory === '蛋白') nextSubCategory = /蛋|egg/i.test(searchText) ? '蛋类' : '豆制品'
    return withNormalizedSubCategory({ ...food, category: '蛋奶豆制品', subCategory: nextSubCategory })
  }
  if (category === '主食') {
    return withNormalizedSubCategory({ ...food, category: '主食辅食', subCategory })
  }
  return withNormalizedSubCategory(food)
}

function normalizeFoods(foods) {
  return (foods || []).map(normalizeFoodCategory)
}

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
        icon: food.icon || '',
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
  return groups.sort((left, right) => {
    const leftIndex = categoryOrder.includes(left.name) ? categoryOrder.indexOf(left.name) : categoryOrder.length
    const rightIndex = categoryOrder.includes(right.name) ? categoryOrder.indexOf(right.name) : categoryOrder.length
    return leftIndex - rightIndex
  }).map((group) => ({
    name: group.name,
    count: group.count,
    icon: group.icon,
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

function toDisplayResults(foods) {
  return decorateFoodIconDisplay(normalizeFoods(foods))
}

Page({
  ...createShareHandlers({ timeline: true }),

  data: {
    assets: foodService.getAssets(),
    keyword: '',
    foodBase: [],
    results: [],
    resultTitle: '推荐食材',
    recommendationHint: '',
    recommendationSummary: {},
    needsBabyProfilePrompt: false,
    recommendedFoods: [],
    categoryGroups: [],
    subCategories: [],
    activeCategory: '',
    activeSubCategory: '',
    searchFocus: false,
    showBackTop: false
  },

  async onLoad(query = {}) {
    const keyword = (query.keyword || '').trim()
    const foodBase = normalizeFoods(await foodService.getFoodBase())
    const recommendationSummary = foodService.getRecommendationSummary
      ? await foodService.getRecommendationSummary()
      : {}
    const recommendedFoods = keyword
      ? []
      : (foodService.getRecommendedFoods
        ? await foodService.getRecommendedFoods()
        : await foodService.searchFoods(''))
    this.setData({
      keyword,
      foodBase,
      results: toDisplayResults((keyword ? await foodService.searchFoods(keyword) : recommendedFoods).slice(0, 5)),
      resultTitle: keyword ? '搜索结果' : '推荐食材',
      recommendationSummary,
      recommendationHint: keyword ? '' : recommendationSummary.hint || '',
      needsBabyProfilePrompt: Boolean(recommendationSummary.needsBabyProfilePrompt),
      recommendedFoods,
      categoryGroups: buildCategoryGroups(foodBase),
      subCategories: [],
      activeCategory: '',
      activeSubCategory: '',
      showBackTop: false
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.applyEntryIntent()
  },

  applyEntryIntent() {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return
    const intent = wx.getStorageSync('food_search_entry')
    if (!intent) return
    if (wx.removeStorageSync) wx.removeStorageSync('food_search_entry')
    if (intent === 'search') {
      wx.navigateTo({ url: '/pages/food/name-search' })
      return
    }
    if (intent === 'category') {
      this.setData({ searchFocus: false })
      if (wx.pageScrollTo) {
        wx.pageScrollTo({ selector: '#category-section', duration: 260 })
      }
    }
  },

  async onInput(e) {
    const keyword = e.detail.value.trim()
    const recommendedFoods = keyword
      ? this.data.recommendedFoods
      : (foodService.getRecommendedFoods
        ? await foodService.getRecommendedFoods()
        : this.data.foodBase.slice(0, 5))
    const rawResults = normalizeFoods(keyword
      ? await foodService.searchFoods(keyword)
      : recommendedFoods).slice(0, keyword ? 20 : 5)
    const results = decorateFoodIconDisplay(rawResults)
    this.setData({
      keyword,
      results,
      resultTitle: keyword ? '搜索结果' : '推荐食材',
      recommendationHint: keyword ? '' : this.data.recommendationSummary.hint || '',
      recommendedFoods,
      subCategories: [],
      activeCategory: '',
      activeSubCategory: '',
      showBackTop: false
    })
  },

  search() {
    wx.showToast({ title: '已筛选参考食材', icon: 'none' })
  },

  chooseFood(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  selectRecommended() {
    this.setData({
      keyword: '',
      activeCategory: '',
      activeSubCategory: '',
      subCategories: [],
      resultTitle: '推荐食材',
      recommendationHint: this.data.recommendationSummary.hint || '',
      results: toDisplayResults(this.data.recommendedFoods.slice(0, 5)),
      showBackTop: false
    })
  },

  async clearCategory() {
    this.setData({
      keyword: '',
      activeCategory: '',
      activeSubCategory: '',
      subCategories: [],
      resultTitle: '全部食材',
      results: toDisplayResults(this.data.foodBase),
      recommendationHint: '',
      showBackTop: false
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
      recommendationHint: '',
      results: toDisplayResults(filterFoodsByCategory(this.data.foodBase, category)),
      showBackTop: false
    })
  },

  selectSubCategory(e) {
    const subCategory = e.currentTarget.dataset.name
    this.setData({
      keyword: '',
      activeSubCategory: subCategory,
      resultTitle: `${this.data.activeCategory} / ${subCategory}`,
      recommendationHint: '',
      results: toDisplayResults(filterFoodsByCategory(this.data.foodBase, this.data.activeCategory, subCategory)),
      showBackTop: false
    })
  },

  onPageScroll(e) {
    const shouldShow = this.data.results.length > 12 && e.scrollTop > 520
    if (shouldShow !== this.data.showBackTop) {
      this.setData({ showBackTop: shouldShow })
    }
  },

  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 260 })
    this.setData({ showBackTop: false })
  },

  goAdd() {
    const keyword = this.data.keyword ? `?name=${encodeURIComponent(this.data.keyword)}&custom=1` : ''
    wx.navigateTo({ url: `/pages/food/add${keyword}` })
  },

  goNameSearch() {
    wx.navigateTo({ url: '/pages/food/name-search' })
  },

  goBabySettings() {
    wx.navigateTo({ url: '/pages/settings/baby' })
  },

  goFeedback() {
    const keyword = this.data.keyword ? encodeURIComponent(this.data.keyword) : ''
    const query = keyword
      ? `?type=food_not_found&foodName=${keyword}&content=${encodeURIComponent(`希望补充「${this.data.keyword}」的保存建议`)}`
      : '?type=food_not_found'
    wx.navigateTo({ url: `/pages/feedback/index${query}` })
  }
})
