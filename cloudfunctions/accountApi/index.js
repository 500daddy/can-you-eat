const cloud = require('wx-server-sdk')
const { createAccountApi } = require('./core')
const { createCloudStore, ensureCollections } = require('./cloudStore')

const accountCollections = [
  'user_profiles',
  'family_members'
]

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  try {
    const ensureResult = await ensureCollections(db, accountCollections)
    if (ensureResult.supported === false) {
      console.warn('accountApi collection auto-create is unavailable, please create collections manually', ensureResult.skipped)
    }
  } catch (error) {
    console.error('accountApi ensure collections failed', error)
    return {
      ok: false,
      error: `账号服务初始化失败：${error && error.message ? error.message : String(error)}`
    }
  }
  const api = createAccountApi({
    store: createCloudStore(db),
    userId: wxContext.OPENID,
    today: new Date().toISOString()
  })
  return api.handle(event)
}
