const { getFoodService } = require('../../utils/foodService')
const { todayString } = require('../../utils/foodRules')

const foodService = getFoodService()

const customRemindTextMap = {
  room: '保守提醒：常温约 1 天内优先处理，不代表食材一定安全。',
  fridge: '保守提醒：冷藏约 2 天内优先处理，不代表食材一定安全。',
  freezer: '保守提醒：冷冻约 15 天内优先处理，不代表食材一定安全。'
}

function buildRemindText(isCustomFood, storageMethod) {
  if (isCustomFood) {
    return customRemindTextMap[storageMethod] || customRemindTextMap.fridge
  }
  return '宝宝建议期结束前 1 天提醒'
}

function normalizeAllergens(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value || '').split(/[、,，\s]/).map((item) => item.trim()).filter(Boolean)
}

function foodSearchText(form, selectedFood) {
  return [
    form.name,
    selectedFood && selectedFood.name,
    selectedFood && selectedFood.aliases,
    selectedFood && selectedFood.category,
    selectedFood && selectedFood.subCategory
  ].flatMap((item) => Array.isArray(item) ? item : String(item || '').split(/[、,，\s]/))
    .join(' ')
}

function getMatchedAllergens(form, selectedFood, allergens) {
  const searchText = foodSearchText(form, selectedFood)
  return normalizeAllergens(allergens).filter((allergen) => searchText.includes(allergen))
}

function confirmAllergenWarning(matches, foodName) {
  if (!matches.length || typeof wx === 'undefined' || !wx.showModal) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    wx.showModal({
      title: '过敏源提醒',
      content: `宝宝过敏源包含「${matches.join('、')}」，当前食材「${foodName}」可能不适合宝宝食用。确认仍要保存吗？`,
      confirmText: '仍要保存',
      cancelText: '先不保存',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    })
  })
}

Page({
  data: {
    assets: foodService.getAssets(),
    isCustomFood: false,
    selectedFood: null,
    babyAllergens: [],
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
    const settings = foodService.getSettings ? await foodService.getSettings() : {}
    this.setData({ babyAllergens: normalizeAllergens(settings.babyAllergens) })
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
        selectedFood: food,
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
          icon: this.data.assets.food.customFood,
          storageMethod: 'fridge',
          quantity: '',
          unit: '',
          remindText: buildRemindText(true, 'fridge')
        },
        selectedFood: { name },
        isCustomFood: true,
        selectedFoodHint: '自定义食材仅按保守周期提醒，不代表食材一定安全'
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
      const matchedAllergens = getMatchedAllergens(form, this.data.selectedFood, this.data.babyAllergens)
      if (matchedAllergens.length) {
        const shouldContinue = await confirmAllergenWarning(matchedAllergens, form.name)
        if (!shouldContinue) return
      }
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
  }
})
