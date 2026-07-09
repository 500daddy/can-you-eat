function resolveBabyStageText(ageMonths = 0) {
  const months = Number(ageMonths) || 0
  if (months < 6) return '准备辅食'
  if (months < 12) return '辅食探索'
  if (months < 24) return '幼儿餐'
  return '家庭餐过渡'
}

function resolveBabyStageDescription(ageMonths = 0) {
  const months = Number(ageMonths) || 0
  if (months < 6) return '6个月前，以准备和观察为主，食材建议会更谨慎。'
  if (months < 12) return '6-12个月，表示宝宝处在辅食尝试阶段，推荐会偏向低风险、易处理、适合逐步尝试的食材。'
  if (months < 24) return '12-24个月，开始接近幼儿餐，推荐会兼顾软烂度、营养密度和咀嚼能力。'
  return '2岁以上，逐步向家庭餐过渡，推荐会保留少盐少糖和安全处理提醒。'
}

function resolveBabyAvatar(settings = {}, assets = {}) {
  if (settings.babyAvatarUrl) return settings.babyAvatarUrl
  const mascot = assets.mascot || {}
  const months = Number(settings.babyAgeMonths) || 0
  if (months < 12) {
    if (settings.babyGender === 'girl') return mascot.babyHappy || mascot.babyBasket || mascot.babyFront || ''
    return mascot.babyBasket || mascot.babyFront || ''
  }
  if (months >= 24) return mascot.babyWave || mascot.babyFront || ''
  if (settings.babyGender === 'girl') return mascot.babyHappy || mascot.babyFront || ''
  return mascot.babyFront || mascot.babyHappy || ''
}

function decorateBabyProfile(settings = {}, assets = {}) {
  return {
    ...settings,
    babyAvatarImage: resolveBabyAvatar(settings, assets),
    babyStageText: resolveBabyStageText(settings.babyAgeMonths),
    babyStageDescription: resolveBabyStageDescription(settings.babyAgeMonths)
  }
}

module.exports = {
  decorateBabyProfile,
  resolveBabyAvatar,
  resolveBabyStageDescription,
  resolveBabyStageText
}
