const LOGGED_OUT_KEY = 'baby_food_logged_out_v1'

App({
  globalData: {
    babyName: '小芽贝',
    babyAgeText: '8个月',
    babyMode: true,
    cloudEnvId: 'cloud1-d2g659tkmf84d1d07',
    useCloudFoodApi: true,
    loggedOut: false
  },

  onLaunch() {
    const loggedOut = Boolean(wx.getStorageSync && wx.getStorageSync(LOGGED_OUT_KEY))
    this.globalData.loggedOut = loggedOut
    if (loggedOut) this.globalData.useCloudFoodApi = false
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
