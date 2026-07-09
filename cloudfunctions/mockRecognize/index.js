const cloud = require('wx-server-sdk')
const { seedFoodBase } = require('./seedFoodBase')
const {
  createFoodRecognizer,
  resolveImageUrl
} = require('./core')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

function readRequestTimeoutMs() {
  const value = process.env.QWEN_REQUEST_TIMEOUT_MS || process.env.DASHSCOPE_REQUEST_TIMEOUT_MS
  const timeoutMs = Number(value)
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined
}

function readImageMaxBytes() {
  const maxBytes = Number(process.env.RECOGNITION_IMAGE_MAX_BYTES)
  return Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : undefined
}

exports.main = async (event = {}) => {
  const imageUrl = await resolveImageUrl(event, cloud, {
    asDataUrl: true,
    maxBytes: readImageMaxBytes()
  })
  const qwenApiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY
  const model = qwenApiKey
    ? (process.env.QWEN_VISION_MODEL || process.env.DASHSCOPE_VISION_MODEL)
    : process.env.OPENAI_VISION_MODEL
  const baseUrl = qwenApiKey
    ? (process.env.QWEN_BASE_URL || process.env.DASHSCOPE_BASE_URL)
    : process.env.OPENAI_BASE_URL
  const requestTimeoutMs = readRequestTimeoutMs()
  console.info('mockRecognize config summary', {
    provider: qwenApiKey ? 'qwen' : (process.env.OPENAI_API_KEY ? 'openai' : 'mock'),
    hasDashScopeKey: Boolean(process.env.DASHSCOPE_API_KEY),
    hasQwenKey: Boolean(process.env.QWEN_API_KEY),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasImageUrl: Boolean(imageUrl),
    imageInputType: String(imageUrl || '').startsWith('data:') ? 'data_url' : 'url',
    model: model || 'default',
    baseUrl: baseUrl || 'default',
    requestTimeoutMs: requestTimeoutMs || 'default'
  })
  const recognizeFood = createFoodRecognizer({
    qwenApiKey,
    openaiApiKey: process.env.OPENAI_API_KEY,
    baseUrl,
    model,
    requestTimeoutMs,
    includeUnmatchedCandidates: true,
    foodBase: seedFoodBase
  })

  return recognizeFood({
    ...event,
    imageUrl
  })
}
