const assets = require('./assets')

const verifiedFoodIcons = Object.freeze(Object.keys(assets.food).reduce((result, key) => {
  if (key !== 'customFood') result[key] = assets.food[key]
  return result
}, {}))

function foodIconId(food = {}) {
  return food.foodBaseId || food.foodId || food.id
}

function resolveFoodIconStatus(food = {}) {
  const id = foodIconId(food)
  return verifiedFoodIcons[id] && food.icon === verifiedFoodIcons[id]
    ? 'verified'
    : 'none'
}

function withFoodIconStatus(food = {}) {
  const verifiedIcon = verifiedFoodIcons[foodIconId(food)]
  const nextFood = {
    ...food,
    icon: verifiedIcon || food.icon
  }
  return {
    ...nextFood,
    iconStatus: resolveFoodIconStatus(nextFood)
  }
}

function isVerifiedFoodIcon(food = {}) {
  const resolvedStatus = resolveFoodIconStatus(food)
  if (food.iconStatus === undefined || food.iconStatus === null || food.iconStatus === '') {
    return resolvedStatus === 'verified'
  }
  return food.iconStatus === 'verified' && resolvedStatus === 'verified'
}

function decorateFoodIconItem(food, reserveFoodIconSlot) {
  const nextFood = withFoodIconStatus(food)
  const showFoodIcon = isVerifiedFoodIcon(nextFood)
  return {
    ...nextFood,
    reserveFoodIconSlot,
    showFoodIcon,
    displayFoodIcon: showFoodIcon ? nextFood.icon : ''
  }
}

function decorateFoodIconDisplay(foods = []) {
  const normalizedFoods = foods.map(withFoodIconStatus)
  const reserveFoodIconSlot = normalizedFoods.some(isVerifiedFoodIcon)
  return normalizedFoods.map((food) => decorateFoodIconItem(food, reserveFoodIconSlot))
}

function decorateFoodIconSections(sections = []) {
  const normalizedSections = sections.map((section) => ({
    ...section,
    items: (section.items || []).map(withFoodIconStatus)
  }))
  const reserveFoodIconSlot = normalizedSections
    .flatMap((section) => section.items || [])
    .some(isVerifiedFoodIcon)
  return normalizedSections.map((section) => ({
    ...section,
    items: (section.items || []).map((food) => decorateFoodIconItem(food, reserveFoodIconSlot))
  }))
}

module.exports = {
  decorateFoodIconDisplay,
  decorateFoodIconSections,
  foodIconId,
  isVerifiedFoodIcon,
  resolveFoodIconStatus,
  verifiedFoodIcons,
  withFoodIconStatus
}
