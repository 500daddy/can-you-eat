const { assets, records } = require('../../utils/mockData')

Page({
  data: {
    assets,
    babyAgeText: '8个月12天',
    records,
    sections: []
  },

  onLoad() {
    this.buildSections()
  },

  onShow() {
    this.buildSections()
  },

  buildSections() {
    const groups = [
      '今天建议处理',
      '可留给大人吃',
      '不建议继续食用',
      '新鲜食材'
    ]
    this.setData({
      sections: groups
        .map((title) => ({
          title,
          items: records.filter((item) => item.group === title)
        }))
        .filter((section) => section.items.length)
    })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/food/add' })
  },

  goRecognize() {
    wx.navigateTo({ url: '/pages/recognize/index' })
  }
})
