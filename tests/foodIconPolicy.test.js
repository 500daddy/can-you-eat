const test = require('node:test')
const assert = require('node:assert/strict')

const assets = require('../utils/assets')
const { foodBase } = require('../utils/foodBase')
const { seedFoodBase } = require('../cloudfunctions/foodApi/seedFoodBase')
const manifest = require('../food_icon_manifest.json')
const {
  decorateFoodIconDisplay,
  isVerifiedFoodIcon,
  resolveFoodIconStatus
} = require('../utils/foodIconPolicy')

function findFood(source, id) {
  const food = source.find((item) => item.id === id)
  assert.ok(food, `${id} should exist`)
  return food
}

test('high-frequency foods with dedicated sprites keep their own icons', () => {
  const dedicatedIcons = {
    apple: assets.food.apple,
    banana: assets.food.banana,
    orange: assets.food.orange,
    carrot: assets.food.carrot,
    broccoli: assets.food.broccoli,
    potato: assets.food.potato,
    pumpkin: assets.food.pumpkin,
    egg: assets.food.egg,
    milk: assets.food.milk,
    rice: assets.food.rice,
    noodle: assets.food.noodle,
    chicken: assets.food.chicken,
    beef: assets.food.beef,
    fish: assets.food.fish,
    shrimp: assets.food.shrimp
  }

  for (const [id, icon] of Object.entries(dedicatedIcons)) {
    const localFood = findFood(foodBase, id)
    const seedFood = findFood(seedFoodBase, id)
    assert.equal(localFood.icon, icon)
    assert.equal(seedFood.icon, icon)
    assert.equal(localFood.iconStatus, 'verified')
    assert.equal(seedFood.iconStatus, 'verified')
    assert.equal(isVerifiedFoodIcon(localFood), true)
  }
})

test('manifest foods generated from the icon pack are verified locally and in cloud seed', () => {
  for (const item of manifest) {
    const id = item.filename.replace(/^food_/, '').replace(/\.png$/, '').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    const icon = `/assets/sprites/food/${item.filename}`
    const localFood = findFood(foodBase, id)
    const seedFood = findFood(seedFoodBase, id)
    assert.equal(localFood.icon, icon, `${id} should use generated local icon`)
    assert.equal(seedFood.icon, icon, `${id} should use generated cloud seed icon`)
    assert.equal(localFood.iconStatus, 'verified', `${id} should be verified locally`)
    assert.equal(seedFood.iconStatus, 'verified', `${id} should be verified in cloud seed`)
    assert.equal(isVerifiedFoodIcon(localFood), true)
  }
})

test('legacy borrowed icons are treated as unverified by policy', () => {
  assert.equal(resolveFoodIconStatus({
    id: 'pear',
    name: '梨',
    icon: assets.food.apple
  }), 'none')
  assert.equal(resolveFoodIconStatus({
    id: 'apple',
    name: '苹果',
    icon: assets.food.apple
  }), 'verified')
})

test('legacy cloud foods without iconStatus are upgraded by id before display', () => {
  const decorated = decorateFoodIconDisplay([
    { id: 'broccoli', name: '西兰花', icon: assets.food.broccoli },
    { id: 'pear', name: '梨', icon: assets.food.apple }
  ])

  assert.deepEqual(decorated.map((item) => item.reserveFoodIconSlot), [true, true])
  assert.deepEqual(decorated.map((item) => item.showFoodIcon), [true, true])
  assert.equal(decorated[0].displayFoodIcon, assets.food.broccoli)
  assert.equal(decorated[1].displayFoodIcon, assets.food.pear)
})

test('stale cloud foods are upgraded to local verified icons by id before display', () => {
  const decorated = decorateFoodIconDisplay([
    { id: 'quinoa', name: '藜麦', icon: assets.food.customFood, iconStatus: 'none' },
    { id: 'bokChoy', name: '上海青', icon: assets.food.cabbage, iconStatus: 'none' }
  ])

  assert.deepEqual(decorated.map((item) => item.reserveFoodIconSlot), [true, true])
  assert.deepEqual(decorated.map((item) => item.showFoodIcon), [true, true])
  assert.equal(decorated[0].icon, assets.food.quinoa)
  assert.equal(decorated[0].displayFoodIcon, assets.food.quinoa)
  assert.equal(decorated[1].icon, assets.food.bokChoy)
  assert.equal(decorated[1].displayFoodIcon, assets.food.bokChoy)
})

test('mixed food lists reserve one icon column for every row', () => {
  const decorated = decorateFoodIconDisplay([
    { id: 'apple', name: '苹果', icon: assets.food.apple, iconStatus: 'verified' },
    { id: 'unknownFood', name: '未知食材', icon: assets.food.customFood, iconStatus: 'none' }
  ])

  assert.deepEqual(decorated.map((item) => item.reserveFoodIconSlot), [true, true])
  assert.deepEqual(decorated.map((item) => item.showFoodIcon), [true, false])
})

test('lists without verified icons do not reserve an empty icon column', () => {
  const decorated = decorateFoodIconDisplay([
    { id: 'unknownFruit', name: '未知水果', icon: assets.food.customFood, iconStatus: 'none' },
    { id: 'unknownMeat', name: '未知肉类', icon: assets.food.customFood, iconStatus: 'none' }
  ])

  assert.deepEqual(decorated.map((item) => item.reserveFoodIconSlot), [false, false])
  assert.deepEqual(decorated.map((item) => item.showFoodIcon), [false, false])
})
