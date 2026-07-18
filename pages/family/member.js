const { getFamilyService } = require('../../utils/familyService')
const { createShareHandlers } = require('../../utils/share')

const familyService = getFamilyService()
const roleTextMap = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}
const rolePermissionHelp = [
  '创建者：管理成员、修改宝宝资料、邀请家人、管理食材和采购计划。',
  '管理员：邀请家人、管理食材和采购计划，不能调整成员或宝宝资料。',
  '成员：管理食材和采购计划，不能邀请或管理成员。'
].join('\n')

function decorateMembers(members = []) {
  return members.map((item) => ({
    ...item,
    roleText: roleTextMap[item.role] || '成员',
    isOwner: item.role === 'owner'
  }))
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

  _loadRequestId: 0,

  data: {
    loading: true,
    family: {},
    members: [],
    membership: {},
    canManageMembers: false,
    pendingRemovalOpenId: '',
    removingOpenId: '',
    updatingOpenId: ''
  },

  async onShow() {
    await this.loadMembers()
  },

  async loadMembers({ silent = false } = {}) {
    const requestId = ++this._loadRequestId
    if (!silent) this.setData({ loading: true })
    try {
      const result = await familyService.getMyFamily()
      if (requestId !== this._loadRequestId) return false
      const membership = result.membership || {}
      this.setData({
        loading: false,
        family: result.family || {},
        members: decorateMembers(result.members || []),
        membership,
        canManageMembers: membership.role === 'owner'
      })
      return true
    } catch (error) {
      if (requestId !== this._loadRequestId) return false
      this.setData({ loading: false })
      if (!silent) {
        wx.showToast({ title: '成员加载失败', icon: 'none' })
      }
      return false
    }
  },

  showRolePermissions() {
    wx.showModal({
      title: '身份权限说明',
      content: rolePermissionHelp,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  async updateRole(e) {
    if (this.data.removingOpenId || this.data.updatingOpenId || this.data.pendingRemovalOpenId) return
    if (!this.data.canManageMembers) {
      wx.showToast({ title: '只有创建者可调整成员身份', icon: 'none' })
      return
    }
    const { openid, role } = e.currentTarget.dataset
    const target = this.data.members.find((item) => item.openId === openid)
    if (!target || target.role === role || target.isOwner) return
    this.setData({ updatingOpenId: openid })
    try {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '调整成员身份',
          content: `确认把 ${target.nickname || '这位家人'} 设为${roleTextMap[role]}吗？`,
          confirmText: '确认',
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false)
        })
      })
      if (!confirmed) return
      await familyService.updateMemberRole({ openId: openid, role })
      this.setData({
        members: this.data.members.map((item) => item.openId === openid
          ? { ...item, role, roleText: roleTextMap[role] || '成员' }
          : item),
        updatingOpenId: ''
      })
      wx.showToast({ title: '已更新', icon: 'success' })
      this.loadMembers({ silent: true }).catch(() => {})
    } catch (error) {
      wx.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      if (this.data.updatingOpenId === openid) {
        this.setData({ updatingOpenId: '' })
      }
    }
  },

  async removeMember(e) {
    if (this.data.removingOpenId || this.data.updatingOpenId) return
    const { openid } = e.currentTarget.dataset
    if (this.data.pendingRemovalOpenId && this.data.pendingRemovalOpenId !== openid) return
    if (!this.data.canManageMembers) {
      wx.showToast({ title: '只有创建者可移出家庭成员', icon: 'none' })
      return
    }
    const target = this.data.members.find((item) => item.openId === openid)
    if (!target || target.isOwner) return
    if (this.data.pendingRemovalOpenId === openid) {
      await this.confirmPendingRemoval(openid)
      return
    }
    const originalFamilyId = this.data.family.familyId || this.data.membership.familyId || ''
    this.setData({ removingOpenId: openid })
    try {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '移出家庭',
          content: '移出后将无法继续查看和管理这个家庭的食材，历史记录仍会保留',
          confirmText: '确认移出',
          confirmColor: '#a64038',
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false)
        })
      })
      if (!confirmed) return
      this._loadRequestId += 1
      try {
        await familyService.removeMember({ openId: openid })
      } catch (error) {
        if (!isUncertainRequestError(error)) throw error
        let reconciled = false
        try {
          const result = await familyService.getMyFamily()
          const currentFamilyId = (result.family && result.family.familyId) ||
            (result.membership && result.membership.familyId) || ''
          const targetStillActive = (result.members || []).some((item) => (
            item.openId === openid && item.status !== 'inactive'
          ))
          reconciled = Boolean(originalFamilyId && currentFamilyId === originalFamilyId && !targetStillActive)
        } catch (reconcileError) {
          this.setData({ pendingRemovalOpenId: openid })
          wx.showToast({ title: '状态待确认，请再次点击确认', icon: 'none' })
          return
        }
        if (!reconciled) throw error
      }
      this.setData({
        members: this.data.members.filter((item) => item.openId !== openid),
        removingOpenId: ''
      })
      wx.showToast({ title: '已移出家庭', icon: 'success' })
      this.loadMembers({ silent: true }).catch(() => {})
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || '移出失败，请重试',
        icon: 'none'
      })
    } finally {
      if (this.data.removingOpenId === openid) {
        this.setData({ removingOpenId: '' })
      }
    }
  },

  async confirmPendingRemoval(openid) {
    if (this.data.removingOpenId || this.data.updatingOpenId) return
    if (this.data.pendingRemovalOpenId !== openid) return
    const originalFamilyId = this.data.family.familyId || this.data.membership.familyId || ''
    this.setData({ removingOpenId: openid })
    const requestId = ++this._loadRequestId
    try {
      const result = await familyService.getMyFamily()
      if (requestId !== this._loadRequestId) return
      const currentFamilyId = (result.family && result.family.familyId) ||
        (result.membership && result.membership.familyId) || ''
      if (!originalFamilyId || currentFamilyId !== originalFamilyId) {
        wx.showToast({ title: '暂时无法确认，请稍后重试', icon: 'none' })
        return
      }
      const targetStillActive = (result.members || []).some((item) => (
        item.openId === openid && item.status !== 'inactive'
      ))
      if (targetStillActive) {
        this.setData({
          members: decorateMembers(result.members || []),
          pendingRemovalOpenId: ''
        })
        wx.showToast({ title: '成员仍在家庭，可重新移出', icon: 'none' })
        return
      }
      this._loadRequestId += 1
      this.setData({
        members: this.data.members.filter((item) => item.openId !== openid),
        pendingRemovalOpenId: ''
      })
      wx.showToast({ title: '已移出家庭', icon: 'success' })
      this.loadMembers({ silent: true }).catch(() => {})
    } catch (error) {
      wx.showToast({ title: '状态待确认，请再次点击确认', icon: 'none' })
    } finally {
      if (this.data.removingOpenId === openid) {
        this.setData({ removingOpenId: '' })
      }
    }
  }
})
