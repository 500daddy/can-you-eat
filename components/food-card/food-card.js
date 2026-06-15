const { getFoodRepository } = require('../../utils/foodRepository')

Component({
  properties: {
    food: {
      type: Object,
      value: {}
    },
    showActions: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    goDetail() {
      const id = this.properties.food.id || 'record-broccoli'
      wx.navigateTo({
        url: `/pages/food/detail?id=${id}`
      })
    },

    markFinished() {
      const id = this.properties.food.id
      if (id) {
        getFoodRepository().finishFoodRecord({ recordId: id, action: 'finished' })
      }
      wx.showToast({
        title: '已标记处理',
        icon: 'success'
      })
      this.triggerEvent('finished', { id })
    },

    noop() {
      return false
    }
  }
})
