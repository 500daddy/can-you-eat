const test = require('node:test')
const assert = require('node:assert/strict')

function loadFeedbackPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/feedback/index')
  delete require.cache[servicePath]
  delete require.cache[pagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require('../pages/feedback/index')
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[servicePath]
  return definition
}

function createPageInstance(definition) {
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    ...definition
  }
}

test('feedback page does not submit empty content', async () => {
  const toasts = []
  let submitted = false
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadFeedbackPage({
    submitFeedback: async () => {
      submitted = true
    }
  }))

  await page.submit()

  delete global.wx
  assert.equal(submitted, false)
  assert.deepEqual(toasts, [{ title: '请写一点反馈内容', icon: 'none' }])
})

test('feedback page ignores duplicate submit while pending', async () => {
  let submitted = false
  global.wx = {
    showToast: () => {}
  }
  const page = createPageInstance(loadFeedbackPage({
    submitFeedback: async () => {
      submitted = true
    }
  }))
  page.setData({
    submitting: true,
    form: {
      ...page.data.form,
      content: '希望补充莲藕'
    }
  })

  await page.submit()

  delete global.wx
  assert.equal(submitted, false)
})

test('feedback page shows failure toast and resets submitting state', async () => {
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input)
  }
  const page = createPageInstance(loadFeedbackPage({
    submitFeedback: async () => {
      throw new Error('network failed')
    }
  }))
  page.setData({
    form: {
      ...page.data.form,
      content: '保存建议不准'
    }
  })

  await page.submit()

  delete global.wx
  assert.equal(page.data.submitting, false)
  assert.deepEqual(toasts, [{ title: '反馈提交失败', icon: 'none' }])
})
