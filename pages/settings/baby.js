const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

Page({
  data: {
    assets: foodService.getAssets(),
    nickname: '小芽贝',
    birthday: '2025-10-01',
    babyMode: true
  },

  async onLoad() {
    const settings = await foodService.getSettings()
    this.setData({
      nickname: settings.babyName,
      birthday: settings.babyBirthday,
      babyMode: settings.babyMode
    })
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  onSwitch(e) {
    this.setData({ babyMode: e.detail.value })
  },

  async save() {
    await foodService.updateSettings({
      babyName: this.data.nickname,
      babyBirthday: this.data.birthday,
      babyMode: this.data.babyMode
    })
    wx.showToast({ title: '已保存设置', icon: 'success' })
  }
})
