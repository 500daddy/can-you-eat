const { getFoodService } = require('../../utils/foodService')

function confirmFinish(foodName) {
  if (typeof wx === 'undefined' || !wx.showModal) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认已处理？',
      content: `确认「${foodName || '这个食材'}」已经吃掉或扔掉了吗？确认后会从首页和提醒列表移除。`,
      confirmText: '确认',
      cancelText: '取消',
      confirmColor: '#2f8d3d',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    })
  })
}

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

    goProcessAdvice() {
      const id = this.properties.food.id
      if (!id) return
      wx.navigateTo({
        url: `/pages/quick-process/index?id=${id}`
      })
    },

    async markFinished() {
      const id = this.properties.food.id
      if (!id) return
      const confirmed = await confirmFinish(this.properties.food.name)
      if (!confirmed) return
      await getFoodService().finishFoodRecord({ recordId: id, action: 'finished' })
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
