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

function familyIdOf(result = {}) {
  return (result.family && result.family.familyId) ||
    (result.membership && result.membership.familyId) || ''
}

function confirmsFamilyExit(result, originalFamilyId) {
  if (!result || !originalFamilyId) return false
  const nextFamilyId = familyIdOf(result)
  return Boolean(nextFamilyId && nextFamilyId !== originalFamilyId)
}

function familyViewData(result = {}) {
  const membership = result.membership || {}
  const members = (result.members || []).map((item) => ({
    ...item,
    avatarText: item.nickname ? String(item.nickname).slice(0, 1) : '家',
    roleText: roleText(item.role),
    isOwner: item.role === 'owner'
  }))
  return {
    loading: false,
    loadError: false,
    family: result.family || {},
    members,
    membership,
    canInvite: ['owner', 'admin'].includes(membership.role),
    canViewMembers: ['owner', 'admin', 'member'].includes(membership.role),
    canManageMembers: membership.role === 'owner',
    canLeaveFamily: ['admin', 'member'].includes(membership.role),
    roleLabel: roleText(membership.role),
    familySettling: false,
    familyConfirmationPending: false
  }
}

function isUncertainRequestError(error) {
  if (!error) return false
  const codes = [error.code, error.errCode]
    .map((value) => String(value == null ? '' : value).trim().toUpperCase())
    .filter(Boolean)
  const isBusinessCode = (code) => /(?:^|_)(?:PERMISSION|UNAUTHORIZED|FORBIDDEN|INVALID|MEMBER|INVITE|OWNER|NOT_FOUND|NOT_EXIST|ALREADY)(?:_|$)/.test(code)
  if (codes.some(isBusinessCode)) return false
  const uncertainCodes = new Set([
    '-1',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'NETWORK_ERROR',
    'REQUEST_TIMEOUT',
    'SOCKET_CLOSED',
    'TIMEOUT'
  ])
  if (codes.some((code) => uncertainCodes.has(code))) return true
  const message = [error.message, error.errMsg]
    .map((value) => String(value == null ? '' : value))
    .join(' ')
  return /timed?\s*out|timeout|network|request:\s*fail|connection|socket|ECONNRESET|ETIMEDOUT/i.test(message)
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
    canViewMembers: false,
    canManageMembers: false,
    canLeaveFamily: false,
    roleLabel: '加载中',
    loadError: false,
    invitePreview: null,
    incomingInviteId: '',
    preparingInvite: false,
    joining: false,
    leaving: false,
    familySettling: false,
    familyConfirmationPending: false,
    retryingFamilySync: false,
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

  async loadFamily({ silent = false } = {}) {
    const requestId = (this._familyLoadRequestId || 0) + 1
    this._familyLoadRequestId = requestId
    if (!silent) this.setData({ loading: true })
    try {
      const result = await familyService.getMyFamily(parentIdentity())
      if (requestId !== this._familyLoadRequestId) return false
      if (this.data.familySettling && !confirmsFamilyExit(result, this._settlingFromFamilyId)) {
        if (!silent) this.setData({ loading: false })
        return false
      }
      this.setData(familyViewData(result))
      this._settlingFromFamilyId = ''
      return true
    } catch (error) {
      if (requestId !== this._familyLoadRequestId) return false
      if (typeof console !== 'undefined' && console.error) {
        console.error('family getMyFamily failed', error)
      }
      if (silent) return false
      this.setData({
        loading: false,
        loadError: true,
        roleLabel: '未加载'
      })
      wx.showToast({ title: userMessage(error, '家庭信息加载失败'), icon: 'none' })
      return false
    }
  },

  async prepareInvite() {
    if (this.data.preparingInvite) return
    if (this.data.familySettling) {
      wx.showToast({ title: '家庭信息同步中，请稍候', icon: 'none' })
      return
    }
    if (this.data.loading) {
      wx.showToast({ title: '家庭信息加载中', icon: 'none' })
      return
    }
    if (this.data.membership.role && !this.data.canInvite) {
      wx.showToast({ title: '当前身份不能邀请成员', icon: 'none' })
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

  async leaveFamily() {
    if (this.data.leaving || !this.data.canLeaveFamily) return
    const originalFamilyId = familyIdOf(this.data)
    this.setData({ leaving: true })

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '退出家庭组',
        content: '退出后不能继续查看和管理该家庭食材，家庭中的历史记录仍会保留',
        confirmText: '确认退出',
        confirmColor: '#a65d57',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      })
    })

    if (!confirmed) {
      this.setData({ leaving: false })
      return
    }

    this._familyLoadRequestId = (this._familyLoadRequestId || 0) + 1
    let confirmedFamily = null
    try {
      try {
        await familyService.leaveFamily()
      } catch (error) {
        if (!isUncertainRequestError(error)) throw error
        let result
        try {
          result = await familyService.getMyFamily(parentIdentity())
        } catch (reconcileError) {
          this._settlingFromFamilyId = originalFamilyId
          this.setData({
            familySettling: true,
            familyConfirmationPending: true,
            canInvite: false,
            canViewMembers: false,
            canManageMembers: false,
            canLeaveFamily: false,
            roleLabel: '待确认'
          })
          wx.showToast({ title: '退出结果待确认，请重新确认', icon: 'none' })
          return
        }
        if (!confirmsFamilyExit(result, originalFamilyId)) throw error
        confirmedFamily = result
      }
      inviteContext.clear()
      this._settlingFromFamilyId = originalFamilyId
      this.setData({
        loading: false,
        loadError: false,
        family: { kind: 'personal', name: '我的家庭' },
        members: [],
        membership: { role: 'owner' },
        invite: null,
        inviteCode: '',
        invitePreview: null,
        incomingInviteId: '',
        needsLogin: false,
        showInviteCode: false,
        canInvite: false,
        canViewMembers: false,
        canManageMembers: false,
        canLeaveFamily: false,
        roleLabel: '同步中',
        familySettling: true,
        familyConfirmationPending: false
      })
      let settled = false
      if (confirmedFamily) {
        this._familyLoadRequestId = (this._familyLoadRequestId || 0) + 1
        this.setData(familyViewData(confirmedFamily))
        this._settlingFromFamilyId = ''
        settled = true
      } else {
        settled = await this.loadFamily({ silent: true })
      }
      wx.showToast(settled
        ? { title: '已退出家庭', icon: 'success' }
        : { title: '已退出家庭，新的家庭信息待同步', icon: 'none' })
    } catch (error) {
      wx.showToast({
        title: userMessage(error, '退出失败，请重试'),
        icon: 'none'
      })
    } finally {
      this.setData({ leaving: false })
    }
  },

  async retryFamilySync() {
    if (!this.data.familySettling || this.data.retryingFamilySync) return
    this.setData({ retryingFamilySync: true })
    try {
      if (this.data.familyConfirmationPending) {
        const originalFamilyId = this._settlingFromFamilyId
        const requestId = (this._familyLoadRequestId || 0) + 1
        this._familyLoadRequestId = requestId
        let result
        try {
          result = await familyService.getMyFamily(parentIdentity())
        } catch (error) {
          if (requestId !== this._familyLoadRequestId) return
          wx.showToast({ title: '暂时无法确认，请稍后重试', icon: 'none' })
          return
        }
        if (requestId !== this._familyLoadRequestId) return
        const currentFamilyId = familyIdOf(result)
        if (!currentFamilyId) {
          wx.showToast({ title: '暂时无法确认，请稍后重试', icon: 'none' })
          return
        }
        this._familyLoadRequestId += 1
        this.setData(familyViewData(result))
        this._settlingFromFamilyId = ''
        wx.showToast({
          title: currentFamilyId !== originalFamilyId ? '已退出家庭' : '尚未退出，可重新操作',
          icon: currentFamilyId !== originalFamilyId ? 'success' : 'none'
        })
        return
      }
      const synced = await this.loadFamily({ silent: true })
      wx.showToast({
        title: synced ? '家庭信息已同步' : '暂时未同步成功，请稍后重试',
        icon: synced ? 'success' : 'none'
      })
    } finally {
      this.setData({ retryingFamilySync: false })
    }
  },

  goMemberManage() {
    if (this.data.familySettling) {
      wx.showToast({ title: '家庭信息同步中，请稍候', icon: 'none' })
      return
    }
    if (this.data.loading || !this.data.canViewMembers) {
      wx.showToast({ title: '当前身份不能查看成员', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/family/member' })
  }
})

module.exports = {
  roleText,
  userMessage
}
