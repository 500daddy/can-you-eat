const test = require('node:test')
const assert = require('node:assert/strict')

function loadFoodCardDefinition() {
  const componentPath = require.resolve('../components/food-card/food-card')
  delete require.cache[componentPath]
  let definition
  global.Component = (input) => {
    definition = input
  }
  require('../components/food-card/food-card')
  delete global.Component
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
