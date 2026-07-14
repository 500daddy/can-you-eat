const cloud = require('wx-server-sdk')
const { createFamilyApi } = require('./core')
const { createCloudStore, ensureCollections } = require('./cloudStore')

const familyCollections = [
  'families',
  'family_members',
  'family_invites',
  'family_audit_logs',
  'family_settings',
  'user_food_records'
]

function initializationErrorCode(error) {
  const message = String((error && error.message) || error || '')
  if (/collection not exists|collection.*not.*exist|集合.*不存在/i.test(message)) return 'COLLECTION_MISSING'
  if (/permission denied|没有权限|权限不足/i.test(message)) return 'PERMISSION_DENIED'
  return 'UNKNOWN_ERROR'
}

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  try {
    const ensureResult = await ensureCollections(db, familyCollections)
    if (ensureResult.supported === false) {
      console.warn('familyApi collection auto-create is unavailable, please create collections manually', ensureResult.skipped)
    }
  } catch (error) {
    console.error('familyApi ensure collections failed', error)
    return {
      ok: false,
      code: initializationErrorCode(error),
      error: `家庭共享初始化失败：${error && error.message ? error.message : String(error)}`
    }
  }
  const api = createFamilyApi({
    store: createCloudStore(db),
    userId: wxContext.OPENID,
    today: event.today
  })
  return api.handle(event)
}
