const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(projectRoot, projectPath), 'utf8')
}

test('food-facing pages do not render unverified ingredient icons from raw food data', () => {
  const templates = [
    'pages/food/add.wxml',
    'pages/food/edit.wxml',
    'pages/food/detail.wxml',
    'pages/recognize/index.wxml'
  ]
  const forbiddenBindings = [
    'food.icon',
    'form.icon',
    'record.icon',
    'item.icon'
  ]

  for (const template of templates) {
    const markup = readText(template)
    for (const binding of forbiddenBindings) {
      assert.doesNotMatch(markup, new RegExp(binding.replace('.', '\\.')), `${template} should not render ${binding}`)
    }
  }
})

test('ingredient list icons use verified display flags and fixed slots', () => {
  const listTemplates = [
    'components/food-card/food-card.wxml',
    'pages/food/search.wxml',
    'pages/food/name-search.wxml',
    'pages/purchase-plan/index.wxml',
    'pages/quick-process/index.wxml'
  ]

  for (const template of listTemplates) {
    const markup = readText(template)
    assert.match(markup, /reserveFoodIconSlot/, `${template} should reserve a shared icon slot`)
    assert.match(markup, /showFoodIcon/, `${template} should only render verified icons`)
    assert.doesNotMatch(markup, /<image[^>]+src="\{\{item\.icon\}\}"/, `${template} should not directly render item.icon`)
    assert.doesNotMatch(markup, /<image[^>]+src="\{\{food\.icon\}\}"/, `${template} should not directly render food.icon`)
  }
})

test('ingredient list icons keep legacy display size while sprites provide their own padding', () => {
  const stylesheets = [
    'components/food-card/food-card.wxss',
    'pages/food/search.wxss',
    'pages/food/name-search.wxss',
    'pages/purchase-plan/index.wxss',
    'pages/quick-process/index.wxss'
  ]

  for (const stylesheet of stylesheets) {
    const styles = readText(stylesheet)
    assert.match(styles, /\.food-icon-slot\s*\{[\s\S]*width:\s*76rpx/, `${stylesheet} should keep a stable icon slot`)
    assert.match(styles, /\.food-icon-img\s*\{[\s\S]*width:\s*68rpx[\s\S]*height:\s*68rpx/, `${stylesheet} should keep ingredient icons aligned with legacy sprites`)
  }
})

test('category entry points may render category icons without restoring ingredient list icons', () => {
  const searchMarkup = readText('pages/food/search.wxml')
  const homeMarkup = readText('pages/index/index.wxml')

  assert.match(searchMarkup, /class="category-icon"/)
  assert.match(searchMarkup, /assets\.food\.babyPuree/)
  assert.match(searchMarkup, /category\.icon/)
  assert.doesNotMatch(searchMarkup, /class="result-icon"/)
  assert.doesNotMatch(searchMarkup, /<image[^>]+src="\{\{item\.icon\}\}"/)

  assert.match(homeMarkup, /assets\.food\.broccoli/)
  assert.match(homeMarkup, /按分类找/)
  assert.doesNotMatch(homeMarkup, /food\.icon|record\.icon|item\.icon/)
})
