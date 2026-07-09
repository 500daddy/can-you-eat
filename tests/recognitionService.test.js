const test = require('node:test')
const assert = require('node:assert/strict')

const { createRecognitionService } = require('../utils/recognitionService')

test('returns local mock recognition results by default', async () => {
  const service = createRecognitionService({
    useCloud: false
  })

  const result = await service.recognizeImage('/tmp/carrot.png')

  assert.equal(result.imageUrl, '/tmp/carrot.png')
  assert.equal(result.results[0].foodId, 'carrot')
  assert.equal(result.results[0].percent, 92)
  assert.equal(Object.prototype.hasOwnProperty.call(result.results[0], 'icon'), false)
})

test('uploads image and normalizes mockRecognize cloud results when cloud is enabled', async () => {
  const calls = []
  const service = createRecognitionService({
    useCloud: true,
    uploadFile: async (input) => {
      calls.push({ type: 'upload', input })
      return { fileID: 'cloud://food-image' }
    },
    callRecognize: async (input) => {
      calls.push({ type: 'recognize', input })
      return [
        { foodName: '胡萝卜', confidence: 0.92 },
        { foodName: '南瓜', confidence: 0.64 }
      ]
    }
  })

  const result = await service.recognizeImage('/tmp/carrot.png')

  assert.equal(calls[0].type, 'upload')
  assert.equal(calls[1].input.imageUrl, 'cloud://food-image')
  assert.equal(result.imageUrl, 'cloud://food-image')
  assert.deepEqual(result.results.map((item) => item.foodId), ['carrot', 'pumpkin'])
})

test('normalizes cloud foodBaseId recognition results', async () => {
  const service = createRecognitionService({
    useCloud: true,
    uploadFile: async () => ({ fileID: 'cloud://broccoli-image' }),
    callRecognize: async () => [
      { foodName: '西兰花', foodBaseId: 'broccoli', confidence: 0.91, reason: '绿色花球和粗茎很清楚' }
    ]
  })

  const result = await service.recognizeImage('/tmp/broccoli.png')

  assert.equal(result.results[0].foodId, 'broccoli')
  assert.equal(result.results[0].percent, 91)
  assert.equal(result.results[0].confidenceLevel, 'high')
  assert.equal(result.results[0].confidenceLabel, '把握较高')
  assert.equal(result.results[0].reason, '绿色花球和粗茎很清楚')
})

test('normalizes recognition confidence into user-facing levels', async () => {
  const service = createRecognitionService({
    useCloud: true,
    uploadFile: async () => ({ fileID: 'cloud://food-image' }),
    callRecognize: async () => [
      { foodName: '胡萝卜', foodBaseId: 'carrot', confidence: 0.76 },
      { foodName: '南瓜', foodBaseId: 'pumpkin', confidence: 0.6 },
      { foodName: '红薯', foodBaseId: 'sweetPotato', confidence: 0.43, reason: '只看到局部颜色，需要结合实物确认这段文字会被截断' }
    ]
  })

  const result = await service.recognizeImage('/tmp/foods.png')

  assert.deepEqual(result.results.map((item) => item.confidenceLevel), ['high', 'medium', 'low'])
  assert.deepEqual(result.results.map((item) => item.confidenceLabel), ['把握较高', '还需确认', '谨慎参考'])
  assert.equal(result.results[2].reason.length <= 36, true)
})

test('falls back to local recognition if cloud upload fails', async () => {
  const service = createRecognitionService({
    useCloud: true,
    warnOnCloudFallback: false,
    uploadFile: async () => {
      throw new Error('upload failed')
    }
  })

  const result = await service.recognizeImage('/tmp/carrot.png')

  assert.equal(result.imageUrl, '/tmp/carrot.png')
  assert.equal(result.results.length, 3)
})

test('returns empty results instead of local mock foods when cloud recognition fails after upload', async () => {
  const service = createRecognitionService({
    useCloud: true,
    warnOnCloudFallback: false,
    uploadFile: async () => ({ fileID: 'cloud://food-image' }),
    callRecognize: async () => {
      throw new Error('cloud function timed out')
    }
  })

  const result = await service.recognizeImage('/tmp/foods.png')

  assert.equal(result.imageUrl, 'cloud://food-image')
  assert.deepEqual(result.results, [])
})

test('preserves unmatched cloud candidates for manual add fallback', async () => {
  const service = createRecognitionService({
    useCloud: true,
    uploadFile: async () => ({ fileID: 'cloud://pepper-image' }),
    callRecognize: async () => ({
      results: [],
      unmatchedCandidates: [
        { foodName: '彩色甜椒', confidence: 0.82, reason: '图片中可见红黄绿色甜椒' }
      ]
    })
  })

  const result = await service.recognizeImage('/tmp/peppers.png')

  assert.deepEqual(result.results, [])
  assert.equal(result.unmatchedCandidates[0].foodName, '彩色甜椒')
  assert.equal(result.unmatchedCandidates[0].percent, 82)
  assert.equal(result.unmatchedCandidates[0].confidenceLabel, '把握较高')
})

test('logs recognition selections locally', async () => {
  const service = createRecognitionService({
    useCloud: false
  })

  await service.logSelection({
    imageUrl: '/tmp/carrot.png',
    selectedFoodName: '胡萝卜',
    selectedFoodBaseId: 'carrot',
    confidence: 0.92
  })

  assert.equal(await service.getRecognitionCount(), 1)
  assert.equal((await service.getRecognitionLogs())[0].selectedFoodName, '胡萝卜')
})

test('persists local recognition logs through storage adapter', async () => {
  const storage = {}
  const storageAdapter = {
    get: (key) => storage[key],
    set: (key, value) => {
      storage[key] = value
    }
  }
  const firstService = createRecognitionService({
    useCloud: false,
    storage: storageAdapter
  })

  await firstService.logSelection({
    selectedFoodName: '南瓜',
    selectedFoodBaseId: 'pumpkin',
    confidence: 0.64
  })

  const secondService = createRecognitionService({
    useCloud: false,
    storage: storageAdapter
  })

  assert.equal(await secondService.getRecognitionCount(), 1)
  assert.equal((await secondService.getRecognitionLogs())[0].selectedFoodBaseId, 'pumpkin')
})

test('logs recognition selections through foodApi when cloud is enabled', async () => {
  const calls = []
  const service = createRecognitionService({
    useCloud: true,
    callFoodApi: async (data) => {
      calls.push(data)
      if (data.action === 'getRecognitionLogs') return [{ id: 'log-1' }]
      return { id: 'log-1' }
    }
  })

  await service.logSelection({
    selectedFoodName: '南瓜',
    selectedFoodBaseId: 'pumpkin',
    confidence: 0.64
  })

  assert.equal(calls[0].action, 'logRecognition')
  assert.equal(await service.getRecognitionCount(), 1)
  assert.deepEqual(await service.getRecognitionLogs(), [{ id: 'log-1' }])
})
