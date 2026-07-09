const stagePlans = [
  {
    min: 12,
    label: '12个月+',
    hint: '优先覆盖主食、蔬菜、优质蛋白、豆制品和水果，仍需注意少盐少糖、过敏原和食物形态。',
    ids: ['porridge', 'carrot', 'chicken', 'tofu', 'banana', 'egg', 'fish', 'broccoli', 'tomato', 'rice']
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

function normalizeAllergens(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return String(value || '').split(/[、,，\s]/).map((item) => item.trim()).filter(Boolean)
}

function foodAllergenText(food) {
  return [
    food && food.name,
    food && food.aliases,
    food && food.category,
    food && food.subCategory
  ].flatMap((item) => Array.isArray(item) ? item : String(item || '').split(/[、,，\s]/))
    .join(' ')
}

function matchesBabyAllergen(food, babyAllergens) {
  const searchText = foodAllergenText(food)
  return normalizeAllergens(babyAllergens).some((allergen) => searchText.includes(allergen))
}

function dateSeed(value = '') {
  return String(value).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function rotateDaily(foods, today = '') {
  const source = Array.isArray(foods) ? foods : []
  if (source.length <= 1) return source
  const offset = dateSeed(today) % source.length
  return [...source.slice(offset), ...source.slice(0, offset)]
}

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

function sortFoodsForBabyAge(foods, ageMonths = 0, options = {}) {
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

  const stagePicked = picked.slice(0, stage.ids.length)
    .filter((food) => !matchesBabyAllergen(food, options.babyAllergens))
  const fallbackPicked = picked.slice(stage.ids.length)
    .filter((food) => !matchesBabyAllergen(food, options.babyAllergens))
  const personalized = [
    ...rotateDaily(stagePicked, options.today),
    ...fallbackPicked
  ]

  return personalized.map((food, index) => decorateRecommendation(food, stage, index))
}

module.exports = {
  getRecommendationStage,
  sortFoodsForBabyAge
}
