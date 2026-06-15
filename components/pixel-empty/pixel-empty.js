const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()

Component({
  properties: {
    title: {
      type: String,
      value: '还没有记录宝宝食材'
    },
    desc: {
      type: String,
      value: '添加第一个食材，看看什么时候适合给宝宝吃吧'
    },
    image: {
      type: String,
      value: ''
    }
  },

  data: {
    defaultImage: repo.getAssets().mascot.emptyFridge
  },

  methods: {
    addFood() {
      wx.navigateTo({ url: '/pages/food/add' })
    },
    recognize() {
      wx.navigateTo({ url: '/pages/recognize/index' })
    }
  }
})
