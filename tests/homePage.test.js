const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadHomePage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/index/index')
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
  require('../pages/index/index')
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

test('home add button opens food search instead of default broccoli add page', () => {
  const navigations = []
  global.wx = {
    navigateTo: (input) => navigations.push(input)
  }
  const page = createPageInstance(loadHomePage({
    getAssets: () => ({})
  }))

  page.goAdd()

  delete global.wx
  assert.deepEqual(navigations, [{ url: '/pages/food/search' }])
})

test('home empty state hides duplicate action buttons', () => {
  const homeMarkup = readText('pages/index/index.wxml')
  const emptyMarkup = readText('components/pixel-empty/pixel-empty.wxml')

  assert.match(homeMarkup, /<pixel-empty[^>]+show-actions="\{\{false\}\}"/)
  assert.match(emptyMarkup, /<view wx:if="\{\{showActions\}\}" class="empty-actions">/)
})
