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

Page({
  ...createShareHandlers(),

  data: {
    loading: true,
    members: [],
    membership: {},
    canManageMembers: false,
    removingOpenId: ''
  },

  async onShow() {
    await this.loadMembers()
  },

  async loadMembers({ silent = false } = {}) {
    this.setData({ loading: true })
    try {
      const result = await familyService.getMyFamily()
      const membership = result.membership || {}
      this.setData({
        loading: false,
        members: decorateMembers(result.members || []),
        membership,
        canManageMembers: membership.role === 'owner'
      })
      return true
    } catch (error) {
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

  updateRole(e) {
    if (!this.data.canManageMembers) {
      wx.showToast({ title: '只有创建者可调整成员身份', icon: 'none' })
      return
    }
    const { openid, role } = e.currentTarget.dataset
    const target = this.data.members.find((item) => item.openId === openid)
    if (!target || target.role === role || target.isOwner) return
    wx.showModal({
      title: '调整成员身份',
      content: `确认把 ${target.nickname || '这位家人'} 设为${roleTextMap[role]}吗？`,
      confirmText: '确认',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await familyService.updateMemberRole({ openId: openid, role })
          await this.loadMembers()
          wx.showToast({ title: '已更新', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '更新失败', icon: 'none' })
        }
      }
    })
  },

  async removeMember(e) {
    if (this.data.removingOpenId) return
    if (!this.data.canManageMembers) {
      wx.showToast({ title: '只有创建者可移出家庭成员', icon: 'none' })
      return
    }
    const { openid } = e.currentTarget.dataset
    const target = this.data.members.find((item) => item.openId === openid)
    if (!target || target.isOwner) return
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
      await familyService.removeMember({ openId: openid })
      this.setData({
        members: this.data.members.filter((item) => item.openId !== openid)
      })
      await this.loadMembers({ silent: true })
      wx.showToast({ title: '已移出家庭', icon: 'success' })
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
  }
})
