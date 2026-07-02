const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFoodRecognizer,
  normalizeVisionResults,
  resolveImageUrl
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

test('recognizer calls vision service with food base context when api key is configured', async () => {
  const calls = []
  const recognizer = createFoodRecognizer({
    apiKey: 'test-key',
    foodBase,
    requestJson: async (input) => {
      calls.push(input)
      return {
        output_text: JSON.stringify({
          foods: [
            { foodBaseId: 'carrot', foodName: '胡萝卜', confidence: 0.92, reason: '清晰可见' },
            { foodName: '西红柿', confidence: 0.81, reason: '红色圆形' }
          ]
        })
      }
    }
  })

  const result = await recognizer({ imageUrl: 'https://example.com/foods.jpg' })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].apiKey, 'test-key')
  assert.equal(calls[0].body.input[0].content[1].image_url, 'https://example.com/foods.jpg')
  assert.match(calls[0].body.input[0].content[0].text, /胡萝卜/)
  assert.match(calls[0].body.input[0].content[0].text, /最多返回 8 个/)
  assert.deepEqual(result.map((item) => item.foodBaseId), ['carrot', 'tomato'])
})

test('recognizer keeps mock fallback when api key is missing or image is unavailable', async () => {
  const fallbackResults = [{ foodName: '胡萝卜', foodBaseId: 'carrot', confidence: 0.92 }]
  const recognizer = createFoodRecognizer({
    apiKey: '',
    foodBase,
    fallbackResults,
    requestJson: async () => {
      throw new Error('should not call remote service')
    }
  })

  assert.deepEqual(await recognizer({ imageUrl: 'https://example.com/foods.jpg' }), fallbackResults)
  assert.deepEqual(await recognizer({}), fallbackResults)
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
