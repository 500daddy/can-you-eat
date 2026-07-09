const { getFoodService } = require('../../utils/foodService')
const { decorateFoodIconDisplay } = require('../../utils/foodIconPolicy')
const {
  buildProcessAdvice,
  buildProcessItem,
  buildSafetyNotes
} = require('../../utils/processAdvice')

const foodService = getFoodService()

const pageDefinition = {
  data: {
    assets: foodService.getAssets(),
    loading: false,
    focusId: '',
    items: [],
    safetyNotes: []
  },

  onLoad(query = {}) {
    this.setData({ focusId: query.id || '' })
    return this.refresh()
  },

  onShow() {
    return this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const reminders = await foodService.getReminders()
      const today = (reminders.today || []).map((item) => buildProcessItem(item, '今天优先'))
      const soon = (reminders.soon || []).map((item) => buildProcessItem(item, '即将临期'))
      const items = [...today, ...soon].filter((item) => !this.data.focusId || item.id === this.data.focusId)
      this.setData({
        items: decorateFoodIconDisplay(items),
        safetyNotes: this.data.focusId ? [] : buildSafetyNotes(reminders.overdue || [])
      })
    } finally {
      this.setData({ loading: false })
    }
  }
}

Page(pageDefinition)

module.exports = {
  buildProcessAdvice,
  buildProcessItem,
  buildSafetyNotes,
  pageDefinition
}
