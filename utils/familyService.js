const { unwrapCloudResult } = require('./foodService')

function defaultCallCloud(data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud is unavailable'))
  }
  return wx.cloud.callFunction({
    name: 'familyApi',
    data
  }).then(unwrapCloudResult)
}

function createFamilyService(options = {}) {
  const callCloud = options.callCloud || defaultCallCloud

  function request(action, data = {}) {
    return callCloud({ action, ...data })
  }

  return {
    getMyFamily(input = {}) {
      return request('getMyFamily', input)
    },

    createInvite(input = {}) {
      return request('createInvite', input)
    },

    joinFamilyByInvite(input) {
      return request('joinFamilyByInvite', input)
    },

    updateMemberRole(input) {
      return request('updateMemberRole', input)
    },

    removeMember(input) {
      return request('removeMember', input)
    },

    leaveFamily(input = {}) {
      return request('leaveFamily', input)
    },

    getFamilyAuditLogs(input = {}) {
      return request('getFamilyAuditLogs', input)
    }
  }
}

let singleton

function getFamilyService() {
  if (!singleton) {
    singleton = createFamilyService()
  }
  return singleton
}

function resetFamilyService() {
  singleton = null
}

module.exports = {
  createFamilyService,
  getFamilyService,
  resetFamilyService
}
