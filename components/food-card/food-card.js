const { getFoodService } = require('../../utils/foodService')

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
      const id = this.properties.food.id
      if (!id) return
      wx.navigateTo({
        url: `/pages/food/detail?id=${id}`
      })
    },

    async markFinished() {
      const id = this.properties.food.id
      if (id) {
        await getFoodService().finishFoodRecord({ recordId: id, action: 'finished' })
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
