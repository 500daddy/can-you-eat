const test = require('node:test')
const assert = require('node:assert/strict')

const assets = require('../utils/assets')
const { foodBase } = require('../utils/foodBase')
const { seedFoodBase } = require('../cloudfunctions/foodApi/seedFoodBase')

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
    assert.equal(findFood(foodBase, id).icon, icon)
    assert.equal(findFood(seedFoodBase, id).icon, icon)
  }
})

test('common foods without dedicated sprites use the generic food icon', () => {
  const genericIcon = assets.food.customFood
  const foodsWithoutDedicatedSprites = [
    'pear',
    'peach',
    'plum',
    'watermelon',
    'cantaloupe',
    'mango',
    'papaya',
    'pineapple',
    'radish',
    'pork',
    'lamb',
    'duck',
    'turkey',
    'scallop',
    'clam',
    'edamame'
  ]

  for (const id of foodsWithoutDedicatedSprites) {
    assert.equal(findFood(foodBase, id).icon, genericIcon, `${id} should not borrow another food icon locally`)
    assert.equal(findFood(seedFoodBase, id).icon, genericIcon, `${id} should not borrow another food icon in cloud seed`)
  }
})
