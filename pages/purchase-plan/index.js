const { getFoodService } = require('../../utils/foodService')
const { todayString } = require('../../utils/foodRules')

const foodService = getFoodService()

const storageTextMap = {
  room: '常温',
  fridge: '冷藏',
  freezer: '冷冻'
}

function formatRange(food, storageMethod, fieldName, fallback) {
  const range = food && food[storageMethod]
  if (fieldName === 'baby' && food && food.babyDays) return food.babyDays
  if (fieldName === 'adult' && food && food.adultDays) return food.adultDays
  if (!range) return fallback
  const min = Number(range[`${fieldName}DaysMin`] || range[`${fieldName}DaysMax`] || 0)
  const max = Number(range[`${fieldName}DaysMax`] || min || 0)
  if (!max) return fallback
  if (min && min !== max) return `${min}-${max}天`
  return `${max}天`
}

function buildStorageGuide(foodName = '', food = null) {
  const name = String(foodName || '').trim()
  if (!name) {
    return '输入食材名称后，小管家会展示参考保存方式和保存期；买到后转库存时还能按实际情况修改。'
  }
  if (!food) {
    return `暂未收录「${name}」的保存建议。可以先加入采购计划，买到后转为库存时选择自定义食材，并按实际保存方式设置提醒。`
  }
  const storageMethod = food.defaultStorage || 'fridge'
  const storageText = storageTextMap[storageMethod] || '冷藏'
  const babyDays = formatRange(food, storageMethod, 'baby', '以转库存时提示为准')
  const adultDays = formatRange(food, storageMethod, 'adult', '以实际状态判断')
  return `「${food.name}」参考${storageText}保存；宝宝建议期：${babyDays}；成人参考期：${adultDays}。买到后转库存时可按实际保存方式修改。`
}

function findFood(foods, idOrName) {
  const query = String(idOrName || '').trim()
  return (foods || []).find((item) => {
    const aliases = Array.isArray(item.aliases) ? item.aliases : String(item.aliases || '').split(/[、,，\s]/)
    return item.id === query || item.name === query || aliases.includes(query)
  }) || null
}

Page({
  data: {
    assets: foodService.getAssets(),
    foodBase: [],
    quickFoods: [],
    plans: [],
    storageGuide: buildStorageGuide(),
    form: {
      foodBaseId: '',
      foodName: '',
      plannedDate: todayString(),
      storageMethod: '',
      quantity: '',
      unit: ''
    },
    saving: false
  },

  async onLoad() {
    await this.refresh()
  },

  async refresh() {
    const foodBase = await foodService.getFoodBase()
    const plans = await foodService.getPurchasePlans()
    this.setData({ foodBase, quickFoods: foodBase.slice(0, 12), plans })
  },

  onFoodNameInput(e) {
    const foodName = e.detail.value
    const matchedFood = findFood(this.data.foodBase, foodName)
    this.setData({
      'form.foodName': foodName,
      'form.foodBaseId': matchedFood ? matchedFood.id : '',
      'form.storageMethod': matchedFood ? (matchedFood.defaultStorage || 'fridge') : '',
      storageGuide: buildStorageGuide(foodName, matchedFood)
    })
  },

  onDateChange(e) {
    this.setData({ 'form.plannedDate': e.detail.value })
  },

  onQuantityInput(e) {
    this.setData({ 'form.quantity': e.detail.value })
  },

  onUnitInput(e) {
    this.setData({ 'form.unit': e.detail.value })
  },

  selectFood(e) {
    const food = findFood(this.data.foodBase, e.currentTarget.dataset.id)
    if (!food) return
    const storageMethod = food.defaultStorage || 'fridge'
    this.setData({
      'form.foodBaseId': food.id,
      'form.foodName': food.name,
      'form.storageMethod': storageMethod,
      storageGuide: buildStorageGuide(food.name, food)
    })
  },

  async addPlan() {
    if (this.data.saving) return
    const form = this.data.form
    if (!String(form.foodName || '').trim()) {
      wx.showToast({ title: '请填写计划购买的食材', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await foodService.addPurchasePlan({
        foodBaseId: form.foodBaseId,
        foodName: form.foodName,
        plannedDate: form.plannedDate,
        storageMethod: form.storageMethod,
        quantity: form.quantity,
        unit: form.unit
      })
      wx.showToast({ title: '已加入采购计划', icon: 'success' })
      this.setData({
        form: {
          foodBaseId: '',
          foodName: '',
          plannedDate: todayString(),
          storageMethod: '',
          quantity: '',
          unit: ''
        },
        storageGuide: buildStorageGuide()
      })
      await this.refresh()
    } catch (error) {
      wx.showToast({ title: '保存计划失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async convertToFoodRecord(e) {
    const planId = e.currentTarget.dataset.id
    const plan = this.data.plans.find((item) => item.id === planId)
    if (!plan) return
    const query = plan.foodBaseId && plan.foodBaseId !== 'custom'
      ? `foodId=${encodeURIComponent(plan.foodBaseId)}`
      : `name=${encodeURIComponent(plan.name)}&custom=1`
    wx.navigateTo({ url: `/pages/food/add?${query}&fromPlan=${encodeURIComponent(planId)}` })
  },

  async deletePlan(e) {
    const planId = e.currentTarget.dataset.id
    const planName = e.currentTarget.dataset.name || '这条采购计划'
    if (!planId) return

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '删除采购计划',
        content: `确定删除「${planName}」吗？删除后不会影响库存记录。`,
        confirmText: '删除',
        confirmColor: '#d84f3f',
        cancelText: '取消',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return

    try {
      await foodService.finishPurchasePlan({ planId, action: 'deleted' })
      wx.showToast({ title: '已删除', icon: 'success' })
      await this.refresh()
    } catch (error) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})

module.exports = {
  buildStorageGuide
}
