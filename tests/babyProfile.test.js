const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveBabyAvatar,
  resolveBabyStageDescription,
  resolveBabyStageText
} = require('../utils/babyProfile')

const assets = {
  mascot: {
    babyBasket: '/basket.png',
    babyFront: '/front.png',
    babyHappy: '/happy.png',
    babyWave: '/wave.png'
  }
}

test('baby profile uses custom avatar before generated defaults', () => {
  assert.equal(resolveBabyAvatar({ babyAvatarUrl: '/tmp/avatar.jpg', babyAgeMonths: 30 }, assets), '/tmp/avatar.jpg')
})

test('baby profile picks default avatar from age and gender', () => {
  assert.equal(resolveBabyAvatar({ babyAgeMonths: 8, babyGender: 'boy' }, assets), '/basket.png')
  assert.equal(resolveBabyAvatar({ babyAgeMonths: 8, babyGender: 'girl' }, assets), '/happy.png')
  assert.equal(resolveBabyAvatar({ babyAgeMonths: 18, babyGender: 'girl' }, assets), '/happy.png')
  assert.equal(resolveBabyAvatar({ babyAgeMonths: 18, babyGender: 'boy' }, assets), '/front.png')
  assert.equal(resolveBabyAvatar({ babyAgeMonths: 30, babyGender: 'boy' }, assets), '/wave.png')
})

test('baby profile stage text replaces decorative levels', () => {
  assert.equal(resolveBabyStageText(5), '准备辅食')
  assert.equal(resolveBabyStageText(8), '辅食探索')
  assert.equal(resolveBabyStageText(18), '幼儿餐')
  assert.equal(resolveBabyStageText(30), '家庭餐过渡')
})

test('baby profile stage descriptions explain what the label means', () => {
  assert.match(resolveBabyStageDescription(5), /6个月前/)
  assert.match(resolveBabyStageDescription(8), /6-12个月/)
  assert.match(resolveBabyStageDescription(8), /辅食尝试/)
  assert.match(resolveBabyStageDescription(18), /12-24个月/)
  assert.match(resolveBabyStageDescription(30), /2岁以上/)
})
