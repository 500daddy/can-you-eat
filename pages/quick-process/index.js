const { getFoodService } = require('../../utils/foodService')

const foodService = getFoodService()

function textOf(food, fields) {
  return fields.map((field) => food[field] || '').join(' ')
}

function matchFoodType(food) {
  const source = textOf(food, ['category', 'subCategory', 'name', 'foodName'])
  if (/肉|鸡|鸭|牛|猪|羊|鱼|虾|贝|水产|海鲜/.test(source)) return 'protein'
  if (/蛋|奶|豆腐|豆浆|酸奶|奶酪|豆制品/.test(source)) return 'dairy'
  if (/米|面|粥|粉|馒头|饺子|主食|辅食/.test(source)) return 'staple'
  if (/苹果|香蕉|蓝莓|草莓|梨|桃|葡萄|橙|柑|水果|猕猴桃|牛油果/.test(source)) return 'fruit'
  if (/菜|瓜|菇|豆|薯|萝卜|番茄|菠菜|蔬菜/.test(source)) return 'vegetable'
  return 'unknown'
}

function buildProcessAdvice(food = {}) {
  const type = matchFoodType(food)
  const commonCheck = '处理前先看颜色、气味、黏液、霉点和包装状态，有异常就不要给宝宝。'
  const commonSafety = '这些建议只用于减少浪费，不替代食品安全判断或医生建议。'

  const adviceMap = {
    vegetable: {
      title: '焯水或蒸熟后做菜泥/拌粥',
      steps: [
        commonCheck,
        '叶菜、菌菇类优先充分清洗并做熟，适合少量加入粥、面或蛋羹。',
        '已经发黄、出水、发黏或有异味时，不建议给宝宝食用。'
      ]
    },
    fruit: {
      title: '去皮去核后做果泥或熟果块',
      steps: [
        commonCheck,
        '切除磕碰处，按宝宝月龄处理成泥、薄片或小软块。',
        '莓果、葡萄、樱桃等要特别注意清洗、去籽和防呛噎。'
      ]
    },
    protein: {
      title: '充分加热后做肉泥/鱼泥/肉末',
      steps: [
        commonCheck,
        '肉禽水产必须彻底做熟，中心无生色后再给宝宝少量尝试。',
        '解冻后不要反复冷冻，腥臭、发黏、出水异常时直接放弃。'
      ]
    },
    dairy: {
      title: '充分加热，开封食材尽快处理',
      steps: [
        commonCheck,
        '蛋类、豆制品要彻底加热；奶制品请优先按包装说明判断。',
        '胀包、结块、酸败、破壳或来源不清时，不建议给宝宝食用。'
      ]
    },
    staple: {
      title: '充分复热后搭配蔬菜或蛋白',
      steps: [
        commonCheck,
        '米面粥饭类要热透，分装过的辅食优先当天处理。',
        '发酸、拉丝、霉点或保存过程不确定时，不建议给宝宝食用。'
      ]
    },
    unknown: {
      title: '先确认状态，再选择保守做法',
      steps: [
        commonCheck,
        '自定义食材缺少标准保存规则，建议按更短保存期、更充分加热来处理。',
        `无法确认来源、保存方式或新鲜度时，不建议给宝宝食用。${commonSafety}`
      ]
    }
  }

  const advice = adviceMap[type] || adviceMap.unknown
  return {
    ...advice,
    steps: type === 'unknown' ? advice.steps : [...advice.steps, commonSafety]
  }
}

function buildProcessItem(food, sourceLabel) {
  return {
    ...food,
    sourceLabel,
    name: food.name || food.foodName || '自定义食材',
    metaText: [food.storageText, food.babyLeft || food.babyLeftText || food.statusText]
      .filter(Boolean)
      .join(' · '),
    suggestion: buildProcessAdvice(food)
  }
}

function buildSafetyNotes(overdue = []) {
  return overdue.map((food) => {
    const name = food.name || food.foodName || '这份食材'
    const status = food.babyLeft || food.babyLeftText || food.statusText || '已超过建议期'
    return `${name}：${status}，不建议把已过期或异常食材推荐给宝宝。`
  })
}

const pageDefinition = {
  data: {
    assets: foodService.getAssets(),
    loading: false,
    items: [],
    safetyNotes: []
  },

  onLoad() {
    this.refresh()
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const reminders = await foodService.getReminders()
      const today = (reminders.today || []).map((item) => buildProcessItem(item, '今天优先'))
      const soon = (reminders.soon || []).map((item) => buildProcessItem(item, '即将临期'))
      this.setData({
        items: [...today, ...soon],
        safetyNotes: buildSafetyNotes(reminders.overdue || [])
      })
    } finally {
      this.setData({ loading: false })
    }
  }
}

Page(pageDefinition)

module.exports = {
  buildProcessAdvice,
  buildProcessItem,
  buildSafetyNotes,
  pageDefinition
}
