const https = require('node:https')

const DEFAULT_MODEL = 'gpt-4.1-mini'
const DEFAULT_MAX_RESULTS = 8

const fallbackResults = [
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

function clampConfidence(value) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return 0
  return Math.max(0, Math.min(1, confidence))
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function createFoodLookup(foodBase = []) {
  const lookup = new Map()
  foodBase.forEach((food) => {
    const names = [food.id, food.name, ...(food.aliases || [])]
    names.forEach((name) => {
      const key = normalizeText(name)
      if (key && !lookup.has(key)) lookup.set(key, food)
    })
  })
  return lookup
}

function matchFood(item, lookup) {
  return lookup.get(normalizeText(item.foodBaseId)) ||
    lookup.get(normalizeText(item.foodId)) ||
    lookup.get(normalizeText(item.foodName)) ||
    lookup.get(normalizeText(item.name))
}

function normalizeVisionResults(payload, foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  const lookup = createFoodLookup(foodBase)
  const items = Array.isArray(payload) ? payload : (payload && payload.foods) || []
  const seen = new Set()

  return items
    .map((item) => {
      const food = matchFood(item, lookup)
      if (!food) return null
      const foodBaseId = food.id
      if (seen.has(foodBaseId)) return null
      seen.add(foodBaseId)
      return {
        foodName: food.name,
        foodBaseId,
        confidence: clampConfidence(item.confidence),
        reason: String(item.reason || '').slice(0, 60)
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults)
}

function buildFoodBaseContext(foodBase = []) {
  return foodBase
    .map((food) => {
      const aliases = (food.aliases || []).join('、')
      return `${food.id}: ${food.name}${aliases ? `（别名：${aliases}）` : ''}`
    })
    .join('\n')
}

function buildRecognitionPrompt(foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  return [
    '你是一个谨慎的家庭食材图片识别助手。',
    `请识别图片中可见的食材，最多返回 ${maxResults} 个。`,
    '必须优先匹配下面食材库中的 id、名称或别名；如果不能匹配食材库，请不要返回该项。',
    '只判断图片里可能是什么食材，不判断宝宝是否能吃，也不提供医疗或营养建议。',
    '置信度 confidence 使用 0 到 1 的数字；遮挡、只露出局部、相似食材时请降低置信度。',
    '',
    '食材库：',
    buildFoodBaseContext(foodBase)
  ].join('\n')
}

function buildResponsesBody(imageUrl, foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  return {
    model: options.model || DEFAULT_MODEL,
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: buildRecognitionPrompt(foodBase, { maxResults })
        },
        {
          type: 'input_image',
          image_url: imageUrl
        }
      ]
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'food_recognition',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            foods: {
              type: 'array',
              maxItems: maxResults,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  foodBaseId: { type: 'string' },
                  foodName: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' }
                },
                required: ['foodBaseId', 'foodName', 'confidence', 'reason']
              }
            }
          },
          required: ['foods']
        }
      }
    }
  }
}

function extractOutputText(response) {
  if (!response) return ''
  if (typeof response.output_text === 'string') return response.output_text
  if (Array.isArray(response.output)) {
    for (const output of response.output) {
      for (const content of output.content || []) {
        if (content.type === 'output_text' && content.text) return content.text
      }
    }
  }
  const choiceText = response.choices &&
    response.choices[0] &&
    response.choices[0].message &&
    response.choices[0].message.content
  return typeof choiceText === 'string' ? choiceText : ''
}

function parseVisionResponse(response) {
  const text = extractOutputText(response)
  if (!text) return { foods: [] }
  try {
    return JSON.parse(text)
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : { foods: [] }
  }
}

function requestJson({ apiKey, baseUrl, body }) {
  const url = new URL('/v1/responses', baseUrl || 'https://api.openai.com')
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let payload = {}
        try {
          payload = raw ? JSON.parse(raw) : {}
        } catch (error) {
          reject(new Error(`vision response is not JSON: ${raw.slice(0, 120)}`))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(payload.error && payload.error.message ? payload.error.message : `vision request failed: ${res.statusCode}`))
          return
        }
        resolve(payload)
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

function createFoodRecognizer(options = {}) {
  const apiKey = options.apiKey || ''
  const foodBase = options.foodBase || []
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  const fallback = options.fallbackResults || fallbackResults
  const callVision = options.requestJson || requestJson

  return async function recognizeFood(event = {}) {
    const imageUrl = event.imageUrl || event.tempFileURL || event.imageData
    if (!apiKey || !imageUrl) return fallback

    try {
      const body = buildResponsesBody(imageUrl, foodBase, {
        maxResults,
        model: options.model
      })
      const response = await callVision({
        apiKey,
        baseUrl: options.baseUrl,
        body
      })
      const normalized = normalizeVisionResults(parseVisionResponse(response), foodBase, { maxResults })
      return normalized.length ? normalized : fallback
    } catch (error) {
      if (options.warnOnFallback !== false && typeof console !== 'undefined' && console.warn) {
        console.warn('vision recognition failed, fallback to mock results', error)
      }
      return fallback
    }
  }
}

async function resolveImageUrl(event = {}, cloudApi) {
  const imageUrl = event.imageUrl || event.tempFileURL || ''
  if (!imageUrl || !imageUrl.startsWith('cloud://') || !cloudApi || !cloudApi.getTempFileURL) {
    return imageUrl
  }
  const result = await cloudApi.getTempFileURL({
    fileList: [imageUrl]
  })
  const file = result && result.fileList && result.fileList[0]
  return (file && file.tempFileURL) || imageUrl
}

module.exports = {
  buildRecognitionPrompt,
  buildResponsesBody,
  createFoodRecognizer,
  fallbackResults,
  normalizeVisionResults,
  parseVisionResponse,
  requestJson,
  resolveImageUrl
}
