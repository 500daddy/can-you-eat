const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildQwenChatBody,
  createFoodRecognizer,
  normalizeVisionResults,
  resolveImageUrl,
  summarizeUnmatchedVisionCandidates
} = require('../cloudfunctions/mockRecognize/core')

const foodBase = [
  { id: 'carrot', name: '胡萝卜', aliases: ['红萝卜'] },
  { id: 'tomato', name: '番茄', aliases: ['西红柿'] },
  { id: 'onion', name: '洋葱', aliases: ['葱头'] },
  { id: 'cabbage', name: '小白菜', aliases: ['青菜', '上海青'] },
  { id: 'potato', name: '土豆', aliases: ['马铃薯'] },
  { id: 'broccoli', name: '西兰花', aliases: ['青花菜'] },
  { id: 'pumpkin', name: '南瓜', aliases: ['贝贝南瓜'] },
  { id: 'sweetPotato', name: '红薯', aliases: ['地瓜'] },
  { id: 'greenPepper', name: '青椒', aliases: ['彩椒'] }
]

test('normalizes multi-food vision results against known food base and limits output', () => {
  const result = normalizeVisionResults({
    foods: [
      { foodBaseId: 'carrot', foodName: '胡萝卜', confidence: 0.94, reason: '橙色长条根茎' },
      { foodName: '西红柿', confidence: 0.88, reason: '红色圆形果实' },
      { foodName: '葱头', confidence: 0.71, reason: '棕色球形外皮' },
      { foodName: '青菜', confidence: 0.7, reason: '绿色叶菜' },
      { foodName: '马铃薯', confidence: 0.68, reason: '土黄色块茎' },
      { foodName: '青花菜', confidence: 0.64, reason: '绿色花球' },
      { foodName: '贝贝南瓜', confidence: 0.62, reason: '橙色瓜类' },
      { foodName: '地瓜', confidence: 0.6, reason: '红皮块根' },
      { foodName: '彩椒', confidence: 0.59, reason: '黄色甜椒' }
    ]
  }, foodBase, { maxResults: 8 })

  assert.equal(result.length, 8)
  assert.deepEqual(result.map((item) => item.foodBaseId), [
    'carrot',
    'tomato',
    'onion',
    'cabbage',
    'potato',
    'broccoli',
    'pumpkin',
    'sweetPotato'
  ])
  assert.equal(result[1].foodName, '番茄')
  assert.equal(result[1].confidence, 0.88)
})

test('normalizes common model aliases for color peppers into local food base', () => {
  const result = normalizeVisionResults({
    foods: [
      { foodName: '黄椒', confidence: 0.91, reason: '黄色甜椒清晰可见' },
      { foodName: '灯笼椒', confidence: 0.82, reason: '圆形彩椒' }
    ]
  }, foodBase)

  assert.deepEqual(result.map((item) => item.foodBaseId), ['greenPepper'])
  assert.equal(result[0].foodName, '青椒')
})

test('normalizes alternative vision response shapes from model output', () => {
  const result = normalizeVisionResults({
    ingredients: [
      { name: '柿子椒', confidence: 0.78, reason: '可见甜椒外形' },
      { label: '圣女果', score: 0.74, reason: '小番茄' }
    ]
  }, foodBase)

  assert.deepEqual(result.map((item) => item.foodBaseId), ['greenPepper', 'tomato'])
  assert.equal(result[1].confidence, 0.74)
})

