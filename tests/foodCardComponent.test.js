const test = require('node:test')
const assert = require('node:assert/strict')

function loadFoodCardDefinition(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const componentPath = require.resolve('../components/food-card/food-card')
  delete require.cache[servicePath]
  delete require.cache[componentPath]
  if (foodService) {
    require.cache[servicePath] = {
      id: servicePath,
      filename: servicePath,
      loaded: true,
      exports: {
        getFoodService: () => foodService
      }
    }
  }
  let definition
  global.Component = (input) => {
    definition = input
  }
  require('../components/food-card/food-card')
  delete global.Component
  delete require.cache[componentPath]
  delete require.cache[servicePath]
  return definition
}

test('food card navigates to detail when record id exists', () => {
  const definition = loadFoodCardDefinition()
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }

  definition.methods.goDetail.call({
    properties: {
      food: { id: 'record-carrot' }
    }
  })

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/food/detail?id=record-carrot' }])
})

test('food card does not navigate to a fallback record when id is missing', () => {
  const definition = loadFoodCardDefinition()
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }

  definition.methods.goDetail.call({
    properties: {
      food: {}
    }
  })

  delete global.wx
  assert.deepEqual(navigations, [])
})

test('food card hides note text when it duplicates the status label', () => {
  const markup = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../components/food-card/food-card.wxml'),
    'utf8'
  )

  assert.match(markup, /food\.note && food\.note !== food\.statusText/)
})

test('food card asks before marking a food as eaten', async () => {
  const finished = []
  const toasts = []
  const events = []
  const modals = []
  const definition = loadFoodCardDefinition({
    finishFoodRecord: async (input) => finished.push(input)
  })
  global.wx = {
    showModal: (input) => {
      modals.push(input)
      input.success({ confirm: true })
    },
    showToast: (input) => toasts.push(input)
  }

  await definition.methods.markFinished.call({
    properties: {
      food: { id: 'record-chicken', name: '鸡胸肉' }
    },
    triggerEvent: (name, detail) => events.push({ name, detail })
  })

  delete global.wx
  assert.equal(modals.length, 1)
  assert.equal(modals[0].title, '确认已吃掉？')
  assert.match(modals[0].content, /鸡胸肉/)
  assert.deepEqual(finished, [{ recordId: 'record-chicken', action: 'finished' }])
  assert.deepEqual(toasts, [{ title: '已标记处理', icon: 'success' }])
  assert.deepEqual(events, [{ name: 'finished', detail: { id: 'record-chicken' } }])
})

test('food card keeps a food when eaten confirmation is cancelled', async () => {
  const finished = []
  const events = []
  const definition = loadFoodCardDefinition({
    finishFoodRecord: async (input) => finished.push(input)
  })
  global.wx = {
    showModal: (input) => input.success({ confirm: false }),
    showToast: () => {}
  }

  await definition.methods.markFinished.call({
    properties: {
      food: { id: 'record-chicken', name: '鸡胸肉' }
    },
    triggerEvent: (name, detail) => events.push({ name, detail })
  })

  delete global.wx
  assert.deepEqual(finished, [])
  assert.deepEqual(events, [])
})
