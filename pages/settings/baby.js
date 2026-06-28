const { getFoodService } = require('../../utils/foodService')
const { getBabyAgePickerOptions } = require('../../utils/babyAge')
const { resolveBabyAvatar } = require('../../utils/babyProfile')

const foodService = getFoodService()
const ageOptions = getBabyAgePickerOptions()

function normalizeAllergens(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value || '').split(/[、,，\s]/).map((item) => item.trim()).filter(Boolean)
}

function navigateBackAfterSave() {
  if (typeof wx === 'undefined') return
  if (typeof getCurrentPages === 'function' && getCurrentPages().length <= 1 && wx.switchTab) {
    wx.switchTab({ url: '/pages/mine/index' })
    return
  }
  if (wx.navigateBack) {
    wx.navigateBack({ delta: 1 })
  }
}

function cropAvatarImage(src) {
  if (typeof wx === 'undefined' || !wx.cropImage) return Promise.resolve(src)
  return new Promise((resolve) => {
    wx.cropImage({
      src,
      cropScale: '1:1',
      success: (res) => resolve(res.tempFilePath || src),
      fail: () => resolve(src)
    })
  })
}

function setCustomAvatar(page, avatarUrl) {
  if (!avatarUrl) return
  page.setData({
    babyAvatarUrl: avatarUrl,
    babyAvatarImage: avatarUrl
  })
}

function openAvatarCropper(page, src) {
  if (typeof wx === 'undefined') return Promise.resolve()
  if (wx.navigateTo) {
    wx.navigateTo({
      url: `/pages/avatar-crop/index?src=${encodeURIComponent(src)}`,
      events: {
        avatarCropped: (payload = {}) => {
          setCustomAvatar(page, payload.avatarUrl || payload.tempFilePath)
        }
      },
      fail: () => {
        cropAvatarImage(src).then((croppedAvatarUrl) => setCustomAvatar(page, croppedAvatarUrl))
      }
    })
    return Promise.resolve()
  }
  return cropAvatarImage(src).then((croppedAvatarUrl) => setCustomAvatar(page, croppedAvatarUrl))
}

Page({
  data: {
    assets: foodService.getAssets(),
    nickname: '小芽贝',
    babyAvatarUrl: '',
    babyAvatarImage: '',
    babyAgeMonths: 8,
    ageOptionIndex: 8,
    ageOptions,
    babyGender: '',
    babyMode: true,
    allergenInput: '',
    allergens: [],
    genderOptions: [
      { value: '', text: '暂不设置' },
      { value: 'boy', text: '男宝' },
      { value: 'girl', text: '女宝' }
    ]
  },

  async onLoad() {
    const settings = await foodService.getSettings()
    const babyAgeMonths = settings.babyAgeMonths === undefined ? 8 : settings.babyAgeMonths
    const foundIndex = ageOptions.findIndex((item) => item.months === babyAgeMonths)
    const babyAvatarUrl = settings.babyAvatarUrl || ''
    this.setData({
      nickname: settings.babyName,
      babyAvatarUrl,
      babyAvatarImage: settings.babyAvatarImage || resolveBabyAvatar({ ...settings, babyAvatarUrl }, foodService.getAssets()),
      babyAgeMonths,
      ageOptionIndex: foundIndex >= 0 ? foundIndex : 8,
      babyGender: settings.babyGender || '',
      babyMode: settings.babyMode,
      babyAgeText: settings.babyAgeText,
      allergens: normalizeAllergens(settings.babyAllergens)
    })
  },

  onAgeChange(e) {
    const ageOptionIndex = Number(e.detail.value) || 0
    const option = this.data.ageOptions[ageOptionIndex] || this.data.ageOptions[0]
    const patch = {
      ageOptionIndex,
      babyAgeMonths: option.months,
      babyAgeText: option.text
    }
    if (!this.data.babyAvatarUrl) {
      patch.babyAvatarImage = resolveBabyAvatar({
        babyAgeMonths: option.months,
        babyGender: this.data.babyGender
      }, foodService.getAssets())
    }
    this.setData(patch)
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  chooseAvatar() {
    if (typeof wx === 'undefined' || !wx.chooseMedia) return Promise.resolve()
    return new Promise((resolve) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          const babyAvatarUrl = file && (file.tempFilePath || file.path)
          if (babyAvatarUrl) {
            openAvatarCropper(this, babyAvatarUrl).then(resolve)
            return
          }
          resolve()
        },
        fail: () => resolve()
      })
    })
  },

  clearAvatar() {
    const settings = {
      babyAgeMonths: this.data.babyAgeMonths,
      babyGender: this.data.babyGender,
      babyAvatarUrl: ''
    }
    this.setData({
      babyAvatarUrl: '',
      babyAvatarImage: resolveBabyAvatar(settings, foodService.getAssets())
    })
  },

  selectGender(e) {
    const babyGender = e.currentTarget.dataset.value || ''
    const patch = { babyGender }
    if (!this.data.babyAvatarUrl) {
      patch.babyAvatarImage = resolveBabyAvatar({
        babyAgeMonths: this.data.babyAgeMonths,
        babyGender
      }, foodService.getAssets())
    }
    this.setData(patch)
  },

  onSwitch(e) {
    this.setData({ babyMode: e.detail.value })
  },

  onAllergenInput(e) {
    this.setData({ allergenInput: e.detail.value })
  },

  addAllergen() {
    const next = String(this.data.allergenInput || '').trim()
    if (!next) return
    const allergens = normalizeAllergens([...this.data.allergens, next])
    this.setData({
      allergens: Array.from(new Set(allergens)),
      allergenInput: ''
    })
  },

  removeAllergen(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      allergens: this.data.allergens.filter((_, currentIndex) => currentIndex !== index)
    })
  },

  async save() {
    await foodService.updateSettings({
      babyName: this.data.nickname,
      babyAvatarUrl: this.data.babyAvatarUrl,
      babyAgeMonths: this.data.babyAgeMonths,
      babyGender: this.data.babyGender,
      babyAllergens: this.data.allergens,
      babyMode: this.data.babyMode
    })
    const settings = await foodService.getSettings()
    this.setData({ babyAgeText: settings.babyAgeText })
    wx.showToast({ title: '已保存设置', icon: 'success' })
    navigateBackAfterSave()
  }
})
