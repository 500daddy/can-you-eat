const TEMPLATE_ID_FOOD_EXPIRE = '请替换为实际订阅消息模板ID'

function defaultRequestSubscribeMessage(input) {
  if (typeof wx === 'undefined' || !wx.requestSubscribeMessage) {
    return Promise.reject(new Error('wx.requestSubscribeMessage is unavailable'))
  }
  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      ...input,
      success: resolve,
      fail: reject
    })
  })
}

function createSubscribeService(options = {}) {
  const templateId = options.templateId || TEMPLATE_ID_FOOD_EXPIRE
  const requestSubscribeMessage = options.requestSubscribeMessage || defaultRequestSubscribeMessage

  return {
    async requestFoodExpireSubscribe() {
      if (!templateId || templateId === TEMPLATE_ID_FOOD_EXPIRE) {
        return {
          templateId,
          accepted: false,
          status: 'not_configured'
        }
      }

      try {
        const result = await requestSubscribeMessage({ tmplIds: [templateId] })
        const status = result[templateId]
        return {
          templateId,
          accepted: status === 'accept',
          status
        }
      } catch (error) {
        return {
          templateId,
          accepted: false,
          status: 'failed',
          error: error.message
        }
      }
    }
  }
}

let singleton

function getSubscribeService() {
  if (!singleton) {
    singleton = createSubscribeService()
  }
  return singleton
}

module.exports = {
  createSubscribeService,
  getSubscribeService,
  TEMPLATE_ID_FOOD_EXPIRE
}
