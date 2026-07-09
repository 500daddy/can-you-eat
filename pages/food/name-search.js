const { getFoodService } = require('../../utils/foodService')
const { decorateFoodIconDisplay } = require('../../utils/foodIconPolicy')

const foodService = getFoodService()
const RECENT_SEARCH_FOODS_KEY = 'food_name_search_recent'

function normalizeAliasText(aliases) {
  if (Array.isArray(aliases)) return aliases.join('、')
  return aliases || ''
}

function normalizeKeyword(value) {
  const keyword = String(value || '').trim()
  return ['undefined', 'null'].includes(keyword.toLowerCase()) ? '' : keyword
}

function normalizeFoods(foods = []) {
  return foods.map((item) => ({
    ...item,
    aliases: normalizeAliasText(item.aliases)
  }))
}

function toDisplayResults(foods = []) {
  return decorateFoodIconDisplay(normalizeFoods(foods))
}

function compactFood(food) {
  if (!food) return null
  return {
    id: food.id,
    name: food.name,
    category: food.category || ''
  }
}

function readRecentFoods() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return []
  const recentFoods = wx.getStorageSync(RECENT_SEARCH_FOODS_KEY)
  return Array.isArray(recentFoods)
    ? recentFoods.map(compactFood).filter(Boolean).slice(0, 6)
    : []
}

function writeRecentFood(food, currentRecentFoods = []) {
  if (!food || typeof wx === 'undefined' || !wx.setStorageSync) return
  const compact = compactFood(food)
  if (!compact) return
  const nextRecentFoods = [
    compact,
    ...currentRecentFoods.filter((item) => item.id !== compact.id)
  ].slice(0, 6)
  wx.setStorageSync(RECENT_SEARCH_FOODS_KEY, nextRecentFoods)
}

async function getPopularFoods() {
  if (foodService.getRecommendedFoods) {
    return normalizeFoods(await foodService.getRecommendedFoods()).slice(0, 5)
  }
  if (foodService.getFoodBase) {
    return normalizeFoods(await foodService.getFoodBase()).slice(0, 5)
  }
  return []
}

async function getRecommendationSummary() {
  if (!foodService.getRecommendationSummary) return {}
  return foodService.getRecommendationSummary()
}

Page({
  data: {
    assets: foodService.getAssets(),
    keyword: '',
    results: [],
    popularFoods: [],
    recentFoods: [],
    recommendationSummary: {},
    recommendationHint: '',
    needsBabyProfilePrompt: false,
    resultTitle: '输入名称开始搜索',
    hasSearched: false,
    searchFocus: true,
    searchRequestId: 0
  },

  async onLoad(query = {}) {
    const popularFoods = await getPopularFoods()
    const displayPopularFoods = decorateFoodIconDisplay(popularFoods)
    const recommendationSummary = await getRecommendationSummary()
    const recentFoods = readRecentFoods()
    const keyword = normalizeKeyword(query.keyword)
    if (keyword) {
      this.setData({ popularFoods: displayPopularFoods, recentFoods, recommendationSummary })
      await this.runSearch(keyword)
      return
    }
    this.setData({
      keyword: '',
      results: displayPopularFoods,
      popularFoods: displayPopularFoods,
      recentFoods,
      recommendationSummary,
      recommendationHint: recommendationSummary.hint || '',
      needsBabyProfilePrompt: Boolean(recommendationSummary.needsBabyProfilePrompt),
      resultTitle: '推荐食材',
      hasSearched: false,
      searchFocus: true
    })
  },

  onInput(e) {
    const keyword = normalizeKeyword(e && e.detail ? e.detail.value : '')
    this.setData({ keyword })
    this.runSearch(keyword)
    return keyword
  },

  async search() {
    await this.runSearch(normalizeKeyword(this.data.keyword))
  },

  async runSearch(keyword) {
    keyword = normalizeKeyword(keyword)
    const searchRequestId = this.data.searchRequestId + 1
    this.setData({ searchRequestId })
    if (!keyword) {
      if (this.data.searchRequestId !== searchRequestId) return
      this.setData({
        keyword: '',
        results: this.data.popularFoods,
        resultTitle: '推荐食材',
        recommendationHint: this.data.recommendationSummary.hint || '',
        needsBabyProfilePrompt: Boolean(this.data.recommendationSummary.needsBabyProfilePrompt),
        hasSearched: false,
        searchFocus: true
      })
      return
    }
    const results = toDisplayResults((await foodService.searchFoods(keyword)).slice(0, 20))
    if (this.data.searchRequestId !== searchRequestId) return
    this.setData({
      keyword,
      results,
      resultTitle: '搜索结果',
      recommendationHint: '',
      needsBabyProfilePrompt: false,
      hasSearched: true,
      searchFocus: true
    })
  },

  chooseFood(e) {
    const { id } = e.currentTarget.dataset
    const food = [
      ...this.data.results,
      ...this.data.popularFoods,
      ...this.data.recentFoods
    ].find((item) => item.id === id)
    writeRecentFood(food, this.data.recentFoods)
    wx.navigateTo({ url: `/pages/food/add?foodId=${id}` })
  },

  goAdd() {
    const keyword = this.data.keyword ? `?name=${encodeURIComponent(this.data.keyword)}&custom=1` : ''
    wx.navigateTo({ url: `/pages/food/add${keyword}` })
  },

  goBabySettings() {
    wx.navigateTo({ url: '/pages/settings/baby' })
  }
})
