const http = require('node:http')
const https = require('node:https')

const DEFAULT_PROVIDER = 'qwen'
const DEFAULT_QWEN_MODEL = 'qwen-vl-plus'
const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com'
const DEFAULT_MAX_RESULTS = 8
const DEFAULT_REQUEST_TIMEOUT_MS = 25000

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

const visionAliasesByFoodId = {
  greenPepper: ['黄椒', '红椒', '灯笼椒', '柿子椒', '黄色甜椒', '红色甜椒', '橙色甜椒', '黄色彩椒', '红色彩椒', 'bell pepper'],
  tomato: ['小番茄', '圣女果', '小西红柿', '樱桃番茄', '车厘茄'],
  cabbage: ['小青菜', '青江菜'],
  potato: ['洋芋'],
  sweetPotato: ['番薯'],
  pumpkin: ['金瓜'],
  corn: ['玉蜀黍']
}

function clampConfidence(value) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return 0
  return Math.max(0, Math.min(1, confidence))
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s,，、。.\-_/（）()【】\[\]{}]/g, '')
}

function collectVisionItems(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const keys = ['foods', 'items', 'ingredients', 'results', 'objects', 'candidates']
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  return []
}

function candidateName(item) {
  if (!item || typeof item !== 'object') return ''
  const fields = ['foodBaseId', 'foodId', 'foodName', 'name', 'label', 'ingredient', 'food', 'item', 'object']
  for (const field of fields) {
    const value = String(item[field] || '').trim()
    if (value) return value
  }
  return ''
}

function candidateConfidence(item) {
  if (!item || typeof item !== 'object') return 0
  return item.confidence !== undefined
    ? item.confidence
    : (item.score !== undefined ? item.score : item.probability)
}

function createFoodLookup(foodBase = []) {
  const byKey = new Map()
  const entries = []
  function addName(name, food) {
    const key = normalizeText(name)
    if (!key) return
    if (!byKey.has(key)) byKey.set(key, food)
    entries.push({ key, food })
  }
  foodBase.forEach((food) => {
    const names = [food.id, food.name, ...(food.aliases || []), ...(visionAliasesByFoodId[food.id] || [])]
    names.forEach((name) => addName(name, food))
  })
  return { byKey, entries }
}

function matchFood(item, lookup) {
  const directKeys = [
    normalizeText(item && item.foodBaseId),
    normalizeText(item && item.foodId),
    normalizeText(candidateName(item))
  ].filter(Boolean)
  for (const key of directKeys) {
    const exact = lookup.byKey.get(key)
    if (exact) return exact
  }
  for (const key of directKeys) {
    if (key.length < 2) continue
    const fuzzy = lookup.entries.find((entry) => {
      if (entry.key.length < 2) return false
      return key.includes(entry.key) || entry.key.includes(key)
    })
    if (fuzzy) return fuzzy.food
  }
  return null
}

function summarizeVisionCandidates(payload, options = {}) {
  const maxItems = options.maxItems || 8
  return collectVisionItems(payload)
    .map(candidateName)
    .filter(Boolean)
    .slice(0, maxItems)
}

