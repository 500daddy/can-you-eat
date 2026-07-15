const PENDING_FAMILY_INVITE_KEY = 'baby_food_pending_family_invite_v1'

function createWxStorage() {
  return {
    get(key) {
      return typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(key) : ''
    },
    set(key, value) {
      if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value)
    },
    remove(key) {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key)
    }
  }
}

function createInviteContext(storage = createWxStorage()) {
  return {
    save(value) {
      const inviteId = String(value || '').trim()
      if (!inviteId) return ''
      storage.set(PENDING_FAMILY_INVITE_KEY, inviteId)
      return inviteId
    },

    peek() {
      return String(storage.get(PENDING_FAMILY_INVITE_KEY) || '').trim()
    },

    consume() {
      const inviteId = this.peek()
      storage.remove(PENDING_FAMILY_INVITE_KEY)
      return inviteId
    },

    clear() {
      storage.remove(PENDING_FAMILY_INVITE_KEY)
    }
  }
}

let singleton

function getInviteContext() {
  if (!singleton) singleton = createInviteContext()
  return singleton
}

module.exports = {
  PENDING_FAMILY_INVITE_KEY,
  createInviteContext,
  getInviteContext
}
