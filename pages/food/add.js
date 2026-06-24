const { getFoodService } = require('../../utils/foodService')
const { todayString } = require('../../utils/foodRules')

const foodService = getFoodService()

const customRemindTextMap = {
  room: '自定义食材按保守规则提醒：常温约 1 天内优先处理。',
  fridge: '自定义食材按保守规则提醒：冷藏约 2 天内优先处理。',
  freezer: '自定义食材按保守规则提醒：冷冻约 15 天内优先处理。'
}

function buildRemindText(isCustomFood, storageMethod) {
  if (isCustomFood) {
    return customRemindTextMap[storageMethod] || customRemindTextMap.fridge
  }
  return '宝宝建议期结束前 1 天提醒'
}

Page({
  data: {
    assets: foodService.getAssets(),
    isCustomFood: false,
    selectedFoodHint: '默认推荐保存方式已带入',
    form: {
      foodId: 'broccoli',
      name: '西兰花',
      icon: foodService.getAssets().food.broccoli,
      purchaseDate: todayString(),
      storageMethod: 'fridge',
      quantity: '1',
      unit: '颗',
      isBabyFood: true,
      note: '',
      remindText: buildRemindText(false, 'fridge')
    },
    saving: false,
    storageOptions: [
      { key: 'room', text: '常温' },
      { key: 'fridge', text: '冷藏' },
      { key: 'freezer', text: '冷冻' }
    ]
  },

  async onLoad(query = {}) {
    if (query.foodId) {
      const food = await foodService.getFoodBaseById(query.foodId)
      if (!food) {
        return
      }
      this.setData({
        form: {
          ...this.data.form,
          foodId: food.id,
          name: food.name,
          icon: food.icon,
          storageMethod: food.defaultStorage,
          remindText: buildRemindText(false, food.defaultStorage)
        },
        isCustomFood: false,
        selectedFoodHint: '默认推荐保存方式已带入'
      })
    } else if (query.name) {
      const name = decodeURIComponent(query.name)
      this.setData({
        form: {
          ...this.data.form,
          foodId: 'custom',
          name,
          icon: this.data.assets.food.babyPuree,
          storageMethod: 'fridge',
          quantity: '',
          unit: '',
          remindText: buildRemindText(true, 'fridge')
        },
        isCustomFood: true,
        selectedFoodHint: '自定义食材会按更保守的保存期提醒'
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
    const storageMethod = e.currentTarget.dataset.key
    this.setData({
      'form.storageMethod': storageMethod,
      'form.remindText': buildRemindText(this.data.isCustomFood, storageMethod)
    })
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

  async save() {
    if (this.data.saving) return
    const form = this.data.form
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写食材名称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await foodService.addFoodRecord({
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
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/food/search' })
  }
})
