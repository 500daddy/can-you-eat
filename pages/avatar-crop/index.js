const { createShareHandlers } = require('../../utils/share')

function getCropSize() {
  if (typeof wx === 'undefined' || !wx.getSystemInfoSync) return 300
  const { windowWidth } = wx.getSystemInfoSync()
  return Math.min(320, Math.max(240, windowWidth - 64))
}

function getDisplaySize(imageWidth, imageHeight, cropSize) {
  const ratio = imageWidth / imageHeight
  if (ratio >= 1) {
    return {
      width: Math.round(cropSize * ratio),
      height: cropSize
    }
  }
  return {
    width: cropSize,
    height: Math.round(cropSize / ratio)
  }
}

function updateCropState(page, patch) {
  page.cropState = {
    x: page.data.x,
    y: page.data.y,
    scale: page.data.scale,
    ...(page.cropState || {}),
    ...patch
  }
}

function finishCrop(page, avatarUrl, resolve) {
  const channel = page.getOpenerEventChannel && page.getOpenerEventChannel()
  if (channel && channel.emit) {
    channel.emit('avatarCropped', { avatarUrl })
  }
  if (typeof wx !== 'undefined' && wx.navigateBack) wx.navigateBack({ delta: 1 })
  resolve(avatarUrl)
}

function fallbackCrop(page, resolve) {
  const src = page.data.src
  if (typeof wx !== 'undefined' && wx.cropImage) {
    wx.cropImage({
      src,
      cropScale: '1:1',
      success: (res) => finishCrop(page, res.tempFilePath || src, resolve),
      fail: () => finishCrop(page, src, resolve)
    })
    return
  }
  finishCrop(page, src, resolve)
}

Page({
  ...createShareHandlers(),

  data: {
    src: '',
    cropSize: 300,
    imageDisplayWidth: 300,
    imageDisplayHeight: 300,
    x: 0,
    y: 0,
    scale: 1,
    minScale: 1,
    maxScale: 3,
    ready: false,
    saving: false
  },

  onLoad(options = {}) {
    const src = decodeURIComponent(options.src || '')
    const cropSize = getCropSize()
    this.cropState = { x: 0, y: 0, scale: 1 }
    this.setData({ src, cropSize })
    if (!src || typeof wx === 'undefined' || !wx.getImageInfo) return

    wx.getImageInfo({
      src,
      success: (image) => {
        const display = getDisplaySize(image.width, image.height, cropSize)
        const x = Math.round((cropSize - display.width) / 2)
        const y = Math.round((cropSize - display.height) / 2)
        updateCropState(this, { x, y, scale: 1 })
        this.setData({
          imageDisplayWidth: display.width,
          imageDisplayHeight: display.height,
          x,
          y,
          ready: true
        })
      },
      fail: () => {
        if (wx.showToast) wx.showToast({ title: '图片读取失败', icon: 'none' })
      }
    })
  },

  onMove(e) {
    updateCropState(this, {
      x: e.detail.x,
      y: e.detail.y
    })
  },

  onScale(e) {
    updateCropState(this, {
      scale: e.detail.scale,
      x: e.detail.x,
      y: e.detail.y
    })
  },

  onSliderChange(e) {
    const scale = Number(e.detail.value) || 1
    updateCropState(this, { scale })
    this.setData({ scale })
  },

  cancelCrop() {
    if (typeof wx !== 'undefined' && wx.navigateBack) wx.navigateBack({ delta: 1 })
  },

  confirmCrop() {
    if (!this.data.src || this.data.saving || !this.data.ready || typeof wx === 'undefined') return Promise.resolve()
    this.setData({ saving: true })

    const {
      src,
      cropSize,
      imageDisplayWidth,
      imageDisplayHeight
    } = this.data
    const cropState = {
      x: this.data.x,
      y: this.data.y,
      scale: this.data.scale,
      ...(this.cropState || {})
    }
    const scaledWidth = imageDisplayWidth * cropState.scale
    const scaledHeight = imageDisplayHeight * cropState.scale
    const visualX = cropState.x - (scaledWidth - imageDisplayWidth) / 2
    const visualY = cropState.y - (scaledHeight - imageDisplayHeight) / 2
    if (!wx.createCanvasContext || !wx.canvasToTempFilePath) {
      return new Promise((resolve) => fallbackCrop(this, resolve))
    }

    const ctx = wx.createCanvasContext('avatarCropCanvas', this)
    let exportStarted = false
    let completed = false

    ctx.drawImage(src, visualX, visualY, scaledWidth, scaledHeight)
    return new Promise((resolve) => {
      let drawFallbackTimer
      let exportTimeoutTimer
      let retryTimer
      const clearTimers = () => {
        if (drawFallbackTimer) clearTimeout(drawFallbackTimer)
        if (exportTimeoutTimer) clearTimeout(exportTimeoutTimer)
        if (retryTimer) clearTimeout(retryTimer)
      }
      const finishFail = () => {
        if (completed) return
        completed = true
        clearTimers()
        fallbackCrop(this, resolve)
      }
      const exportAvatar = (attempt = 1) => {
        if (exportStarted || completed) return
        exportStarted = true
        exportTimeoutTimer = setTimeout(finishFail, 5000)
        wx.canvasToTempFilePath({
          canvasId: 'avatarCropCanvas',
          x: 0,
          y: 0,
          width: cropSize,
          height: cropSize,
          destWidth: 480,
          destHeight: 480,
          fileType: 'png',
          success: (res) => {
            if (completed) return
            completed = true
            clearTimers()
            finishCrop(this, res.tempFilePath, resolve)
          },
          fail: () => {
            if (completed) return
            exportStarted = false
            if (exportTimeoutTimer) clearTimeout(exportTimeoutTimer)
            if (attempt >= 3) {
              finishFail()
              return
            }
            retryTimer = setTimeout(() => exportAvatar(attempt + 1), 500)
          }
        }, this)
      }
      ctx.draw(false, () => exportAvatar())
      drawFallbackTimer = setTimeout(() => exportAvatar(), 900)
    })
  }
})