function summarizeUnmatchedVisionCandidates(payload, foodBase = [], options = {}) {
  const maxItems = options.maxItems || DEFAULT_MAX_RESULTS
  const lookup = createFoodLookup(foodBase)
  const seen = new Set()
  return collectVisionItems(payload)
    .map((item) => {
      if (matchFood(item, lookup)) return null
      const foodName = candidateName(item)
      const key = normalizeText(foodName)
      if (!key || seen.has(key)) return null
      seen.add(key)
      return {
        foodName,
        confidence: clampConfidence(candidateConfidence(item)),
        reason: String(item.reason || '').slice(0, 60)
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxItems)
}

function normalizeVisionResults(payload, foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  const lookup = createFoodLookup(foodBase)
  const items = collectVisionItems(payload)
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
        confidence: clampConfidence(candidateConfidence(item)),
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

function buildQwenRecognitionPrompt(options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  return [
    '你是一个谨慎的家庭食材图片识别助手。',
    `请识别图片中清晰可见、可作为家庭食材的物品，最多返回 ${maxResults} 个。`,
    '请使用常见中文食材名，例如番茄、洋葱、西兰花。不要返回餐具、包装、背景物或无法确认的物体。',
    '只判断图片里可能是什么食材，不判断宝宝是否能吃，也不提供医疗或营养建议。',
    '置信度 confidence 使用 0 到 1 的数字；遮挡、只露出局部、相似食材时请降低置信度。'
  ].join('\n')
}

function buildQwenChatBody(imageUrl, foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  return {
    model: options.model || DEFAULT_QWEN_MODEL,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            buildQwenRecognitionPrompt({ maxResults }),
            '',
            '请只返回 JSON，不要输出 Markdown。格式：{"foods":[{"foodName":"番茄","confidence":0.92,"reason":"清晰可见"}]}'
          ].join('\n')
        },
        {
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        }
      ]
    }],
    temperature: 0.1,
    response_format: {
      type: 'json_object'
    }
  }
}

function buildOpenAiResponsesBody(imageUrl, foodBase = [], options = {}) {
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  return {
    model: options.model || DEFAULT_OPENAI_MODEL,
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

function buildVisionBody(imageUrl, foodBase = [], options = {}) {
  const provider = options.provider || DEFAULT_PROVIDER
  if (provider === 'openai') {
    return buildOpenAiResponsesBody(imageUrl, foodBase, options)
  }
  return buildQwenChatBody(imageUrl, foodBase, options)
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
  if (typeof choiceText === 'string') return choiceText
  if (Array.isArray(choiceText)) {
    const textItem = choiceText.find((item) => item && (item.type === 'text' || item.type === 'output_text') && item.text)
    return textItem ? textItem.text : ''
  }
  return ''
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

function buildRequestUrl(baseUrl, path) {
  const trimmedBase = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/v1\/(responses|chat\/completions)$/.test(trimmedBase)) {
    return new URL(trimmedBase)
  }
  return new URL(`${trimmedBase}${path}`)
}

function requestJson({ apiKey, baseUrl, path = '/v1/chat/completions', body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  const url = buildRequestUrl(baseUrl || DEFAULT_QWEN_BASE_URL, path)
  return new Promise((resolve, reject) => {
    let settled = false
    function settle(method, value) {
      if (settled) return
      settled = true
      method(value)
    }
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
          settle(reject, new Error(`vision response is not JSON: ${raw.slice(0, 120)}`))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          settle(reject, new Error(payload.error && payload.error.message ? payload.error.message : `vision request failed: ${res.statusCode}`))
          return
        }
        settle(resolve, payload)
      })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`vision request timed out after ${timeoutMs}ms`))
    })
    req.on('error', (error) => settle(reject, error))
    req.write(JSON.stringify(body))
    req.end()
  })
}

function bufferToDataUrl(buffer, contentType = 'image/jpeg') {
  return `data:${String(contentType || 'image/jpeg').split(';')[0]};base64,${buffer.toString('base64')}`
}

function downloadImage(imageUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 5000
  const maxBytes = options.maxBytes || 2 * 1024 * 1024
  const client = String(imageUrl).startsWith('http://') ? http : https
  return new Promise((resolve, reject) => {
    let settled = false
    function settle(method, value) {
      if (settled) return
      settled = true
      method(value)
    }
    const req = client.get(imageUrl, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        settle(reject, new Error(`image download failed: ${res.statusCode}`))
        return
      }
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          req.destroy(new Error(`image exceeds ${maxBytes} bytes`))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        settle(resolve, {
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'image/jpeg'
        })
      })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`image download timed out after ${timeoutMs}ms`))
    })
    req.on('error', (error) => settle(reject, error))
  })
}

