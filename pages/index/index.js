const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

const statusFilterDefs = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日处理', title: '今天建议处理' },
  { key: 'adult', label: '可给大人', title: '可留给大人吃' },
  { key: 'risk', label: '不建议', title: '不建议继续食用' },
  { key: 'fresh', label: '新鲜', title: '新鲜食材' }
]

function countSectionItems(sections, title) {
  const section = sections.find((item) => item.title === title)
  return section ? section.items.length : 0
}

function buildStatusFilters(sections, total) {
  return statusFilterDefs.map((item) => ({
    ...item,
    count: item.key === 'all' ? total : countSectionItems(sections, item.title)
  }))
}

function filterSections(sections, key) {
  const filter = statusFilterDefs.find((item) => item.key === key)
  if (!filter || filter.key === 'all') return sections
  return sections.filter((item) => item.title === filter.title)
}

Page({
  data: {
    assets: foodService.getAssets(),
    settings: {},
    babyAgeText: '8个月12天',
    records: [],
    allSections: [],
    sections: [],
    activeStatusFilter: 'all',
    statusFilters: []
  },

  onLoad() {
    this.buildSections()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.refreshRecords()
  },

  async refreshRecords() {
    const settings = await foodService.getSettings()
    const records = await foodService.getFoodRecords()
    const allSections = await foodService.getHomeSections()
    const activeStatusFilter = this.data.activeStatusFilter || 'all'
    this.setData({
      settings,
      babyAgeText: settings.babyAgeText,
      records,
      allSections,
      sections: filterSections(allSections, activeStatusFilter),
      statusFilters: buildStatusFilters(allSections, records.length)
    })
  },

  buildSections() {
    this.refreshRecords()
  },

  goAdd() {
    wx.switchTab({ url: '/pages/food/search' })
  },

  goRecognize() {
    wx.navigateTo({ url: '/pages/recognize/index' })
  },

  goPurchasePlan() {
    wx.navigateTo({ url: '/pages/purchase-plan/index' })
  },

  goQuickProcess() {
    wx.navigateTo({ url: '/pages/quick-process/index' })
  },

  chooseStatusFilter(e) {
    const key = e.currentTarget.dataset.key || 'all'
    this.setData({
      activeStatusFilter: key,
      sections: filterSections(this.data.allSections, key)
    })
  }
})

module.exports = {
  buildStatusFilters,
  filterSections
}