test('recognizer calls Qwen vision service with food base context when DashScope key is configured', async () => {
  const calls = []
  const logs = []
  const recognizer = createFoodRecognizer({
    qwenApiKey: 'test-key',
    foodBase,
    requestTimeoutMs: 18000,
    logger: {
      info: (message, details) => logs.push({ level: 'info', message, details }),
      warn: (message, details) => logs.push({ level: 'warn', message, details })
    },
    requestJson: async (input) => {
      calls.push(input)
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              foods: [
                { foodBaseId: 'carrot', foodName: '胡萝卜', confidence: 0.92, reason: '清晰可见' },
                { foodName: '西红柿', confidence: 0.81, reason: '红色圆形' }
              ]
            })
          }
        }]
      }
    }
  })

  const result = await recognizer({ imageUrl: 'https://example.com/foods.jpg' })

  assert.equal(calls.length, 1)
  assert.equal(logs[0].message, 'vision recognition requesting remote model')
  assert.equal(logs[0].details.provider, 'qwen')
  assert.equal(logs[0].details.model, 'qwen-vl-plus')
  assert.equal(logs[0].details.requestTimeoutMs, 18000)
  assert.equal(calls[0].apiKey, 'test-key')
  assert.equal(calls[0].timeoutMs, 18000)
  assert.equal(calls[0].path, '/v1/chat/completions')
  assert.match(calls[0].baseUrl, /dashscope\.aliyuncs\.com/)
  assert.equal(calls[0].body.model, 'qwen-vl-plus')
  assert.equal(calls[0].body.messages[0].content[1].image_url.url, 'https://example.com/foods.jpg')
  assert.match(calls[0].body.messages[0].content[0].text, /常见中文食材名/)
  assert.match(calls[0].body.messages[0].content[0].text, /最多返回 8 个/)
  assert.deepEqual(result.map((item) => item.foodBaseId), ['carrot', 'tomato'])
})

test('recognizer keeps mock fallback when api key is missing or image is unavailable', async () => {
  const fallbackResults = [{ foodName: '胡萝卜', foodBaseId: 'carrot', confidence: 0.92 }]
  const logs = []
  const recognizer = createFoodRecognizer({
    apiKey: '',
    foodBase,
    fallbackResults,
    logger: {
      warn: (message, details) => logs.push({ message, details })
    },
    requestJson: async () => {
      throw new Error('should not call remote service')
    }
  })

  assert.deepEqual(await recognizer({ imageUrl: 'https://example.com/foods.jpg' }), fallbackResults)
  assert.deepEqual(await recognizer({}), fallbackResults)
  assert.equal(logs[0].details.reason, 'missing_api_key')
  assert.equal(logs[0].details.hasImageUrl, true)
  assert.equal(logs[1].details.reason, 'missing_api_key')
  assert.equal(logs[1].details.hasImageUrl, false)
})

test('recognizer returns no results instead of mock foods when configured vision request times out', async () => {
  const logs = []
  const recognizer = createFoodRecognizer({
    qwenApiKey: 'test-key',
    foodBase,
    fallbackResults: [{ foodName: '胡萝卜', foodBaseId: 'carrot', confidence: 0.92 }],
    logger: {
      info: () => {},
      warn: (message, details) => logs.push({ message, details })
    },
    requestJson: async () => {
      throw new Error('vision request timed out after 25000ms')
    }
  })

  const result = await recognizer({ imageUrl: 'https://example.com/foods.jpg' })

  assert.deepEqual(result, [])
  assert.equal(logs[0].details.reason, 'remote_request_failed')
})

test('recognizer logs unmatched model candidate names for diagnosis', async () => {
  const logs = []
  const recognizer = createFoodRecognizer({
    qwenApiKey: 'test-key',
    foodBase,
    logger: {
      info: () => {},
      warn: (message, details) => logs.push({ message, details })
    },
    requestJson: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            foods: [
              { foodName: '厨房台面', confidence: 0.7 },
              { name: '未知包装', confidence: 0.6 }
            ]
          })
        }
      }]
    })
  })

  const result = await recognizer({ imageUrl: 'https://example.com/foods.jpg' })

  assert.deepEqual(result, [])
  assert.equal(logs[0].details.reason, 'empty_or_unmatched_model_result')
  assert.deepEqual(logs[0].details.candidateNames, ['厨房台面', '未知包装'])
})

test('recognizer can return unmatched model candidates for manual add fallback', async () => {
  const recognizer = createFoodRecognizer({
    qwenApiKey: 'test-key',
    foodBase,
    includeUnmatchedCandidates: true,
    logger: {
      info: () => {},
      warn: () => {}
    },
    requestJson: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            foods: [
              { foodName: '彩色甜椒', confidence: 0.82, reason: '图片中可见红黄绿色甜椒' },
              { foodName: '厨房台面', confidence: 0.42, reason: '背景物' }
            ]
          })
        }
      }]
    })
  })

  const result = await recognizer({ imageUrl: 'https://example.com/peppers.jpg' })

  assert.deepEqual(result.results, [])
  assert.deepEqual(result.unmatchedCandidates.map((item) => item.foodName), ['彩色甜椒', '厨房台面'])
  assert.equal(result.unmatchedCandidates[0].confidence, 0.82)
})

