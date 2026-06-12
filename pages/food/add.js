const { assets, foodBase, getFoodBase } = require('../../utils/mockData')

Page({
  data: {
    assets,
    form: {
      foodId: 'broccoli',
      name: '西兰花',
      icon: assets.food.broccoli,
      purchaseDate: '2026-06-12',
      storageMethod: 'fridge',
      quantity: '1',
      unit: '颗',
      isBabyFood: true,
      note: '',
      remindText: '宝宝建议期结束前 1 天提醒'
    },
    storageOptions: [
      { key: 'room', text: '常温' },
      { key: 'fridge', text: '冷藏' },
      { key: 'freezer', text: '冷冻' }
    ]
  },

  onLoad(query) {
    if (query.foodId) {
      const food = getFoodBase(query.foodId)
      this.setData({
        form: {
          ...this.data.form,
          foodId: food.id,
          name: food.name,
          icon: food.icon,
          storageMethod: food.defaultStorage
        }
      })
    }
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.purchaseDate': e.detail.value })
  },

  chooseStorage(e) {
    this.setData({ 'form.storageMethod': e.currentTarget.dataset.key })
  },

  onQuantityInput(e) {
    this.setData({ 'form.quantity': e.detail.value })
  },

  onUnitInput(e) {
    this.setData({ 'form.unit': e.detail.value })
  },

  onBabySwitch(e) {
    this.setData({ 'form.isBabyFood': e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value })
  },

  save() {
    wx.showToast({ title: '已添加，可开启提醒', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 600)
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/food/search' })
  }
})
