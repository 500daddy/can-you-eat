const { getFoodRepository } = require('../../utils/foodRepository')

const repo = getFoodRepository()
const settings = repo.getSettings()

Page({
  data: {
    assets: repo.getAssets(),
    nickname: settings.babyName,
    birthday: settings.babyBirthday,
    babyMode: settings.babyMode
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

  save() {
    repo.updateSettings({
      babyName: this.data.nickname,
      babyBirthday: this.data.birthday,
      babyMode: this.data.babyMode
    })
    wx.showToast({ title: '已保存设置', icon: 'success' })
  }
})
