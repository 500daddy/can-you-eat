const { getFamilyService } = require('../../utils/familyService')

const familyService = getFamilyService()
const roleTextMap = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}

function roleText(role) {
  return roleTextMap[role] || '成员'
}

Page({
  data: {
    loading: true,
    family: {},
    members: [],
    membership: {},
    invite: null,
    inviteCode: '',
    canInvite: false,
    canManageMembers: false
  },

  async onShow() {
    await this.loadFamily()
  },

  async loadFamily() {
    this.setData({ loading: true })
    try {
      const result = await familyService.getMyFamily()
      const membership = result.membership || {}
      const members = (result.members || []).map((item) => ({
        ...item,
        avatarText: item.nickname ? String(item.nickname).slice(0, 1) : '家',
        roleText: roleText(item.role),
        isOwner: item.role === 'owner'
      }))
      this.setData({
        loading: false,
        family: result.family || {},
        members,
        membership,
        canInvite: ['owner', 'admin'].includes(membership.role),
        canManageMembers: membership.role === 'owner'
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: '家庭信息加载失败', icon: 'none' })
    }
  },

  async createInvite() {
    if (!this.data.canInvite) {
      wx.showToast({ title: '当前身份不能邀请家人', icon: 'none' })
      return
    }
    try {
      const invite = await familyService.createInvite()
      this.setData({ invite })
      this.copyInvite()
    } catch (error) {
      wx.showToast({ title: '邀请创建失败', icon: 'none' })
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

  async joinByInvite() {
    if (!this.data.inviteCode) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      await familyService.joinFamilyByInvite({ inviteId: this.data.inviteCode })
      wx.showToast({ title: '已加入家庭', icon: 'success' })
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
