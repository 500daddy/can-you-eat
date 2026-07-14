const ACCOUNT_SESSION_KEY = 'baby_food_account_session_v1'

function loadCloudConfig() {
  try {
    return require('./utils/cloudConfig.local')
  } catch (error) {
    return require('./utils/cloudConfig.example')
  }
}

const cloudConfig = loadCloudConfig()

App({
  globalData: {
    babyName: '',
    babyAgeText: '',
    babyMode: false,
    cloudEnvId: cloudConfig.cloudEnvId || 'cloud1-please-replace',
    cloudFoodApiConfigured: cloudConfig.useCloudFoodApi === true,
    useCloudFoodApi: false,
    accountLoggedIn: false,
    loggedOut: true
  },

  onLaunch() {
    const session = wx.getStorageSync ? wx.getStorageSync(ACCOUNT_SESSION_KEY) : null
    const accountLoggedIn = Boolean(session && session.loggedIn)
    this.globalData.accountLoggedIn = accountLoggedIn
    this.globalData.loggedOut = !accountLoggedIn
    this.globalData.cloudFoodApiConfigured = cloudConfig.useCloudFoodApi === true
    this.globalData.useCloudFoodApi = this.globalData.cloudFoodApiConfigured && accountLoggedIn
    const env = this.globalData.cloudEnvId
    if (wx.cloud && env && env !== 'cloud1-please-replace') {
      try {
        wx.cloud.init({
          env,
          traceUser: true
        })
      } catch (error) {
        console.warn('云开发环境待配置', error)
      }
    }
  }
})
