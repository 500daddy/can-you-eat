const { getFoodRepository } = require('../../utils/foodRepository')
const { todayString } = require('../../utils/foodRules')

const repo = getFoodRepository()

Page({
  data: {
    assets: repo.getAssets(),
    form: {
      foodId: 'broccoli',
      name: '西兰花',
      icon: repo.getAssets().food.broccoli,
      purchaseDate: todayString(),
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
      const food = repo.getFoodBaseById(query.foodId)
      this.setData({
        form: {
          ...this.data.form,
          foodId: food.id,
          name: food.name,
          icon: food.icon,
          storageMethod: food.defaultStorage
        }
      })
    } else if (query.name) {
      const name = decodeURIComponent(query.name)
      this.setData({
        form: {
          ...this.data.form,
          foodId: 'custom',
          name,
          icon: this.data.assets.food.babyPuree,
          storageMethod: 'fridge'
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
    const form = this.data.form
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写食材名称', icon: 'none' })
      return
    }
    repo.addFoodRecord({
      foodBaseId: form.foodId,
      foodName: form.name,
      purchaseDate: form.purchaseDate,
      storageMethod: form.storageMethod,
      quantity: form.quantity,
      unit: form.unit,
      isBabyFood: form.isBabyFood,
      note: form.note
    })
    wx.showToast({ title: '已添加，可开启提醒', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 600)
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/food/search' })
  }
})
