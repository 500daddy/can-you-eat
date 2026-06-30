const { getFoodService } = require('../../utils/foodService')
const { todayString } = require('../../utils/foodRules')

const foodService = getFoodService()

const customRemindTextMap = {
  room: '保守提醒：常温约 1 天内优先处理，不代表食材一定安全。',
  fridge: '保守提醒：冷藏约 2 天内优先处理，不代表食材一定安全。',
  freezer: '保守提醒：冷冻约 15 天内优先处理，不代表食材一定安全。'
}

const storageTextMap = {
  room: '常温',
  fridge: '冷藏',
  freezer: '冷冻'
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildPastDateOptions(today = todayString(), days = 365) {
  const baseDate = parseLocalDate(today)
  return Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(baseDate)
    date.setDate(baseDate.getDate() - index)
    const value = formatDate(date)
    const labelPrefix = index === 0 ? '今天' : index === 1 ? '昨天' : index === 2 ? '前天' : ''
    return {
      value,
      label: labelPrefix ? `${labelPrefix} ${value}` : value
    }
  })
}

function buildRemindText(isCustomFood, storageMethod) {
  if (isCustomFood) {
    return customRemindTextMap[storageMethod] || customRemindTextMap.fridge
  }
  return '宝宝建议期结束前 1 天提醒'
}

function buildStorageRecommendationText(isCustomFood, recommendedStorageMethod, storageMethod) {
  const storageText = storageTextMap[storageMethod] || '冷藏'
  const recommendedText = storageTextMap[recommendedStorageMethod] || '冷藏'
  if (isCustomFood) {
    return `自定义食材默认按${storageText}提醒，也可以按实际保存方式修改。`
  }
  if (storageMethod === recommendedStorageMethod) {
    return `小管家建议${recommendedText}保存，已帮你选好。`
  }
  return `已按实际保存方式改为${storageText}，提醒时间会跟着调整。`
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

function buildAllergenRiskNote(matches) {
  return matches.length ? `包含宝宝过敏源：${matches.join('、')}，请不要给宝宝食用。` : ''
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
    recommendedStorageMethod: 'fridge',
    storageRecommendationText: buildStorageRecommendationText(false, 'fridge', 'fridge'),
    maxSaveDate: todayString(),
    availableSaveDates: buildPastDateOptions(),
    datePickerValue: [0],
    pendingSaveDate: todayString(),
    showDateSheet: false,
    sourcePurchasePlanId: '',
    form: {
      foodId: 'broccoli',
      name: '西兰花',
      icon: foodService.getAssets().food.broccoli,
      purchaseDate: todayString(),
      storageMethod: 'fridge',
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
    this.setData({
      babyAllergens: normalizeAllergens(settings.babyAllergens),
      sourcePurchasePlanId: query.fromPlan || ''
    })
    if (query.foodId) {
      const food = await foodService.getFoodBaseById(query.foodId)
      if (!food) {
        return
      }
      const recommendedStorageMethod = food.defaultStorage || 'fridge'
      this.setData({
        form: {
          ...this.data.form,
          foodId: food.id,
          name: food.name,
          icon: food.icon,
          storageMethod: recommendedStorageMethod,
          remindText: buildRemindText(false, recommendedStorageMethod)
        },
        selectedFood: food,
        isCustomFood: false,
        selectedFoodHint: '已根据所选食材带入推荐信息',
        recommendedStorageMethod,
        storageRecommendationText: buildStorageRecommendationText(false, recommendedStorageMethod, recommendedStorageMethod)
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
          remindText: buildRemindText(true, 'fridge')
        },
        selectedFood: { name },
        isCustomFood: true,
        selectedFoodHint: '自定义食材仅按保守周期提醒，不代表食材一定安全',
        recommendedStorageMethod: 'fridge',
        storageRecommendationText: buildStorageRecommendationText(true, 'fridge', 'fridge')
      })
    }
  },

  onNameInput(e) {
    if (!this.data.isCustomFood) return
    this.setData({ 'form.name': e.detail.value })
  },

  onDateChange(e) {
    const value = e.detail.value
    this.setData({ 'form.purchaseDate': value > this.data.maxSaveDate ? this.data.maxSaveDate : value })
  },

  openDatePicker() {
    const currentDate = this.data.form.purchaseDate
    const currentIndex = this.data.availableSaveDates.findIndex((item) => item.value === currentDate)
    this.setData({
      showDateSheet: true,
      pendingSaveDate: currentDate,
      datePickerValue: [currentIndex >= 0 ? currentIndex : 0]
    })
  },

  onDatePickerChange(e) {
    const index = Number(e.detail.value && e.detail.value[0] || 0)
    const option = this.data.availableSaveDates[index]
    if (!option) return
    this.setData({
      pendingSaveDate: option.value,
      datePickerValue: [index]
    })
  },

  confirmSaveDate() {
    const nextDate = this.data.pendingSaveDate || this.data.maxSaveDate
    this.setData({
      'form.purchaseDate': nextDate > this.data.maxSaveDate ? this.data.maxSaveDate : nextDate,
      showDateSheet: false
    })
  },

  closeDatePicker() {
    this.setData({ showDateSheet: false })
  },

  noop() {
  },

  chooseStorage(e) {
    const storageMethod = e.currentTarget.dataset.key
    this.setData({
      'form.storageMethod': storageMethod,
      'form.remindText': buildRemindText(this.data.isCustomFood, storageMethod),
      storageRecommendationText: buildStorageRecommendationText(
        this.data.isCustomFood,
        this.data.recommendedStorageMethod,
        storageMethod
      )
    })
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
    if (form.purchaseDate > this.data.maxSaveDate) {
      wx.showToast({ title: '开始保存日期不能晚于今天', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const matchedAllergens = getMatchedAllergens(form, this.data.selectedFood, this.data.babyAllergens)
      const allergenRiskNote = buildAllergenRiskNote(matchedAllergens)
      if (matchedAllergens.length) {
        const shouldContinue = await confirmAllergenWarning(matchedAllergens, form.name)
        if (!shouldContinue) return
      }
      await foodService.addFoodRecord({
        foodBaseId: form.foodId,
        foodName: form.name,
        purchaseDate: form.purchaseDate,
        storageMethod: form.storageMethod,
        isBabyFood: form.isBabyFood,
        note: form.note,
        status: matchedAllergens.length ? 'not_recommended' : undefined,
        riskNote: allergenRiskNote
      })
      if (this.data.sourcePurchasePlanId && foodService.finishPurchasePlan) {
        await foodService.finishPurchasePlan({
          planId: this.data.sourcePurchasePlanId,
          action: 'purchased'
        })
      }
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
