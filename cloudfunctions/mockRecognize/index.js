const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async () => {
  return [
    {
      foodName: '胡萝卜',
      foodBaseId: 'carrot',
      confidence: 0.92
    },
    {
      foodName: '南瓜',
      foodBaseId: 'pumpkin',
      confidence: 0.64
    },
    {
      foodName: '红薯',
      foodBaseId: 'sweetPotato',
      confidence: 0.51
    }
  ]
}
