const { getFoodService } = require('../../utils/foodService')
const { getAccountService } = require('../../utils/accountService')
const { createShareHandlers } = require('../../utils/share')
const assets = require('../../utils/assets')

const foodService = getFoodService()
const accountService = getAccountService()

const statActions = {
  已记录食材: { action: 'overview' },
  今日建议处理: { action: 'reminder', tab: 0 },
  即将过期: { action: 'reminder', tab: 1 },
  安心指数: { action: 'score' }
}

function decorateStats(stats = []) {
  return stats.map((item) => ({
    ...item,
    ...(statActions[item.label] || {})
  }))
}

const familyRoleLabels = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}

function decorateAccount(account = {}) {
  const familyContext = account.family || {}
  const family = familyContext.family || {}
  const membership = familyContext.membership || {}
  const members = Array.isArray(familyContext.members) ? familyContext.members : []
  return {
    loggedIn: false,
    syncStatus: 'idle',
    ...account,
    profile: account.profile || {},
    familyName: account.familyLoadError ? '' : (family.name || ''),
    familyRoleText: familyRoleLabels[membership.role] || '成员',
    familyMemberCount: members.length
  }
}

Page({
  ...createShareHandlers({ timeline: true }),

  data: {
    assets: foodService.getAssets(),
    defaultAccountAvatar: assets.account.defaultAvatar,
    account: decorateAccount(),
    stats: [],
    babySettingNote: '待设置',
    reminderTime: '08:00'
  },

  async onShow() {
    const loadVersion = (this._loadVersion || 0) + 1
    this._loadVersion = loadVersion
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    if (typeof accountService.getSession === 'function') {
      const cachedAccount = accountService.getSession()
      if (cachedAccount) this.setData({ account: decorateAccount(cachedAccount) })
    }

    const [account, stats, settings] = await Promise.all([
      accountService.refresh(),
      foodService.getStats(),
      foodService.getSettings()
    ])
    if (loadVersion !== this._loadVersion) return

    this.setData({
      account: decorateAccount(account),
      stats: decorateStats(stats),
      babySettingNote: settings && settings.babyProfileConfigured
        ? settings.babyAgeText
        : '待设置',
      reminderTime: (settings && settings.dailySummaryTime) || '08:00'
    })

    if (
      account &&
      account.loggedIn &&
      account.syncStatus === 'pending' &&
      typeof accountService.resumePendingSync === 'function'
    ) {
      Promise.resolve(accountService.resumePendingSync())
        .then((nextAccount) => {
          if (loadVersion !== this._loadVersion) return
          this.setData({ account: decorateAccount(nextAccount) })
        })
        .catch(() => {})
    }
  },

  goAccount() {
    wx.navigateTo({
      url: '/pages/settings/account?source=mine',
      events: {
        accountUpdated: (session) => this.applyAccountSession(session)
      }
    })
  },

  applyAccountSession(session) {
    this._loadVersion = (this._loadVersion || 0) + 1
    this.setData({ account: decorateAccount(session) })
  },

  async retryFamily() {
    await this.onShow()
  },

  handleStatTap(e) {
    const { action, tab } = e.currentTarget.dataset
    if (action === 'overview') {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    if (action === 'reminder') {
      if (wx.setStorageSync) wx.setStorageSync('mine_target_reminder_tab', Number(tab) || 0)
      wx.switchTab({ url: '/pages/reminder/index' })
      return
    }
    if (action === 'score') {
      wx.showModal({
        title: '安心指数',
        content: '安心指数会结合已处理记录和当前待处理风险食材估算，只用于帮助你快速了解食材管理状态。',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  goBaby() {
    wx.navigateTo({ url: '/pages/settings/baby' })
  },

  goReminder() {
    wx.navigateTo({ url: '/pages/settings/reminder' })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' })
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  }
})
