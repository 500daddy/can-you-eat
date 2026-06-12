const assets = require('./assets')
const { getStatus } = require('./status')

const foodBase = [
  {
    id: 'broccoli',
    name: '西兰花',
    aliases: '绿花菜、青花菜',
    category: '蔬菜',
    defaultStorage: 'fridge',
    icon: assets.food.broccoli,
    babyDays: '2-3天',
    adultDays: '3-5天',
    tips: ['常温不建议久放，尽快冷藏。', '冷藏建议1-3天内优先给宝宝食用。', '冷冻前建议焯水后分装。'],
    spoilageSigns: ['发黄', '发黏', '有异味', '花球松散']
  },
  {
    id: 'carrot',
    name: '胡萝卜',
    aliases: '红萝卜',
    category: '根茎',
    defaultStorage: 'fridge',
    icon: assets.food.carrot,
    babyDays: '4-5天',
    adultDays: '7-10天',
    tips: ['冷藏保存更稳妥。', '表面变软或发黏时不建议给宝宝。', '切开后建议尽快使用。'],
    spoilageSigns: ['变软', '发黏', '黑斑', '异味']
  },
  {
    id: 'blueberry',
    name: '蓝莓',
    aliases: '莓果',
    category: '水果',
    defaultStorage: 'fridge',
    icon: assets.food.blueberry,
    babyDays: '1-2天',
    adultDays: '3-5天',
    tips: ['清洗后不建议久放。', '给宝宝食用前需充分清洗并处理大小。', '有破损或霉点请丢弃。'],
    spoilageSigns: ['发霉', '出水', '软烂', '酸败味']
  },
  {
    id: 'pumpkin',
    name: '南瓜',
    aliases: '贝贝南瓜、板栗南瓜',
    category: '蔬菜',
    defaultStorage: 'room',
    icon: assets.food.pumpkin,
    babyDays: '5-7天',
    adultDays: '10-15天',
    tips: ['完整南瓜可阴凉常温保存。', '切开后需要冷藏并尽快食用。', '表面发霉或有异味请处理。'],
    spoilageSigns: ['发霉', '出水', '软烂', '异味']
  },
  {
    id: 'apple',
    name: '苹果',
    aliases: '红苹果、富士',
    category: '水果',
    defaultStorage: 'fridge',
    icon: assets.food.apple,
    babyDays: '5-7天',
    adultDays: '10-14天',
    tips: ['冷藏可延长新鲜感。', '切开后建议尽快食用。', '给宝宝前请去皮去核并处理成合适形态。'],
    spoilageSigns: ['褐变', '软烂', '酒味', '霉点']
  },
  {
    id: 'egg',
    name: '鸡蛋',
    aliases: '蛋',
    category: '蛋奶',
    defaultStorage: 'fridge',
    icon: assets.food.egg,
    babyDays: '7-14天',
    adultDays: '21-30天',
    tips: ['建议冷藏保存。', '给宝宝食用必须充分加热。', '蛋壳破损请谨慎处理。'],
    spoilageSigns: ['破壳', '异味', '散黄']
  },
  {
    id: 'avocado',
    name: '牛油果',
    aliases: '鳄梨',
    category: '水果',
    defaultStorage: 'fridge',
    icon: assets.food.avocado,
    babyDays: '1-2天',
    adultDays: '2-3天',
    tips: ['成熟后尽快食用。', '切开后需要密封冷藏。', '明显褐变或异味不建议给宝宝。'],
    spoilageSigns: ['褐变', '软烂', '异味']
  },
  {
    id: 'banana',
    name: '香蕉',
    aliases: '蕉',
    category: '水果',
    defaultStorage: 'room',
    icon: assets.food.banana,
    babyDays: '1-2天',
    adultDays: '2-4天',
    tips: ['常温阴凉保存。', '过熟变软时不建议给宝宝作为新鲜辅食。', '有酒味或腐烂点请处理。'],
    spoilageSigns: ['酒味', '腐烂', '出水']
  }
]

const records = [
  {
    id: 'record-broccoli',
    foodId: 'broccoli',
    name: '西兰花',
    icon: assets.food.broccoli,
    status: 'baby_today',
    storageText: '冷藏保存',
    storageMethod: 'fridge',
    purchaseDate: '2026-06-10',
    savedDays: '2天',
    babyExpireDate: '2026-06-13',
    adultExpireDate: '2026-06-15',
    babyLeft: '剩1天',
    adultLeft: '剩3天',
    note: '今天优先做熟食用',
    group: '今天建议处理'
  },
  {
    id: 'record-carrot',
    foodId: 'carrot',
    name: '胡萝卜',
    icon: assets.food.carrot,
    status: 'adult_only',
    storageText: '冷藏保存',
    storageMethod: 'fridge',
    purchaseDate: '2026-06-07',
    savedDays: '5天',
    babyExpireDate: '2026-06-11',
    adultExpireDate: '2026-06-16',
    babyLeft: '已超过宝宝建议期',
    adultLeft: '剩4天',
    note: '可留给大人结合状态判断',
    group: '可留给大人吃'
  },
  {
    id: 'record-blueberry',
    foodId: 'blueberry',
    name: '蓝莓',
    icon: assets.food.blueberry,
    status: 'not_recommended',
    storageText: '冷藏保存',
    storageMethod: 'fridge',
    purchaseDate: '2026-06-07',
    savedDays: '5天',
    babyExpireDate: '2026-06-09',
    adultExpireDate: '2026-06-11',
    babyLeft: '不建议给宝宝',
    adultLeft: '已超过参考期',
    note: '如有出水或异味请处理',
    group: '不建议继续食用'
  },
  {
    id: 'record-pumpkin',
    foodId: 'pumpkin',
    name: '南瓜',
    icon: assets.food.pumpkin,
    status: 'baby_ok',
    storageText: '常温保存',
    storageMethod: 'room',
    purchaseDate: '2026-06-11',
    savedDays: '1天',
    babyExpireDate: '2026-06-16',
    adultExpireDate: '2026-06-22',
    babyLeft: '剩4天',
    adultLeft: '剩10天',
    note: '完整南瓜阴凉保存',
    group: '新鲜食材'
  }
].map((item) => ({
  ...item,
  statusText: getStatus(item.status).text,
  statusShortText: getStatus(item.status).shortText
}))

const recognitionResults = [
  { foodId: 'carrot', foodName: '胡萝卜', confidence: 0.92, percent: 92, icon: assets.food.carrot },
  { foodId: 'pumpkin', foodName: '南瓜', confidence: 0.64, percent: 64, icon: assets.food.pumpkin },
  { foodId: 'sweetPotato', foodName: '红薯', confidence: 0.51, percent: 51, icon: assets.food.sweetPotato }
]

function getRecord(id) {
  return records.find((item) => item.id === id) || records[0]
}

function getFoodBase(id) {
  return foodBase.find((item) => item.id === id) || foodBase[0]
}

module.exports = {
  assets,
  foodBase,
  records,
  recognitionResults,
  getRecord,
  getFoodBase
}
