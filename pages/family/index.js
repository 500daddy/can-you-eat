const { getFamilyService } = require('../../utils/familyService')
const { getAccountService } = require('../../utils/accountService')
const { getInviteContext } = require('../../utils/inviteContext')
const { createShareHandlers } = require('../../utils/share')

const familyService = getFamilyService()
const accountService = getAccountService()
const inviteContext = getInviteContext()
const roleTextMap = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}

function roleText(role) {
  if (!role) return '待确认'
  return roleTextMap[role] || '成员'
}

function userMessage(error, fallback) {
  if (error && error.code === 'ALREADY_IN_FORMAL_FAMILY') {
    return '你已加入一个家庭，暂时无法加入其他家庭'
  }
  if (error && ['INVITE_EXPIRED', 'INVITE_USED'].includes(error.code)) {
    return error.message || fallback
  }
  const message = error && error.message ? error.message : ''
  if (/collection not exists|collection.*not.*exist|集合.*不存在/i.test(message)) {
    return '家庭共享数据表未创建'
  }
  if (/家庭共享初始化失败/i.test(message)) {
    return '家庭共享初始化失败'
  }
  if (/function not found|函数.*不存在/i.test(message)) {
    return '家庭共享云函数未部署'
  }
  if (/permission denied|没有权限|权限/i.test(message)) {
    return '当前账号没有操作权限'
  }
  return fallback
}

function parentIdentity() {
  const session = accountService.getSession() || {}
  const profile = session.profile || {}
  const identity = {}
  if (profile.nickname) identity.nickname = profile.nickname
  if (profile.avatarUrl) identity.avatarUrl = profile.avatarUrl
  return identity
}

Page({
  ...createShareHandlers(),

  data: {
    loading: true,
    family: {},
    members: [],
    membership: {},
    invite: null,
    inviteCode: '',
    canInvite: false,
    canManageMembers: false,
    roleLabel: '加载中',
    loadError: false,
    invitePreview: null,
    incomingInviteId: '',
    preparingInvite: false,
    joining: false,
    loginPrompted: false,
    needsLogin: false,
    showInviteCode: false
  },

  onLoad(options = {}) {
    const inviteId = String(options.inviteId || '').trim()
    if (!inviteId) return
    inviteContext.save(inviteId)
    this.setData({ incomingInviteId: inviteId })
  },

  async onShow() {
    const handledInvite = await this.loadIncomingInvite()
    if (!handledInvite) await this.loadFamily()
  },

  async loadFamily() {
    this.setData({ loading: true })
    try {
      const result = await familyService.getMyFamily(parentIdentity())
      const membership = result.membership || {}
      const members = (result.members || []).map((item) => ({
        ...item,
        avatarText: item.nickname ? String(item.nickname).slice(0, 1) : '家',
        roleText: roleText(item.role),
        isOwner: item.role === 'owner'
      }))
      this.setData({
        loading: false,
        loadError: false,
        family: result.family || {},
        members,
        membership,
        canInvite: ['owner', 'admin'].includes(membership.role),
        canManageMembers: membership.role === 'owner',
        roleLabel: roleText(membership.role)
      })
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('family getMyFamily failed', error)
      }
      this.setData({
        loading: false,
        loadError: true,
        roleLabel: '未加载'
      })
      wx.showToast({ title: userMessage(error, '家庭信息加载失败'), icon: 'none' })
    }
  },

  async prepareInvite() {
    if (this.data.preparingInvite) return
    if (this.data.loading) {
      wx.showToast({ title: '家庭信息加载中', icon: 'none' })
      return
    }
    this.setData({ preparingInvite: true })
    try {
      const invite = await familyService.createInvite(parentIdentity())
      this.setData({ invite })
    } catch (error) {
      wx.showToast({
        title: userMessage(error, '邀请创建失败'),
        icon: 'none'
      })
    } finally {
      this.setData({ preparingInvite: false })
    }
  },

  async createInvite() {
    await this.prepareInvite()
    this.copyInvite()
  },

  onShareAppMessage() {
    const invite = this.data.invite || {}
    const session = accountService.getSession() || {}
    const nickname = (session.profile && session.profile.nickname) || '家人'
    const familyName = this.data.family.name || '家庭食材库'
    return {
      title: `${nickname}邀请你加入${familyName}`,
      path: `/pages/family/index?inviteId=${encodeURIComponent(invite.inviteId || '')}`
    }
  },

  copyInvite() {
    const invite = this.data.invite
    if (!invite || !invite.inviteId) return
    const familyName = this.data.family.name || '我的家庭'
    const text = `${familyName} 邀请你一起管理宝宝食材，邀请码：${invite.inviteId}`
    if (wx.setClipboardData) {
      wx.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: '邀请已复制', icon: 'success' })
      })
    }
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCode: String(e.detail.value || '').trim() })
  },

  toggleInviteCode() {
    this.setData({ showInviteCode: !this.data.showInviteCode })
  },

  goLoginForInvite() {
    this.setData({ loginPrompted: true })
    wx.navigateTo({ url: '/pages/settings/account?fromInvite=1' })
  },

  async loadIncomingInvite() {
    const inviteId = this.data.incomingInviteId || inviteContext.peek()
    if (!inviteId) return false
    const session = accountService.getSession() || {}
    if (!session.loggedIn) {
      this.setData({ needsLogin: true })
      if (!this.data.loginPrompted) this.goLoginForInvite()
      return true
    }

    this.setData({ needsLogin: false, loginPrompted: false })
    try {
      const invitePreview = await familyService.getInvitePreview({ inviteId })
      this.setData({ incomingInviteId: inviteId, invitePreview })
    } catch (error) {
      inviteContext.clear()
      this.setData({ incomingInviteId: '', invitePreview: null })
      wx.showToast({ title: userMessage(error, '邀请暂时无法打开'), icon: 'none' })
      await this.loadFamily()
    }
    return true
  },

  async confirmJoinInvite() {
    if (this.data.joining || !this.data.incomingInviteId) return
    this.setData({ joining: true })
    try {
      await familyService.joinFamilyByInvite({
        inviteId: this.data.incomingInviteId,
        ...parentIdentity()
      })
      inviteContext.clear()
      this.setData({
        incomingInviteId: '',
        invitePreview: null,
        needsLogin: false
      })
      wx.showToast({ title: '已加入家庭', icon: 'success' })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: userMessage(error, '加入失败'), icon: 'none' })
    } finally {
      this.setData({ joining: false })
    }
  },

  async joinByInvite() {
    if (!this.data.inviteCode) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      await familyService.joinFamilyByInvite({
        inviteId: this.data.inviteCode,
        ...parentIdentity()
      })
      wx.showToast({ title: '已加入家庭', icon: 'success' })
      inviteContext.clear()
      this.setData({ inviteCode: '', invite: null })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: error && error.message ? error.message : '加入失败', icon: 'none' })
    }
  },

  goMemberManage() {
    wx.navigateTo({ url: '/pages/family/member' })
  }
})

module.exports = {
  roleText,
  userMessage
}
