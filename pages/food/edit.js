const { assets, getRecord } = require('../../utils/mockData')

Page({
  data: {
    assets,
    form: {},
    storageOptions: [
      { key: 'room', text: '常温' },
      { key: 'fridge', text: '冷藏' },
      { key: 'freezer', text: '冷冻' }
    ]
  },

  onLoad(query) {
    const record = getRecord(query.id)
    this.setData({
      form: {
        ...record,
        quantity: '1',
        unit: '份',
        isBabyFood: true
      }
    })
  },

  onDateChange(e) {
    this.setData({ 'form.purchaseDate': e.detail.value })
  },

  chooseStorage(e) {
    const key = e.currentTarget.dataset.key
    const textMap = { room: '常温保存', fridge: '冷藏保存', freezer: '冷冻保存' }
    this.setData({
      'form.storageMethod': key,
      'form.storageText': textMap[key]
    })
  },

  save() {
    wx.showToast({ title: '已保存修改', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 600)
  }
})
