const { getFoodService } = require('../../utils/foodService')
const { createShareHandlers } = require('../../utils/share')

const foodService = getFoodService()

Page({
  ...createShareHandlers({ timeline: true }),

  data: {
    typeOptions: [
      { key: 'food_not_found', text: '没有找到食材' },
      { key: 'wrong_storage_info', text: '保存建议不准' },
      { key: 'recognition_wrong', text: '识别结果不准' },
      { key: 'general', text: '其他建议' }
    ],
    form: {
      type: 'food_not_found',
      foodName: '',
      content: ''
    },
    submitting: false
  },

  onLoad(query = {}) {
    const nextForm = { ...this.data.form }
    if (query.type) nextForm.type = query.type
    if (query.foodName) nextForm.foodName = decodeURIComponent(query.foodName)
    if (query.content) nextForm.content = decodeURIComponent(query.content)
    this.setData({ form: nextForm })
  },

  chooseType(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.key })
  },

  onFoodNameInput(e) {
    this.setData({ 'form.foodName': e.detail.value })
  },

  onContentInput(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  async submit() {
    if (this.data.submitting) return
    const form = this.data.form
    if (!form.content.trim()) {
      wx.showToast({ title: '请写一点反馈内容', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await foodService.submitFeedback(form)
      wx.showToast({ title: '已收到反馈', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.showToast({ title: '反馈提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
