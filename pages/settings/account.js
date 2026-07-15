const { getAccountService } = require('../../utils/accountService')
const assets = require('../../utils/assets')

const accountService = getAccountService()

const roleLabels = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}

function confirmLogout() {
  if (typeof wx === 'undefined' || !wx.showModal) return Promise.resolve(false)
  return new Promise((resolve) => {
    wx.showModal({
      title: '退出登录',
      content: '这台设备将退出家庭食材库，云端记录不会删除。确定退出吗？',
      confirmText: '退出',
      confirmColor: '#b24b3f',
      cancelText: '取消',
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    })
  })
}

function sessionView(session = {}) {
  const profile = session.profile || {}
  const familyContext = session.family || {}
  const family = familyContext.family || {}
  const membership = familyContext.membership || {}
  const members = Array.isArray(familyContext.members) ? familyContext.members : []
  return {
    loggedIn: session.loggedIn === true,
    nickname: profile.nickname || '',
    avatarUrl: profile.avatarUrl || '',
    syncStatus: session.syncStatus || 'idle',
    familyName: family.name || '',
    familyRoleText: roleLabels[membership.role] || '成员',
    familyMemberCount: members.length
  }
}

Page({
  data: {
    assets,
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    syncStatus: 'idle',
    familyName: '',
    familyRoleText: '成员',
    familyMemberCount: 0,
    saving: false,
    syncing: false
  },

  async onLoad() {
    let session = accountService.getSession()
    if (session.loggedIn && typeof accountService.refresh === 'function') {
      session = await accountService.refresh()
    }
    this.applySession(session)
  },

  applySession(session) {
    this.setData(sessionView(session))
  },

  notifyAccountUpdated(session) {
    if (typeof this.getOpenerEventChannel !== 'function') return
    const eventChannel = this.getOpenerEventChannel()
    if (eventChannel && typeof eventChannel.emit === 'function') {
      eventChannel.emit('accountUpdated', session)
    }
  },

  onChooseAvatar(event) {
    const avatarUrl = event && event.detail && event.detail.avatarUrl
    if (avatarUrl) this.setData({ avatarUrl })
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value })
  },

  onNicknameChange(event) {
    this.setData({ nickname: event.detail.value })
  },

  onNicknameBlur(event) {
    this.setData({ nickname: event.detail.value })
  },

  async saveAccount() {
    if (this.data.saving) return
    const nickname = String(this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入家长昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const wasLoggedIn = this.data.loggedIn
      const input = { nickname, avatarUrl: this.data.avatarUrl }
      const session = wasLoggedIn
        ? await accountService.updateProfile(input)
        : await accountService.login(input)
      this.applySession(session)
      this.notifyAccountUpdated(session)
      wx.showToast({ title: wasLoggedIn ? '已保存' : '登录成功', icon: 'success' })
      if (wx.navigateBack) wx.navigateBack({ delta: 1 })
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async retrySync() {
    if (this.data.syncing) return
    this.setData({ syncing: true })
    try {
      const session = await accountService.retryPendingSync()
      this.applySession(session)
      wx.showToast({
        title: session.syncStatus === 'synced' ? '同步完成' : '仍有内容未同步',
        icon: session.syncStatus === 'synced' ? 'success' : 'none'
      })
    } catch (error) {
      wx.showToast({ title: '同步失败，请重试', icon: 'none' })
    } finally {
      this.setData({ syncing: false })
    }
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  async logout() {
    const confirmed = await confirmLogout()
    if (!confirmed) return
    const session = await Promise.resolve(accountService.logout())
    this.notifyAccountUpdated(session)
    wx.showToast({ title: '已退出登录', icon: 'success' })
    wx.switchTab({ url: '/pages/mine/index' })
  }
})
