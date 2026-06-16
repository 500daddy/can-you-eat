const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
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
    } finally {
      this.setData({ submitting: false })
    }
  }
})
