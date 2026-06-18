const assets = require('./assets')

const foodNameMap = {
  西兰花: { foodId: 'broccoli', icon: assets.food.broccoli },
  胡萝卜: { foodId: 'carrot', icon: assets.food.carrot },
  南瓜: { foodId: 'pumpkin', icon: assets.food.pumpkin },
  红薯: { foodId: 'sweetPotato', icon: assets.food.sweetPotato }
}

const localResults = [
  { foodId: 'carrot', foodName: '胡萝卜', confidence: 0.92, percent: 92, icon: assets.food.carrot },
  { foodId: 'pumpkin', foodName: '南瓜', confidence: 0.64, percent: 64, icon: assets.food.pumpkin },
  { foodId: 'sweetPotato', foodName: '红薯', confidence: 0.51, percent: 51, icon: assets.food.sweetPotato }
]

const localLogs = []
const STORAGE_KEY = 'baby_food_recognition_logs_v1'

function createDefaultStorage() {
  if (typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync) {
    return {
      get: (key) => wx.getStorageSync(key),
      set: (key, value) => wx.setStorageSync(key, value)
    }
  }
  return {
    get: () => localLogs,
    set: (key, value) => {
      localLogs.splice(0, localLogs.length, ...(value || []))
    }
  }
}

function resolveUseCloud(value) {
  if (typeof value === 'boolean') return value
  if (typeof getApp === 'function') {
    const app = getApp()
    return Boolean(app && app.globalData && app.globalData.useCloudFoodApi)
  }
  return false
}

function defaultUploadFile(filePath) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('wx.cloud.uploadFile is unavailable'))
  }
  return wx.cloud.uploadFile({
    cloudPath: `recognition/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
    filePath
  })
}

function defaultCallRecognize(data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud.callFunction is unavailable'))
  }
  return wx.cloud.callFunction({
    name: 'mockRecognize',
    data
  }).then((res) => res.result || [])
}

function defaultCallFoodApi(data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error('wx.cloud.callFunction is unavailable'))
  }
  return wx.cloud.callFunction({
    name: 'foodApi',
    data
  }).then((res) => {
    const payload = res.result || {}
    if (payload.ok === false) throw new Error(payload.error || 'foodApi failed')
    return payload.data !== undefined ? payload.data : payload
  })
}

function normalizeResults(results) {
  return (results || []).map((item) => {
    const mapped = foodNameMap[item.foodName] || {
      foodId: item.foodId || item.foodBaseId || 'custom',
      icon: assets.food.babyPuree
    }
    const confidence = Number(item.confidence || 0)
    const foodId = item.foodId || item.foodBaseId || mapped.foodId
    return {
      ...item,
      foodId,
      percent: item.percent || Math.round(confidence * 100),
      icon: item.icon || assets.food[foodId] || mapped.icon
    }
  })
}

function createRecognitionService(options = {}) {
  const uploadFile = options.uploadFile || defaultUploadFile
  const callRecognize = options.callRecognize || defaultCallRecognize
  const callFoodApi = options.callFoodApi || defaultCallFoodApi
  const storage = options.storage || createDefaultStorage()

  function readLocalLogs() {
    const logs = storage.get(STORAGE_KEY)
    return Array.isArray(logs) ? logs : []
  }

  function writeLocalLogs(logs) {
    storage.set(STORAGE_KEY, logs)
  }

  async function recognizeImage(imagePath) {
    if (resolveUseCloud(options.useCloud)) {
      try {
        const uploadResult = await uploadFile(imagePath)
        const imageUrl = uploadResult.fileID || uploadResult.imageUrl || imagePath
        const results = await callRecognize({ imageUrl })
        return {
          imageUrl,
          results: normalizeResults(results)
        }
      } catch (error) {
        if (options.warnOnCloudFallback !== false && typeof console !== 'undefined' && console.warn) {
          console.warn('mockRecognize failed, fallback to local recognition', error)
        }
      }
    }

    return {
      imageUrl: imagePath,
      results: normalizeResults(localResults)
    }
  }

  return {
    recognizeImage,

    async logSelection(input) {
      if (resolveUseCloud(options.useCloud)) {
        try {
          return await callFoodApi({
            action: 'logRecognition',
            ...input
          })
        } catch (error) {
          if (options.warnOnCloudFallback !== false && typeof console !== 'undefined' && console.warn) {
            console.warn('logRecognition failed, fallback to local log', error)
          }
        }
      }
      const log = {
        ...input,
        id: `local-recognition-${Date.now()}-${readLocalLogs().length + 1}`
      }
      writeLocalLogs([log, ...readLocalLogs()])
      return log
    },

    async getRecognitionLogs() {
      if (resolveUseCloud(options.useCloud)) {
        try {
          const logs = await callFoodApi({ action: 'getRecognitionLogs' })
          return Array.isArray(logs) ? logs : []
        } catch (error) {
          if (options.warnOnCloudFallback !== false && typeof console !== 'undefined' && console.warn) {
            console.warn('getRecognitionLogs failed, fallback to local log', error)
          }
        }
      }
      return readLocalLogs()
    },

    async getRecognitionCount() {
      return (await this.getRecognitionLogs()).length
    }
  }
}

let singleton

function getRecognitionService() {
  if (!singleton) {
    singleton = createRecognitionService()
  }
  return singleton
}

module.exports = {
  createRecognitionService,
  getRecognitionService,
  localResults,
  normalizeResults
}
