App({
  globalData: {
    babyName: '小芽贝',
    babyAgeText: '8个月12天',
    babyMode: true,
    cloudEnvId: 'cloud1-please-replace',
    useCloudFoodApi: false
  },

  onLaunch() {
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
