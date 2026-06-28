const assets = require('./assets')
const { createExpandedFoodBase } = require('./expandedFoodBase')

const baseRanges = {
  shortFridge: {
    room: { babyDaysMin: 0, babyDaysMax: 0, adultDaysMin: 0, adultDaysMax: 1, text: '常温不建议久放，建议尽快冷藏。' },
    fridge: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 3, adultDaysMax: 5, text: '冷藏保存，宝宝食材建议尽早处理。' },
    freezer: { babyDaysMin: 15, babyDaysMax: 30, adultDaysMin: 30, adultDaysMax: 60, text: '冷冻前建议分装，解冻后尽快食用。' }
  },
  mediumFridge: {
    room: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 2, adultDaysMax: 3, text: '阴凉常温可短暂保存，宝宝食材建议冷藏。' },
    fridge: { babyDaysMin: 2, babyDaysMax: 4, adultDaysMin: 5, adultDaysMax: 10, text: '冷藏保存更稳妥，取用后及时放回。' },
    freezer: { babyDaysMin: 30, babyDaysMax: 45, adultDaysMin: 60, adultDaysMax: 90, text: '冷冻保存前建议清洗、切分并密封。' }
  },
  longRoom: {
    room: { babyDaysMin: 3, babyDaysMax: 7, adultDaysMin: 7, adultDaysMax: 15, text: '完整食材可阴凉常温保存，切开后请冷藏。' },
    fridge: { babyDaysMin: 4, babyDaysMax: 7, adultDaysMin: 7, adultDaysMax: 14, text: '冷藏保存可延缓变质，切面需密封。' },
    freezer: { babyDaysMin: 30, babyDaysMax: 60, adultDaysMin: 60, adultDaysMax: 120, text: '冷冻前建议切块分装。' }
  },
  protein: {
    room: { babyDaysMin: 0, babyDaysMax: 0, adultDaysMin: 0, adultDaysMax: 0, text: '肉蛋奶类不建议常温放置。' },
    fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 2, text: '冷藏保存也应尽快充分加热后食用。' },
    freezer: { babyDaysMin: 15, babyDaysMax: 30, adultDaysMin: 30, adultDaysMax: 90, text: '冷冻保存需密封，避免反复解冻。' }
  }
}

function food(item, ranges) {
  return {
    confidenceLevel: 'medium',
    sourceNote: 'MVP 参考数据，后续可接入正式食材库校准。',
    imageUrl: '',
    ...ranges,
    ...item
  }
}

