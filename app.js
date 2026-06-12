App({
  globalData: {
    babyName: '小芽贝',
    babyAgeText: '8个月12天',
    babyMode: true
  },

  onLaunch() {
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: 'cloud1-please-replace',
          traceUser: true
        })
      } catch (error) {
        console.warn('云开发环境待配置', error)
      }
    }
  }
})
