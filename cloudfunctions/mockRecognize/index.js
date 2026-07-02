const cloud = require('wx-server-sdk')
const { seedFoodBase } = require('./seedFoodBase')
const {
  createFoodRecognizer,
  resolveImageUrl
} = require('./core')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event = {}) => {
  const imageUrl = await resolveImageUrl(event, cloud)
  const recognizeFood = createFoodRecognizer({
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_VISION_MODEL,
    foodBase: seedFoodBase
  })

  return recognizeFood({
    ...event,
    imageUrl
  })
}
