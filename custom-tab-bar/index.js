Component({
  data: {
    selected: 0,
    color: '#8a806d',
    selectedColor: '#2f6c37',
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/assets/sprites/nav/nav_home_inactive.png',
        selectedIconPath: '/assets/sprites/nav/nav_home_active.png'
      },
      {
        pagePath: '/pages/food/search',
        text: '食材',
        iconPath: '/assets/sprites/nav/nav_food_inactive.png',
        selectedIconPath: '/assets/sprites/nav/nav_food_active.png'
      },
      {
        pagePath: '/pages/reminder/index',
        text: '提醒',
        iconPath: '/assets/sprites/nav/nav_reminder_inactive.png',
        selectedIconPath: '/assets/sprites/nav/nav_reminder_active.png'
      },
      {
        pagePath: '/pages/mine/index',
        text: '我的',
        iconPath: '/assets/sprites/nav/nav_mine_inactive.png',
        selectedIconPath: '/assets/sprites/nav/nav_mine_active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset
      this.setData({ selected: index })
      wx.switchTab({ url: path })
    }
  }
})
