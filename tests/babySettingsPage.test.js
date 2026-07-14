const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadBabySettingsPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/settings/baby')
  delete require.cache[servicePath]
  delete require.cache[pagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require('../pages/settings/baby')
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[servicePath]
  return definition
}

function createPageInstance(definition) {
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    ...definition
  }
}

test('baby settings page saves gender and allergens then returns', async () => {
  const updates = []
  let returned = false
  const pageDefinition = loadBabySettingsPage({
    getAssets: () => ({ mascot: { babyBasket: '/baby.png' } }),
    getSettings: async () => ({
      babyName: '500',
      babyAgeMonths: 30,
      babyAgeText: '2岁半',
      babyAvatarUrl: '/tmp/old-avatar.jpg',
      babyMode: true,
      babyGender: 'girl',
      babyAllergens: ['鸡蛋']
    }),
    updateSettings: async (input) => {
      updates.push(input)
      return input
    }
  })
  const page = createPageInstance(pageDefinition)
  global.wx = {
    showToast: () => {},
    navigateBack: () => {
      returned = true
    }
  }

  await page.onLoad()
  page.onAgeChange({ detail: { value: 24 } })
  page.selectGender({ currentTarget: { dataset: { value: 'boy' } } })
  page.onAllergenInput({ detail: { value: '牛奶' } })
  page.addAllergen()
  await page.save()

  delete global.wx
  assert.match(updates[0].babyProfileUpdatedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual({
    ...updates[0],
    babyProfileUpdatedAt: undefined
  }, {
    babyName: '500',
    babyAvatarUrl: '/tmp/old-avatar.jpg',
    babyAgeMonths: page.data.ageOptions[24].months,
    babyMode: true,
    babyGender: 'boy',
    babyAllergens: ['鸡蛋', '牛奶'],
    babyProfileUpdatedAt: undefined
  })
  assert.equal(returned, true)
})

test('baby settings page leaves nickname empty when profile is logged out', async () => {
  const page = createPageInstance(loadBabySettingsPage({
    getAssets: () => ({ mascot: { babyBasket: '/baby.png' } }),
    getSettings: async () => ({
      babyName: '未登录',
      babyAgeMonths: 0,
      babyAgeText: '0个月',
      babyMode: false,
      babyAvatarUrl: ''
    }),
    updateSettings: async (input) => input
  }))

  await page.onLoad()

  assert.equal(page.data.nickname, '')
  assert.equal(page.data.babyAgeText, '0个月')
})

test('baby settings page starts unset and requires an explicit age selection', async () => {
  const updates = []
  const toasts = []
  const pageDefinition = loadBabySettingsPage({
    getAssets: () => ({ mascot: { babyBasket: '/baby.png' } }),
    getSettings: async () => ({
      babyName: '',
      babyAgeMonths: null,
      babyAgeText: '',
      babyMode: false,
      babyAvatarUrl: ''
    }),
    updateSettings: async (input) => {
      updates.push(input)
      return input
    }
  })
  const page = createPageInstance(pageDefinition)
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.onLoad()
  await page.save()
  page.onSwitch({ detail: { value: true } })

  delete global.wx
  assert.equal(page.data.nickname, '')
  assert.equal(page.data.babyAgeMonths, null)
  assert.equal(page.data.babyAgeText, '')
  assert.equal(page.data.ageSelected, false)
  assert.equal(page.data.babyMode, false)
  assert.deepEqual(updates, [])
  assert.deepEqual(toasts, [
    { title: '请选择宝宝月龄', icon: 'none' },
    { title: '请先选择宝宝月龄', icon: 'none' }
  ])
})

test('baby settings page blocks saving when current member cannot edit baby settings', async () => {
  const updates = []
  const toasts = []
  const pageDefinition = loadBabySettingsPage({
    getAssets: () => ({ mascot: { babyBasket: '/baby.png' } }),
    getSettings: async () => ({
      babyName: '小米粒',
      babyAgeMonths: 11,
      babyAgeText: '11个月',
      babyMode: true,
      canEditBabySettings: false
    }),
    updateSettings: async (input) => {
      updates.push(input)
      return input
    }
  })
  const page = createPageInstance(pageDefinition)
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.onLoad()
  await page.save()

  delete global.wx
  assert.equal(page.data.canEditBabySettings, false)
  assert.deepEqual(updates, [])
  assert.deepEqual(toasts, [{ title: '宝宝资料由家庭创建者维护', icon: 'none' }])
})

test('baby settings page opens a custom cropper before accepting uploaded avatar', async () => {
  const updates = []
  const navigations = []
  const page = createPageInstance(loadBabySettingsPage({
    getAssets: () => ({ mascot: { babyBasket: '/baby.png' } }),
    getSettings: async () => ({
      babyName: '500',
      babyAgeMonths: 11,
      babyAgeText: '11个月',
      babyMode: true,
      babyAvatarUrl: ''
    }),
    updateSettings: async (input) => {
      updates.push(input)
      return input
    }
  }))
  global.wx = {
    chooseMedia: (input) => {
      input.success({ tempFiles: [{ tempFilePath: '/tmp/new-avatar.jpg' }] })
    },
    navigateTo: (input) => {
      navigations.push(input)
    },
    showToast: () => {},
    navigateBack: () => {}
  }

  await page.onLoad()
  await page.chooseAvatar()
  assert.match(navigations[0].url, /^\/pages\/avatar-crop\/index\?src=/)
  assert.match(decodeURIComponent(navigations[0].url), /\/tmp\/new-avatar\.jpg/)
  navigations[0].events.avatarCropped({ avatarUrl: '/tmp/cropped-avatar.jpg' })
  assert.equal(page.data.babyAvatarUrl, '/tmp/cropped-avatar.jpg')

  page.clearAvatar()
  assert.equal(page.data.babyAvatarUrl, '')

  await page.chooseAvatar()
  navigations[1].events.avatarCropped({ avatarUrl: '/tmp/cropped-avatar.jpg' })
  await page.save()

  delete global.wx
  assert.equal(updates[0].babyAvatarUrl, '/tmp/cropped-avatar.jpg')
})

test('baby settings page shows gender and allergen controls', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/settings/baby.wxml'), 'utf8')
  const stylesheet = fs.readFileSync(path.resolve(__dirname, '../pages/settings/baby.wxss'), 'utf8')

  assert.match(markup, /宝宝月龄/)
  assert.match(markup, /请选择月龄/)
  assert.match(markup, /ageSelected/)
  assert.doesNotMatch(markup, /宝宝出生日期/)
  assert.doesNotMatch(markup, /mode="date"/)
  assert.doesNotMatch(markup, /2 岁前按月选择/)
  assert.match(markup, /宝宝性别/)
  assert.match(markup, /当前宝宝：{{nickname \|\| '待设置'}}/)
  assert.match(markup, /如：小宝、团团、豆豆/)
  assert.match(markup, /过敏源/)
  assert.match(markup, /allergen-chip/)
  assert.match(markup, /avatar-action-row/)
  assert.match(markup, /avatar-secondary/)
  assert.match(markup, /avatar-helper/)
  assert.match(markup, /sticky-save-bar/)
  assert.match(markup, /宝宝资料由家庭创建者维护/)
  assert.match(markup, /canEditBabySettings/)
  assert.doesNotMatch(markup, /退出登录/)
  assert.doesNotMatch(markup, /账号与数据/)
  assert.doesNotMatch(markup, /bindtap="logout"/)
  assert.match(markup, /button-primary/)
  assert.match(markup, /button-secondary/)
  assert.match(markup, /button-compact/)
  assert.doesNotMatch(markup, /<view class="pixel-btn save-btn" bindtap="save">保存<\/view>/)
  assert.match(stylesheet, /\.settings-page/)
  assert.match(stylesheet, /\.sticky-save-bar/)
  assert.match(stylesheet, /position:\s*fixed/)
  assert.match(stylesheet, /env\(safe-area-inset-bottom\)/)
  assert.match(stylesheet, /\.button-primary/)
  assert.match(stylesheet, /\.button-secondary/)
  assert.match(stylesheet, /\.button-compact/)
  assert.doesNotMatch(stylesheet, /\.logout-card/)
  assert.doesNotMatch(stylesheet, /\.logout-btn/)
})

test('baby settings no longer owns account login or logout', () => {
  const script = fs.readFileSync(path.resolve(__dirname, '../pages/settings/baby.js'), 'utf8')
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/settings/baby.wxml'), 'utf8')

  assert.doesNotMatch(script, /markLoggedIn|markLoggedOut|resetFoodService/)
  assert.doesNotMatch(script, /clearStorageSync|async logout\(/)
  assert.doesNotMatch(markup, /退出登录|账号与数据/)
})