test('summarizes unmatched model candidates without duplicating matched foods', () => {
  const result = summarizeUnmatchedVisionCandidates({
    foods: [
      { foodName: '西红柿', confidence: 0.9 },
      { foodName: '彩色甜椒', confidence: 0.82, reason: '图片中可见红黄绿色甜椒' },
      { foodName: '彩色甜椒', confidence: 0.7 }
    ]
  }, foodBase)

  assert.deepEqual(result.map((item) => item.foodName), ['彩色甜椒'])
  assert.equal(result[0].reason, '图片中可见红黄绿色甜椒')
})

test('builds Qwen chat completion body with image_url content', () => {
  const body = buildQwenChatBody('https://example.com/foods.jpg', foodBase, { maxResults: 3 })
  const prompt = body.messages[0].content[0].text

  assert.equal(body.model, 'qwen-vl-plus')
  assert.equal(body.messages[0].role, 'user')
  assert.equal(body.messages[0].content[0].type, 'text')
  assert.equal(body.messages[0].content[1].type, 'image_url')
  assert.equal(body.messages[0].content[1].image_url.url, 'https://example.com/foods.jpg')
  assert.equal(body.response_format.type, 'json_object')
  assert.match(prompt, /只返回 JSON/)
  assert.match(prompt, /最多返回 3 个/)
  assert.match(prompt, /常见中文食材名/)
  assert.doesNotMatch(prompt, /carrot: 胡萝卜/)
})

test('recognizer can still use OpenAI responses when only OpenAI key is configured', async () => {
  const calls = []
  const recognizer = createFoodRecognizer({
    openaiApiKey: 'openai-key',
    foodBase,
    logger: {
      info: () => {},
      warn: () => {}
    },
    requestJson: async (input) => {
      calls.push(input)
      return {
        output_text: JSON.stringify({
          foods: [
            { foodBaseId: 'broccoli', foodName: '西兰花', confidence: 0.86, reason: '绿色花球' }
          ]
        })
      }
    }
  })

  const result = await recognizer({ imageUrl: 'https://example.com/broccoli.jpg' })

  assert.equal(calls[0].apiKey, 'openai-key')
  assert.equal(calls[0].path, '/v1/responses')
  assert.match(calls[0].baseUrl, /api\.openai\.com/)
  assert.equal(calls[0].body.input[0].content[1].image_url, 'https://example.com/broccoli.jpg')
  assert.deepEqual(result.map((item) => item.foodBaseId), ['broccoli'])
})

test('resolves cloud file id into temporary https url for external vision service', async () => {
  const calls = []
  const imageUrl = await resolveImageUrl({
    imageUrl: 'cloud://env/recognition/foods.jpg'
  }, {
    getTempFileURL: async (input) => {
      calls.push(input)
      return {
        fileList: [{
          fileID: 'cloud://env/recognition/foods.jpg',
          tempFileURL: 'https://tmp.example.com/foods.jpg'
        }]
      }
    }
  })

  assert.deepEqual(calls, [{ fileList: ['cloud://env/recognition/foods.jpg'] }])
  assert.equal(imageUrl, 'https://tmp.example.com/foods.jpg')
})

test('resolves cloud file id into data url when requested for model input', async () => {
  const imageUrl = await resolveImageUrl({
    imageUrl: 'cloud://env/recognition/foods.jpg'
  }, {
    getTempFileURL: async () => ({
      fileList: [{
        fileID: 'cloud://env/recognition/foods.jpg',
        tempFileURL: 'https://tmp.example.com/foods.jpg'
      }]
    })
  }, {
    asDataUrl: true,
    downloadImage: async (url) => {
      assert.equal(url, 'https://tmp.example.com/foods.jpg')
      return {
        buffer: Buffer.from('abc'),
        contentType: 'image/png'
      }
    }
  })

  assert.equal(imageUrl, 'data:image/png;base64,YWJj')
})
