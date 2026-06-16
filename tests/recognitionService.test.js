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
})
