const { getStatus } = require('../../utils/status')

Component({
  properties: {
    status: {
      type: String,
      value: 'baby_ok'
    },
    label: {
      type: String,
      value: ''
    }
  },

  data: {
    text: '建议给宝宝吃'
  },

  lifetimes: {
    attached() {
      this.updateText()
    }
  },

  observers: {
    'status, label': function () {
      this.updateText()
    }
  },

  methods: {
    updateText() {
      this.setData({
        text: this.properties.label || getStatus(this.properties.status).text
      })
    }
  }
})