const coreFoodBase = [
  food({
    id: 'broccoli',
    name: '西兰花',
    aliases: ['绿花菜', '青花菜'],
    category: '蔬菜',
    subCategory: '花菜类',
    defaultStorage: 'fridge',
    icon: assets.food.broccoli,
    babyDays: '2-3天',
    adultDays: '3-5天',
    babyNote: '建议充分清洗并做熟后食用。',
    adultNote: '超过宝宝建议期后，请结合外观、气味和触感判断。',
    storageTips: ['常温不建议久放，尽快冷藏。', '冷藏建议1-3天内优先给宝宝食用。', '冷冻前建议焯水后分装。'],
    spoilageSigns: ['发黄', '发黏', '有异味', '花球松散']
  }, {
    room: { babyDaysMin: 0, babyDaysMax: 0, adultDaysMin: 0, adultDaysMax: 1, text: '常温不建议久放。' },
    fridge: { babyDaysMin: 2, babyDaysMax: 3, adultDaysMin: 3, adultDaysMax: 5, text: '冷藏建议1-3天内优先给宝宝食用。' },
    freezer: { babyDaysMin: 30, babyDaysMax: 45, adultDaysMin: 60, adultDaysMax: 90, text: '焯水分装后冷冻更稳妥。' }
  }),
  food({
    id: 'carrot',
    name: '胡萝卜',
    aliases: ['红萝卜'],
    category: '蔬菜',
    subCategory: '根茎类',
    defaultStorage: 'fridge',
    icon: assets.food.carrot,
    babyDays: '4-5天',
    adultDays: '7-10天',
    babyNote: '切开后建议尽快处理。',
    adultNote: '表面变软、发黏或有异味时请谨慎处理。',
    storageTips: ['冷藏保存更稳妥。', '表面变软或发黏时不建议给宝宝。', '切开后建议尽快使用。'],
    spoilageSigns: ['变软', '发黏', '黑斑', '异味']
  }, {
    ...baseRanges.mediumFridge,
    fridge: { babyDaysMin: 4, babyDaysMax: 4, adultDaysMin: 7, adultDaysMax: 10, text: '冷藏保存更稳妥。' }
  }),
  food({ id: 'blueberry', name: '蓝莓', aliases: ['莓果'], category: '水果', subCategory: '莓果类', defaultStorage: 'fridge', icon: assets.food.blueberry, babyDays: '1-2天', adultDays: '3-5天', babyNote: '给宝宝食用前需充分清洗并处理大小。', adultNote: '有霉点、出水或酸败味请处理。', storageTips: ['清洗后不建议久放。', '给宝宝食用前需充分清洗并处理大小。', '有破损或霉点请丢弃。'], spoilageSigns: ['发霉', '出水', '软烂', '酸败味'] }, baseRanges.shortFridge),
  food({ id: 'pumpkin', name: '南瓜', aliases: ['贝贝南瓜', '板栗南瓜', '老南瓜'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: assets.food.pumpkin, babyDays: '5-7天', adultDays: '10-15天', babyNote: '切开后请冷藏并尽快做熟。', adultNote: '表面发霉或有异味请处理。', storageTips: ['完整南瓜可阴凉常温保存。', '切开后需要冷藏并尽快食用。', '表面发霉或有异味请处理。'], spoilageSigns: ['发霉', '出水', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'apple', name: '苹果', aliases: ['红苹果', '富士'], category: '水果', subCategory: '仁果类', defaultStorage: 'fridge', icon: assets.food.apple, babyDays: '5-7天', adultDays: '10-14天', babyNote: '给宝宝前请去皮去核并处理成合适形态。', adultNote: '切开后褐变、酒味或霉点请谨慎处理。', storageTips: ['冷藏可延长新鲜感。', '切开后建议尽快食用。', '给宝宝前请去皮去核并处理成合适形态。'], spoilageSigns: ['褐变', '软烂', '酒味', '霉点'] }, baseRanges.longRoom),
  food({ id: 'egg', name: '鸡蛋', aliases: ['蛋'], category: '蛋奶豆制品', subCategory: '蛋类', defaultStorage: 'fridge', icon: assets.food.egg, babyDays: '7-14天', adultDays: '21-30天', babyNote: '给宝宝食用必须充分加热。', adultNote: '蛋壳破损或有异味请谨慎处理。', storageTips: ['建议冷藏保存。', '给宝宝食用必须充分加热。', '蛋壳破损请谨慎处理。'], spoilageSigns: ['破壳', '异味', '散黄'] }, { room: { babyDaysMin: 0, babyDaysMax: 0, adultDaysMin: 0, adultDaysMax: 1, text: '不建议常温久放。' }, fridge: { babyDaysMin: 7, babyDaysMax: 14, adultDaysMin: 21, adultDaysMax: 30, text: '冷藏保存，食用前充分加热。' }, freezer: { babyDaysMin: 0, babyDaysMax: 0, adultDaysMin: 0, adultDaysMax: 0, text: '带壳鸡蛋不建议直接冷冻。' } }),
  food({ id: 'avocado', name: '牛油果', aliases: ['鳄梨'], category: '水果', subCategory: '热带水果', defaultStorage: 'fridge', icon: assets.food.avocado, babyDays: '1-2天', adultDays: '2-3天', babyNote: '成熟后尽快食用。', adultNote: '明显褐变或异味请处理。', storageTips: ['成熟后尽快食用。', '切开后需要密封冷藏。', '明显褐变或异味不建议给宝宝。'], spoilageSigns: ['褐变', '软烂', '异味'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 2, adultDaysMax: 3, text: '成熟后密封冷藏。' } }),
  food({ id: 'banana', name: '香蕉', aliases: ['蕉'], category: '水果', subCategory: '热带水果', defaultStorage: 'room', icon: assets.food.banana, babyDays: '1-2天', adultDays: '2-4天', babyNote: '过熟变软时不建议给宝宝作为新鲜辅食。', adultNote: '有酒味或腐烂点请处理。', storageTips: ['常温阴凉保存。', '过熟变软时不建议给宝宝作为新鲜辅食。', '有酒味或腐烂点请处理。'], spoilageSigns: ['酒味', '腐烂', '出水'] }, { ...baseRanges.shortFridge, room: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 2, adultDaysMax: 4, text: '常温阴凉保存。' } }),
  food({ id: 'strawberry', name: '草莓', aliases: ['莓'], category: '水果', subCategory: '莓果类', defaultStorage: 'fridge', icon: assets.food.strawberry, babyDays: '1天', adultDays: '2-3天', babyNote: '需充分清洗并处理大小。', adultNote: '霉点、出水或酸败味请处理。', storageTips: ['草莓不耐放，建议尽快食用。'], spoilageSigns: ['发霉', '出水', '软烂', '酸败味'] }, baseRanges.shortFridge),
  food({ id: 'kiwi', name: '猕猴桃', aliases: ['奇异果'], category: '水果', subCategory: '热带水果', defaultStorage: 'fridge', icon: assets.food.kiwi, babyDays: '2-3天', adultDays: '4-6天', babyNote: '成熟后去皮，少量尝试。', adultNote: '酒味、软烂或霉点请处理。', storageTips: ['成熟后冷藏保存。'], spoilageSigns: ['酒味', '软烂', '霉点', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'orange', name: '橙子', aliases: ['柑橘', '橘子'], category: '水果', subCategory: '柑橘类', defaultStorage: 'fridge', icon: assets.food.orange, babyDays: '4-7天', adultDays: '10-14天', babyNote: '去籽去膜并少量尝试。', adultNote: '霉点、酒味或软烂请处理。', storageTips: ['冷藏可延长新鲜感。'], spoilageSigns: ['霉点', '软烂', '酒味', '异味'] }, baseRanges.longRoom),
  food({ id: 'lemon', name: '柠檬', aliases: ['黄柠檬'], category: '水果', subCategory: '柑橘类', defaultStorage: 'fridge', icon: assets.food.lemon, babyDays: '4-7天', adultDays: '10-14天', babyNote: '酸度较高，不建议作为宝宝主要水果。', adultNote: '霉点、软烂或异味请处理。', storageTips: ['切开后密封冷藏。'], spoilageSigns: ['霉点', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'tomato', name: '番茄', aliases: ['西红柿', '小番茄', '圣女果'], category: '蔬菜', subCategory: '茄果类', defaultStorage: 'fridge', icon: assets.food.tomato, babyDays: '2-3天', adultDays: '4-6天', babyNote: '建议去皮做熟后少量尝试。', adultNote: '软烂、裂口或有异味请谨慎。', storageTips: ['成熟番茄可冷藏短期保存。', '切开后请密封冷藏并尽快食用。'], spoilageSigns: ['软烂', '裂口', '霉点', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'potato', name: '土豆', aliases: ['马铃薯'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: assets.food.potato, babyDays: '5-7天', adultDays: '10-15天', babyNote: '发芽、发绿或味苦时不要给宝宝食用。', adultNote: '发芽发绿请谨慎处理。', storageTips: ['阴凉避光保存。', '不要和容易释放水分的食材混放。'], spoilageSigns: ['发芽', '发绿', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'sweetPotato', name: '红薯', aliases: ['地瓜', '甘薯'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: assets.food.sweetPotato, babyDays: '5-7天', adultDays: '10-15天', babyNote: '建议蒸熟后观察宝宝接受度。', adultNote: '发霉、黑斑或异味请处理。', storageTips: ['阴凉通风保存。', '切开后请冷藏。'], spoilageSigns: ['发霉', '黑斑', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'lotusRoot', name: '莲藕', aliases: ['藕'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'fridge', icon: assets.food.lotusRoot, babyDays: '2-3天', adultDays: '4-7天', babyNote: '建议去皮切小块并充分煮熟。', adultNote: '发黑、发黏或有酸味请处理。', storageTips: ['切开后请密封冷藏。', '给宝宝前充分做熟。'], spoilageSigns: ['发黑', '发黏', '酸味', '霉点'] }, baseRanges.mediumFridge),
  food({ id: 'spinach', name: '菠菜', aliases: ['波菜'], category: '蔬菜', subCategory: '叶菜类', defaultStorage: 'fridge', icon: assets.food.spinach, babyDays: '1-2天', adultDays: '2-4天', babyNote: '叶菜类建议尽快做熟。', adultNote: '发黄、出水或发黏请处理。', storageTips: ['叶菜类请冷藏并尽快食用。', '清洗后不建议久放。'], spoilageSigns: ['发黄', '出水', '发黏', '异味'] }, baseRanges.shortFridge),
  food({ id: 'cabbage', name: '小白菜', aliases: ['青菜', '上海青', '油菜'], category: '蔬菜', subCategory: '叶菜类', defaultStorage: 'fridge', icon: assets.food.cabbage, babyDays: '1-2天', adultDays: '2-4天', babyNote: '建议做熟后给宝宝。', adultNote: '叶片发黏或异味请处理。', storageTips: ['冷藏保存，尽快食用。', '清洗后不建议久放。'], spoilageSigns: ['发黄', '出水', '发黏', '异味'] }, baseRanges.shortFridge),
  food({ id: 'cucumber', name: '黄瓜', aliases: ['青瓜'], category: '蔬菜', subCategory: '瓜类', defaultStorage: 'fridge', icon: assets.food.cucumber, babyDays: '2-3天', adultDays: '4-6天', babyNote: '宝宝食用建议去皮并结合月龄处理形态。', adultNote: '发软、出水或有异味请处理。', storageTips: ['冷藏保存更稳妥。', '切开后请密封冷藏。'], spoilageSigns: ['发软', '出水', '发黏', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'eggplant', name: '茄子', aliases: ['紫茄'], category: '蔬菜', subCategory: '茄果类', defaultStorage: 'fridge', icon: assets.food.eggplant, babyDays: '2-3天', adultDays: '4-6天', babyNote: '建议做熟后少量尝试。', adultNote: '表皮皱缩、软烂或异味请处理。', storageTips: ['冷藏保存，避免挤压。'], spoilageSigns: ['软烂', '皱缩', '黑斑', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'greenPepper', name: '青椒', aliases: ['甜椒', '彩椒'], category: '蔬菜', subCategory: '茄果类', defaultStorage: 'fridge', icon: assets.food.greenPepper, babyDays: '2-3天', adultDays: '4-6天', babyNote: '建议去籽做熟后少量尝试。', adultNote: '软烂、皱缩或异味请处理。', storageTips: ['冷藏保存。', '切开后请密封。'], spoilageSigns: ['软烂', '皱缩', '霉点', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'corn', name: '玉米', aliases: ['甜玉米'], category: '蔬菜', subCategory: '谷物类', defaultStorage: 'fridge', icon: assets.food.corn, babyDays: '1-2天', adultDays: '3-5天', babyNote: '整粒玉米需按月龄处理，避免噎 choking 风险。', adultNote: '酸味、发黏或霉点请处理。', storageTips: ['煮熟后冷藏并尽快食用。'], spoilageSigns: ['酸味', '发黏', '霉点', '异味'] }, baseRanges.shortFridge),
  food({ id: 'mushroom', name: '蘑菇', aliases: ['香菇', '口蘑', '菌菇'], category: '蔬菜', subCategory: '菌菇类', defaultStorage: 'fridge', icon: assets.food.mushroom, babyDays: '1-2天', adultDays: '3-5天', babyNote: '菌菇类建议充分做熟后食用。', adultNote: '发黏、出水或有酸味请处理。', storageTips: ['纸袋或透气包装冷藏。', '清洗后不建议久放。'], spoilageSigns: ['发黏', '出水', '酸味', '霉点'] }, baseRanges.shortFridge),
  food({ id: 'onion', name: '洋葱', aliases: ['葱头'], category: '蔬菜', subCategory: '葱蒜类', defaultStorage: 'room', icon: assets.food.onion, babyDays: '5-7天', adultDays: '10-15天', babyNote: '刺激性较强，建议做熟后少量尝试。', adultNote: '发芽、霉点或异味请处理。', storageTips: ['完整洋葱可阴凉通风保存。', '切开后请冷藏。'], spoilageSigns: ['发芽', '霉点', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'garlic', name: '大蒜', aliases: ['蒜'], category: '蔬菜', subCategory: '葱蒜类', defaultStorage: 'room', icon: assets.food.garlic, babyDays: '5-7天', adultDays: '10-20天', babyNote: '刺激性较强，不建议作为宝宝主要食材。', adultNote: '发霉、腐烂或异味请处理。', storageTips: ['阴凉通风保存。'], spoilageSigns: ['发霉', '发芽', '软烂', '异味'] }, baseRanges.longRoom),
  food({ id: 'chicken', name: '鸡胸肉', aliases: ['鸡肉'], category: '肉禽水产', subCategory: '禽肉类', defaultStorage: 'freezer', icon: assets.food.chicken, babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏2天 / 冷冻90天', babyNote: '必须充分加热，冷藏不宜久放。', adultNote: '异味、发黏或变色请处理。', storageTips: ['冷藏仅短期保存。', '建议分装冷冻，避免反复解冻。'], spoilageSigns: ['异味', '发黏', '变色', '出水'] }, baseRanges.protein),
  food({ id: 'beef', name: '牛肉', aliases: ['牛里脊'], category: '肉禽水产', subCategory: '畜肉类', defaultStorage: 'freezer', icon: assets.food.beef, babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏2天 / 冷冻90天', babyNote: '必须充分加热，观察宝宝咀嚼能力。', adultNote: '异味、发黏或明显变色请处理。', storageTips: ['冷藏仅短期保存。', '建议分装冷冻。'], spoilageSigns: ['异味', '发黏', '变色', '出水'] }, baseRanges.protein),
  food({ id: 'fish', name: '鳕鱼', aliases: ['鱼肉', '鱼'], category: '肉禽水产', subCategory: '水产类', defaultStorage: 'freezer', icon: assets.food.fish, babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏1-2天 / 冷冻60天', babyNote: '去刺后充分加热。', adultNote: '腥臭、发黏或肉质松散请处理。', storageTips: ['水产建议尽快冷冻。', '解冻后不要反复冷冻。'], spoilageSigns: ['腥臭', '发黏', '变色', '肉质松散'] }, baseRanges.protein),
  food({ id: 'shrimp', name: '虾', aliases: ['鲜虾', '虾仁'], category: '肉禽水产', subCategory: '水产类', defaultStorage: 'freezer', icon: assets.food.shrimp, babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏1-2天 / 冷冻60天', babyNote: '确认不过敏后少量尝试并充分加热。', adultNote: '异味、发黑或发黏请处理。', storageTips: ['水产建议尽快冷冻。', '解冻后尽快烹饪。'], spoilageSigns: ['异味', '发黑', '发黏', '出水'] }, baseRanges.protein),
  food({ id: 'tofu', name: '豆腐', aliases: ['嫩豆腐', '老豆腐'], category: '蛋奶豆制品', subCategory: '豆制品', defaultStorage: 'fridge', icon: assets.food.tofu, babyDays: '1天', adultDays: '2天', babyNote: '开封后建议当天处理。', adultNote: '酸味、发黏或胀包请处理。', storageTips: ['开封后密封冷藏。', '给宝宝食用前充分加热。'], spoilageSigns: ['酸味', '发黏', '胀包', '异味'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 2, text: '开封后密封冷藏并尽快食用。' } }),
  food({ id: 'milk', name: '牛奶', aliases: ['鲜奶'], category: '蛋奶豆制品', subCategory: '奶制品', defaultStorage: 'fridge', icon: assets.food.milk, babyDays: '1-2天', adultDays: '2-3天', babyNote: '是否适合宝宝需结合月龄和医生建议。', adultNote: '酸味、胀包或结块请处理。', storageTips: ['开封后冷藏并尽快饮用。'], spoilageSigns: ['酸味', '胀包', '结块', '异味'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 2, adultDaysMax: 3, text: '开封后冷藏并尽快饮用。' } }),
  food({ id: 'cheese', name: '奶酪', aliases: ['芝士'], category: '蛋奶豆制品', subCategory: '奶制品', defaultStorage: 'fridge', icon: assets.food.cheese, babyDays: '2-3天', adultDays: '5-7天', babyNote: '注意盐分和月龄适配。', adultNote: '霉点、酸败味或包装异常请处理。', storageTips: ['开封后密封冷藏。'], spoilageSigns: ['霉点', '酸败味', '出水', '异味'] }, baseRanges.mediumFridge),
  food({ id: 'rice', name: '米饭', aliases: ['熟米饭', '饭'], category: '主食辅食', subCategory: '熟食', defaultStorage: 'fridge', icon: assets.food.rice, babyDays: '1天', adultDays: '1-2天', babyNote: '熟食冷藏后需充分加热。', adultNote: '异味、发黏或放置过久请处理。', storageTips: ['熟米饭常温不建议久放。', '冷藏后充分加热。'], spoilageSigns: ['异味', '发黏', '变干', '霉点'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 2, text: '冷藏后充分加热。' } }),
  food({ id: 'porridge', name: '粥', aliases: ['米粥', '白粥'], category: '主食辅食', subCategory: '熟食', defaultStorage: 'fridge', icon: assets.food.porridge, babyDays: '1天', adultDays: '1-2天', babyNote: '冷藏后需充分加热。', adultNote: '异味、发黏或出水请处理。', storageTips: ['熟食不建议常温久放。'], spoilageSigns: ['异味', '发黏', '出水', '霉点'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 2, text: '冷藏后充分加热。' } }),
  food({ id: 'noodle', name: '面条', aliases: ['熟面条', '面'], category: '主食辅食', subCategory: '熟食', defaultStorage: 'fridge', icon: assets.food.noodle, babyDays: '1天', adultDays: '1-2天', babyNote: '冷藏后需充分加热并剪成合适长度。', adultNote: '异味、发黏或放置过久请处理。', storageTips: ['熟面条冷藏后尽快食用。'], spoilageSigns: ['异味', '发黏', '变干', '霉点'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 2, text: '冷藏后充分加热。' } }),
  food({ id: 'bread', name: '面包', aliases: ['吐司'], category: '主食辅食', subCategory: '烘焙类', defaultStorage: 'room', icon: assets.food.bread, babyDays: '1-2天', adultDays: '3-5天', babyNote: '注意糖盐和过敏原，结合月龄判断。', adultNote: '霉点、酸味或硬化异常请处理。', storageTips: ['阴凉密封保存。'], spoilageSigns: ['霉点', '酸味', '硬化', '异味'] }, { ...baseRanges.mediumFridge, room: { babyDaysMin: 1, babyDaysMax: 2, adultDaysMin: 3, adultDaysMax: 5, text: '阴凉密封保存。' } }),
  food({ id: 'babyPuree', name: '辅食泥', aliases: ['果泥', '菜泥', '肉泥'], category: '主食辅食', subCategory: '辅食泥', defaultStorage: 'fridge', icon: assets.food.babyPuree, babyDays: '1天', adultDays: '1天', babyNote: '开封或自制后建议当天食用。', adultNote: '异味、分层异常或胀包请处理。', storageTips: ['开封后冷藏并尽快食用。', '自制辅食泥建议分装。'], spoilageSigns: ['异味', '胀包', '分层异常', '霉点'] }, { ...baseRanges.shortFridge, fridge: { babyDaysMin: 1, babyDaysMax: 1, adultDaysMin: 1, adultDaysMax: 1, text: '开封后冷藏并尽快食用。' } })
]

const foodBase = [
  ...coreFoodBase,
  ...createExpandedFoodBase({ food, baseRanges })
]

module.exports = {
  foodBase
}