function createFoodRecognizer(options = {}) {
  const qwenApiKey = options.qwenApiKey || options.dashscopeApiKey || ''
  const openaiApiKey = options.openaiApiKey || options.apiKey || ''
  const provider = options.provider || (qwenApiKey ? 'qwen' : (openaiApiKey ? 'openai' : DEFAULT_PROVIDER))
  const apiKey = provider === 'openai' ? openaiApiKey : qwenApiKey
  const foodBase = options.foodBase || []
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  const fallback = options.fallbackResults || fallbackResults
  const callVision = options.requestJson || requestJson
  const model = options.model || (provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_QWEN_MODEL)
  const baseUrl = options.baseUrl || (provider === 'openai' ? DEFAULT_OPENAI_BASE_URL : DEFAULT_QWEN_BASE_URL)
  const path = provider === 'openai' ? '/v1/responses' : '/v1/chat/completions'
  const requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : DEFAULT_REQUEST_TIMEOUT_MS
  const logger = options.logger || console

  function warnFallback(reason, extra = {}) {
    if (options.warnOnFallback === false || !logger || !logger.warn) return
    logger.warn('vision recognition did not produce usable results', {
      reason,
      provider,
      model,
      hasApiKey: Boolean(apiKey),
      ...extra
    })
  }

  return async function recognizeFood(event = {}) {
    const imageUrl = event.imageUrl || event.tempFileURL || event.imageData
    if (!apiKey) {
      warnFallback('missing_api_key', { hasImageUrl: Boolean(imageUrl) })
      return fallback
    }
    if (!imageUrl) {
      warnFallback('missing_image_url', { hasImageUrl: false })
      return fallback
    }

    try {
      if (logger && logger.info) {
        logger.info('vision recognition requesting remote model', {
          provider,
          model,
          baseUrl,
          requestTimeoutMs,
          hasImageUrl: true
        })
      }
      const body = buildVisionBody(imageUrl, foodBase, {
        maxResults,
        model,
        provider
      })
      const response = await callVision({
        apiKey,
        baseUrl,
        path,
        timeoutMs: requestTimeoutMs,
        body
      })
      const parsed = parseVisionResponse(response)
      const normalized = normalizeVisionResults(parsed, foodBase, { maxResults })
      const unmatchedCandidates = summarizeUnmatchedVisionCandidates(parsed, foodBase, { maxItems: maxResults })
      if (!normalized.length) {
        warnFallback('empty_or_unmatched_model_result', {
          hasImageUrl: true,
          candidateNames: summarizeVisionCandidates(parsed)
        })
      }
      if (options.includeUnmatchedCandidates) {
        return {
          results: normalized,
          unmatchedCandidates
        }
      }
      return normalized
    } catch (error) {
      warnFallback('remote_request_failed', {
        hasImageUrl: true,
        errorMessage: error && error.message ? error.message : String(error)
      })
      return []
    }
  }
}

async function resolveImageUrl(event = {}, cloudApi, options = {}) {
  const imageUrl = event.imageUrl || event.tempFileURL || ''
  let resolvedUrl = imageUrl
  if (imageUrl && imageUrl.startsWith('cloud://') && cloudApi && cloudApi.getTempFileURL) {
    const result = await cloudApi.getTempFileURL({
      fileList: [imageUrl]
    })
    const file = result && result.fileList && result.fileList[0]
    resolvedUrl = (file && file.tempFileURL) || imageUrl
  }
  if (!options.asDataUrl || !resolvedUrl || resolvedUrl.startsWith('data:')) {
    return resolvedUrl
  }
  if (!/^https?:\/\//.test(resolvedUrl)) return resolvedUrl
  const image = await (options.downloadImage || downloadImage)(resolvedUrl, options)
  return bufferToDataUrl(image.buffer, image.contentType)
}

module.exports = {
  bufferToDataUrl,
  buildOpenAiResponsesBody,
  buildQwenChatBody,
  buildQwenRecognitionPrompt,
  buildRecognitionPrompt,
  buildRequestUrl,
  buildVisionBody,
  createFoodRecognizer,
  DEFAULT_QWEN_MODEL,
  downloadImage,
  fallbackResults,
  normalizeVisionResults,
  parseVisionResponse,
  requestJson,
  resolveImageUrl,
  summarizeUnmatchedVisionCandidates,
  summarizeVisionCandidates
}
