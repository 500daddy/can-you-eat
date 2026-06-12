const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async () => {
  return [
    {
      foodName: '胡萝卜',
      confidence: 0.92
    },
    {
      foodName: '南瓜',
      confidence: 0.64
    },
    {
      foodName: '红薯',
      confidence: 0.51
    }
  ]
}
