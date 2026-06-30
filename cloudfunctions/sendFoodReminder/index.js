const cloud = require('wx-server-sdk')
const { createFoodApi } = require('../foodApi/core')
const { createCloudStore } = require('../foodApi/cloudStore')
const { createSendFoodReminder, selectReminderCandidate } = require('./core')

function loadLocalConfig() {
  try {
    return require('./subscribeConfig.local')
  } catch (error) {
    return {}
  }
}

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event = {}) => {
  const localConfig = loadLocalConfig()
  const sendFoodReminder = createSendFoodReminder({
    templateId: localConfig.TEMPLATE_ID_FOOD_EXPIRE,
    getOpenId: () => cloud.getWXContext().OPENID,
    getReminderCandidate: async ({ touser }) => {
      const api = createFoodApi({
        store: createCloudStore(cloud.database()),
        userId: touser,
        today: event.today
      })
      const reminders = await api.handle({ action: 'getReminders' })
      return selectReminderCandidate(reminders.data, event.today)
    },
    sendSubscribeMessage: (payload) => cloud.openapi.subscribeMessage.send(payload)
  })

  return sendFoodReminder(event)
}
