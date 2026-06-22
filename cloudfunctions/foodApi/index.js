const cloud = require('wx-server-sdk')
const { createFoodApi } = require('./core')
const { createCloudStore } = require('./cloudStore')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const api = createFoodApi({
    store: createCloudStore(cloud.database()),
    userId: wxContext.OPENID,
    today: event.today
  })
  return api.handle(event)
}
