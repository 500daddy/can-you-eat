const { getFoodService } = require('../../utils/foodService')
const { createShareHandlers } = require('../../utils/share')

const foodService = getFoodService()

Page({
  ...createShareHandlers(),

  data: {
    assets: foodService.getAssets(),
    form: {},
    saving: false,
    storageOptions: [
      { key: 'room', text: '常温' },
      { key: 'fridge', text: '冷藏' },
      { key: 'freezer', text: '冷冻' }
    ]
  },

  async onLoad(query) {
    const { record } = await foodService.getFoodDetail(query.id)
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.setData({
      form: {
        ...record,
        quantity: record.quantity || '1',
        unit: record.unit || '份',
        isBabyFood: record.isBabyFood !== false
      }
    })
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value })
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

  async save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      await foodService.updateFoodRecord({
        recordId: this.data.form.id,
        purchaseDate: this.data.form.purchaseDate,
        storageMethod: this.data.form.storageMethod,
        quantity: this.data.form.quantity,
        unit: this.data.form.unit,
        isBabyFood: this.data.form.isBabyFood,
        note: this.data.form.note
      })
      wx.showToast({ title: '已保存修改', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
