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

test('food card opens process advice for the current food only', () => {
  const definition = loadFoodCardDefinition()
  const navigations = []
  const markup = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../components/food-card/food-card.wxml'),
    'utf8'
  )
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }

  definition.methods.goProcessAdvice.call({
    properties: {
      food: { id: 'record-carrot', status: 'baby_today' }
    }
  })

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/quick-process/index?id=record-carrot' }])
  assert.match(markup, /处理建议/)
  assert.match(markup, /bindtap="goProcessAdvice"/)
  assert.match(markup, /food\.status === 'baby_today' \|\| food\.status === 'adult_only'/)
})

test('food card hides note text when it duplicates the status label', () => {
  const markup = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../components/food-card/food-card.wxml'),
    'utf8'
  )

  assert.match(markup, /food\.note && food\.note !== food\.statusText/)
})

test('food card asks before marking a food as processed', async () => {
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
  assert.equal(modals[0].title, '确认已处理？')
  assert.match(modals[0].content, /鸡胸肉/)
  assert.match(modals[0].content, /吃掉或扔掉/)
  assert.deepEqual(finished, [{ recordId: 'record-chicken', action: 'finished' }])
  assert.deepEqual(toasts, [{ title: '已标记处理', icon: 'success' }])
  assert.deepEqual(events, [{ name: 'finished', detail: { id: 'record-chicken' } }])
})

test('food card keeps one processed action instead of separate discard action', () => {
  const markup = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '../components/food-card/food-card.wxml'),
    'utf8'
  )

  assert.match(markup, /已处理/)
  assert.doesNotMatch(markup, /class="mini-action discard"/)
  assert.doesNotMatch(markup, /bindtap="discardFood"/)
  assert.doesNotMatch(markup, /<text>扔掉<\/text>/)
})

test('food card keeps a food when processed confirmation is cancelled', async () => {
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
