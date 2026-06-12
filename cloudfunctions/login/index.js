const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async () => {
  const wxContext = cloud.getWXContext()

  return {
    userId: wxContext.OPENID,
    openid: wxContext.OPENID,
    settings: {
      babyName: '小芽贝',
      babyBirthday: '2025-10-01',
      babyMode: true,
      reminderEnabled: true,
      remindBeforeDays: 1,
      dailySummaryEnabled: true,
      dailySummaryTime: '08:00'
    }
  }
}
