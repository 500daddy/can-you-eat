const stagePlans = [
  {
    min: 12,
    label: '12个月+',
    hint: '可尝试更丰富的家庭食材，仍需注意糖盐、过敏原和食物形态。',
    ids: ['cheese', 'egg', 'fish', 'chicken', 'beef', 'tofu', 'broccoli', 'tomato', 'noodle', 'bread']
  },
  {
    min: 10,
    label: '10-11个月',
    hint: '优先选择能练习咀嚼、也容易做熟做软的食材。',
    ids: ['fish', 'chicken', 'beef', 'tofu', 'egg', 'noodle', 'broccoli', 'tomato', 'lotusRoot', 'orange']
  },
  {
    min: 8,
    label: '8-9个月',
    hint: '可从细腻泥糊过渡到软烂小颗粒，蛋白类少量尝试并充分加热。',
    ids: ['porridge', 'carrot', 'pumpkin', 'broccoli', 'tofu', 'egg', 'fish', 'chicken', 'apple', 'banana']
  },
  {
    min: 6,
    label: '6-7个月',
    hint: '适合从细腻泥糊、软烂根茎和温和水果开始，少量单一尝试。',
    ids: ['babyPuree', 'porridge', 'carrot', 'pumpkin', 'apple', 'banana', 'broccoli', 'rice', 'sweetPotato']
  },
  {
    min: 0,
    label: '未满6个月',
    hint: '暂不主动推荐新增辅食；如需添加请先咨询专业医生。',
    ids: ['babyPuree', 'porridge', 'carrot', 'pumpkin', 'apple']
  }
]

function getRecommendationStage(ageMonths = 0) {
  const months = Number(ageMonths) || 0
  return stagePlans.find((stage) => months >= stage.min) || stagePlans[stagePlans.length - 1]
}

function decorateRecommendation(food, stage, index) {
  return {
    ...food,
    recommendationStage: stage.label,
    recommendationHint: stage.hint,
    recommendationRank: index + 1
  }
}

function sortFoodsForBabyAge(foods, ageMonths = 0) {
  const source = Array.isArray(foods) ? foods : []
  const stage = getRecommendationStage(ageMonths)
  const byId = source.reduce((map, food) => {
    map[food.id] = food
    return map
  }, {})
  const picked = []
  const used = {}

  stage.ids.forEach((id) => {
    if (byId[id]) {
      used[id] = true
      picked.push(byId[id])
    }
  })

  source.forEach((food) => {
    if (!used[food.id]) picked.push(food)
  })

  return picked.map((food, index) => decorateRecommendation(food, stage, index))
}

module.exports = {
  getRecommendationStage,
  sortFoodsForBabyAge
}
