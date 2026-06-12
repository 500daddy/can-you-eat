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
      wx.showToast({
        title: '已标记处理',
        icon: 'success'
      })
    },

    noop() {
      return false
    }
  }
})
