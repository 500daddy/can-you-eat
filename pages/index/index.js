const { getFoodService } = require('../../utils/foodService')
const { decorateFoodIconSections } = require('../../utils/foodIconPolicy')
const { daysBetween, todayString } = require('../../utils/foodRules')

const foodService = getFoodService()
const riskSectionTitle = '不建议继续食用'
const riskStatuses = new Set(['not_recommended', 'expired'])
const riskCollapseAdultOverdueDays = 3
const riskCollapseSavedDays = 7
const dailyReminderKeyPrefix = 'home_urgent_reminder_seen_'
const homeGuideDismissedKey = 'home_feature_guide_dismissed'

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

function findSection(sections, title) {
  return sections.find((item) => item.title === title) || { title, items: [] }
}

function buildUrgentReminder(sections, limit = 3) {
  const todayItems = findSection(sections, '今天建议处理').items.map((item) => ({
    ...item,
    reminderReason: '今天建议处理'
  }))
  const riskItems = findSection(sections, riskSectionTitle).items.map((item) => ({
    ...item,
    reminderReason: '不建议继续给宝宝'
  }))
  const items = [...riskItems, ...todayItems].slice(0, limit)
  if (!items.length) return null
  return {
    title: riskItems.length ? '有食材需要谨慎处理' : '今天有食材建议处理',
    content: items.map((item) => `${item.name || item.foodName || '食材'}：${item.reminderReason}`).join('\n'),
    count: riskItems.length + todayItems.length,
    action: todayItems.length ? 'quick' : 'risk'
  }
}

function storageGet(key) {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return ''
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

function storageSet(key, value) {
  if (typeof wx === 'undefined' || !wx.setStorageSync) return
  try {
    wx.setStorageSync(key, value)
  } catch (error) {
    // Ignore storage failures so reminders never block the home page.
  }
}

function safeDaysBetween(from, to) {
  if (!from || !to) return null
  const days = daysBetween(from, to)
  return Number.isFinite(days) ? days : null
}

function isStaleRiskFood(food, today = todayString()) {
  if (!food || !riskStatuses.has(food.status)) return false
  const adultOverdueDays = safeDaysBetween(food.adultExpireDate, today)
  if (adultOverdueDays !== null && adultOverdueDays >= riskCollapseAdultOverdueDays) {
    return true
  }
  const savedDays = safeDaysBetween(food.purchaseDate, today)
  return savedDays !== null && savedDays >= riskCollapseSavedDays
}

function buildDisplaySections(sections, options = {}) {
  const today = options.today || todayString()
  const riskCollapsedExpanded = Boolean(options.riskCollapsedExpanded)
  return sections.map((section) => {
    if (section.title !== riskSectionTitle) {
      return {
        ...section,
        totalCount: section.items.length,
        collapsedCount: 0,
        collapsedExpanded: false,
        collapsedTitle: '',
        collapsedDesc: '',
        collapsedAction: ''
      }
    }

    const visibleItems = []
    const collapsedItems = []
    section.items.forEach((food) => {
      if (isStaleRiskFood(food, today)) {
        collapsedItems.push(food)
      } else {
        visibleItems.push(food)
      }
    })

    return {
      ...section,
      items: riskCollapsedExpanded ? [...visibleItems, ...collapsedItems] : visibleItems,
      totalCount: section.items.length,
      collapsedCount: collapsedItems.length,
      collapsedExpanded: riskCollapsedExpanded,
      collapsedTitle: riskCollapsedExpanded ? '已展开较久未处理食材' : '已折叠较久未处理食材',
      collapsedDesc: riskCollapsedExpanded
        ? '点这里收起，让首页更清爽'
        : `${collapsedItems.length} 个已经超过参考期较久，点这里展开处理`,
      collapsedAction: riskCollapsedExpanded ? '收起' : '展开'
    }
  })
}

Page({
  data: {
    assets: foodService.getAssets(),
    settings: {},
    babyAgeText: '8个月12天',
    records: [],
    baseSections: [],
    allSections: [],
    sections: [],
    activeStatusFilter: 'all',
    riskCollapsedExpanded: false,
    homeGuideVisible: false,
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
    const baseSections = decorateFoodIconSections(allSections)
    const displaySections = buildDisplaySections(baseSections, {
      riskCollapsedExpanded: this.data.riskCollapsedExpanded
    })
    const activeStatusFilter = this.data.activeStatusFilter || 'all'
    this.setData({
      settings,
      babyAgeText: settings.babyAgeText,
      records,
      baseSections,
      allSections: displaySections,
      sections: filterSections(displaySections, activeStatusFilter),
      homeGuideVisible: !storageGet(homeGuideDismissedKey),
      statusFilters: buildStatusFilters(allSections, records.length)
    })
    this.maybeShowUrgentReminder(baseSections)
  },

  buildSections() {
    this.refreshRecords()
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/food/name-search' })
  },

  goCategory() {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync('food_search_entry', 'category')
    }
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

  dismissHomeGuide() {
    storageSet(homeGuideDismissedKey, '1')
    this.setData({ homeGuideVisible: false })
  },

  chooseStatusFilter(e) {
    const key = e.currentTarget.dataset.key || 'all'
    this.setData({
      activeStatusFilter: key,
      sections: filterSections(this.data.allSections, key)
    })
  },

  toggleCollapsedRisk() {
    const riskCollapsedExpanded = !this.data.riskCollapsedExpanded
    const allSections = buildDisplaySections(this.data.baseSections, {
      riskCollapsedExpanded
    })
    this.setData({
      riskCollapsedExpanded,
      allSections,
      sections: filterSections(allSections, this.data.activeStatusFilter || 'all')
    })
  },

  maybeShowUrgentReminder(sections) {
    if (typeof wx === 'undefined' || !wx.showModal) return
    const reminder = buildUrgentReminder(sections)
    if (!reminder) return
    const today = todayString()
    const key = `${dailyReminderKeyPrefix}${today}`
    if (storageGet(key)) return
    storageSet(key, '1')
    wx.showModal({
      title: reminder.title,
      content: `${reminder.content}${reminder.count > 3 ? `\n还有 ${reminder.count - 3} 个可在首页查看。` : ''}`,
      confirmText: reminder.action === 'quick' ? '去处理' : '看风险',
      cancelText: '今天不提醒',
      confirmColor: '#2f8d3d',
      success: (res) => {
        if (res.confirm && reminder.action === 'quick') {
          this.goQuickProcess()
        } else if (res.confirm && reminder.action === 'risk') {
          this.setData({
            activeStatusFilter: 'risk',
            sections: filterSections(this.data.allSections, 'risk')
          })
        }
      }
    })
  }
})

module.exports = {
  buildUrgentReminder,
  buildStatusFilters,
  buildDisplaySections,
  isStaleRiskFood,
  filterSections
}
