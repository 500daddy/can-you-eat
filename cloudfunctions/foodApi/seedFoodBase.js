const shortFridge = {
  room: { babyDaysMax: 0, adultDaysMax: 1, text: '常温不建议久放，建议尽快冷藏。' },
  fridge: { babyDaysMax: 2, adultDaysMax: 5, text: '冷藏保存，宝宝食材建议尽早处理。' },
  freezer: { babyDaysMax: 30, adultDaysMax: 60, text: '冷冻前建议分装，解冻后尽快食用。' }
}

const mediumFridge = {
  room: { babyDaysMax: 2, adultDaysMax: 3, text: '阴凉常温可短暂保存，宝宝食材建议冷藏。' },
  fridge: { babyDaysMax: 4, adultDaysMax: 10, text: '冷藏保存更稳妥，取用后及时放回。' },
  freezer: { babyDaysMax: 45, adultDaysMax: 90, text: '冷冻保存前建议清洗、切分并密封。' }
}

const longRoom = {
  room: { babyDaysMax: 7, adultDaysMax: 15, text: '完整食材可阴凉常温保存，切开后请冷藏。' },
  fridge: { babyDaysMax: 7, adultDaysMax: 14, text: '冷藏保存可延缓变质，切面需密封。' },
  freezer: { babyDaysMax: 60, adultDaysMax: 120, text: '冷冻前建议切块分装。' }
}

const protein = {
  room: { babyDaysMax: 0, adultDaysMax: 0, text: '肉蛋奶类不建议常温放置。' },
  fridge: { babyDaysMax: 1, adultDaysMax: 2, text: '冷藏保存也应尽快充分加热后食用。' },
  freezer: { babyDaysMax: 30, adultDaysMax: 90, text: '冷冻保存需密封，避免反复解冻。' }
}

function item(data, ranges) {
  return {
    confidenceLevel: 'medium',
    sourceNote: 'MVP 参考数据，不能替代专业食品安全判断。',
    createdAt: null,
    updatedAt: null,
    ...ranges,
    ...data
  }
}

const seedFoodBase = [
  item({ id: 'broccoli', name: '西兰花', aliases: ['绿花菜', '青花菜'], category: '蔬菜', subCategory: '花菜类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_broccoli.png', babyDays: '2-3天', adultDays: '3-5天', babyNote: '建议充分清洗并做熟后食用。', adultNote: '超过宝宝建议期后，请结合外观、气味和触感判断。', storageTips: ['常温不建议久放，尽快冷藏。', '冷藏建议1-3天内优先给宝宝食用。', '冷冻前建议焯水后分装。'], spoilageSigns: ['发黄', '发黏', '有异味', '花球松散'] }, { ...mediumFridge, fridge: { babyDaysMax: 3, adultDaysMax: 5, text: '冷藏建议1-3天内优先给宝宝食用。' } }),
  item({ id: 'carrot', name: '胡萝卜', aliases: ['红萝卜'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_carrot.png', babyDays: '4-5天', adultDays: '7-10天', babyNote: '切开后建议尽快处理。', adultNote: '表面变软、发黏或有异味时请谨慎处理。', storageTips: ['冷藏保存更稳妥。', '表面变软或发黏时不建议给宝宝。'], spoilageSigns: ['变软', '发黏', '黑斑', '异味'] }, { ...mediumFridge, fridge: { babyDaysMax: 4, adultDaysMax: 10, text: '冷藏保存更稳妥。' } }),
  item({ id: 'blueberry', name: '蓝莓', aliases: ['莓果'], category: '水果', subCategory: '莓果类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_blueberry.png', babyDays: '1-2天', adultDays: '3-5天', babyNote: '给宝宝食用前需充分清洗并处理大小。', adultNote: '有霉点、出水或酸败味请处理。', storageTips: ['清洗后不建议久放。', '有破损或霉点请丢弃。'], spoilageSigns: ['发霉', '出水', '软烂', '酸败味'] }, shortFridge),
  item({ id: 'pumpkin', name: '南瓜', aliases: ['贝贝南瓜', '板栗南瓜', '老南瓜'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: '/assets/sprites/food/food_pumpkin.png', babyDays: '5-7天', adultDays: '10-15天', babyNote: '切开后请冷藏并尽快做熟。', adultNote: '表面发霉或有异味请处理。', storageTips: ['完整南瓜可阴凉常温保存。', '切开后需要冷藏并尽快食用。'], spoilageSigns: ['发霉', '出水', '软烂', '异味'] }, longRoom),
  item({ id: 'apple', name: '苹果', aliases: ['红苹果', '富士'], category: '水果', subCategory: '仁果类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_apple.png', babyDays: '5-7天', adultDays: '10-14天', babyNote: '给宝宝前请去皮去核并处理成合适形态。', adultNote: '切开后褐变、酒味或霉点请谨慎处理。', storageTips: ['冷藏可延长新鲜感。', '切开后建议尽快食用。'], spoilageSigns: ['褐变', '软烂', '酒味', '霉点'] }, longRoom),
  item({ id: 'egg', name: '鸡蛋', aliases: ['蛋'], category: '蛋奶豆制品', subCategory: '蛋类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_egg.png', babyDays: '7-14天', adultDays: '21-30天', babyNote: '给宝宝食用必须充分加热。', adultNote: '蛋壳破损或有异味请谨慎处理。', storageTips: ['建议冷藏保存。', '蛋壳破损请谨慎处理。'], spoilageSigns: ['破壳', '异味', '散黄'] }, { room: { babyDaysMax: 0, adultDaysMax: 1, text: '不建议常温久放。' }, fridge: { babyDaysMax: 14, adultDaysMax: 30, text: '冷藏保存，食用前充分加热。' }, freezer: { babyDaysMax: 0, adultDaysMax: 0, text: '带壳鸡蛋不建议直接冷冻。' } }),
  item({ id: 'avocado', name: '牛油果', aliases: ['鳄梨'], category: '水果', subCategory: '热带水果', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_avocado.png', babyDays: '1-2天', adultDays: '2-3天', babyNote: '成熟后尽快食用。', adultNote: '明显褐变或异味请处理。', storageTips: ['成熟后尽快食用。', '切开后需要密封冷藏。'], spoilageSigns: ['褐变', '软烂', '异味'] }, { ...shortFridge, fridge: { babyDaysMax: 2, adultDaysMax: 3, text: '成熟后密封冷藏。' } }),
  item({ id: 'banana', name: '香蕉', aliases: ['蕉'], category: '水果', subCategory: '热带水果', defaultStorage: 'room', icon: '/assets/sprites/food/food_banana.png', babyDays: '1-2天', adultDays: '2-4天', babyNote: '过熟变软时不建议给宝宝作为新鲜辅食。', adultNote: '有酒味或腐烂点请处理。', storageTips: ['常温阴凉保存。', '有酒味或腐烂点请处理。'], spoilageSigns: ['酒味', '腐烂', '出水'] }, { ...shortFridge, room: { babyDaysMax: 2, adultDaysMax: 4, text: '常温阴凉保存。' } }),
  item({ id: 'tomato', name: '番茄', aliases: ['西红柿', '小番茄', '圣女果'], category: '蔬菜', subCategory: '茄果类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_tomato.png', babyDays: '2-3天', adultDays: '4-6天', babyNote: '建议去皮做熟后少量尝试。', adultNote: '软烂、裂口或有异味请谨慎。', storageTips: ['成熟番茄可冷藏短期保存。', '切开后请密封冷藏并尽快食用。'], spoilageSigns: ['软烂', '裂口', '霉点', '异味'] }, { ...mediumFridge, fridge: { babyDaysMax: 3, adultDaysMax: 6, text: '成熟后冷藏短期保存。' } }),
  item({ id: 'potato', name: '土豆', aliases: ['马铃薯'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: '/assets/sprites/food/food_potato.png', babyDays: '5-7天', adultDays: '10-15天', babyNote: '发芽、发绿或味苦时不要给宝宝食用。', adultNote: '发芽发绿请谨慎处理。', storageTips: ['阴凉避光保存。'], spoilageSigns: ['发芽', '发绿', '软烂', '异味'] }, longRoom),
  item({ id: 'sweetPotato', name: '红薯', aliases: ['地瓜', '甘薯'], category: '蔬菜', subCategory: '根茎类', defaultStorage: 'room', icon: '/assets/sprites/food/food_sweet_potato.png', babyDays: '5-7天', adultDays: '10-15天', babyNote: '建议蒸熟后观察宝宝接受度。', adultNote: '发霉、黑斑或异味请处理。', storageTips: ['阴凉通风保存。'], spoilageSigns: ['发霉', '黑斑', '软烂', '异味'] }, longRoom),
  item({ id: 'spinach', name: '菠菜', aliases: ['波菜'], category: '蔬菜', subCategory: '叶菜类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_spinach.png', babyDays: '1-2天', adultDays: '2-4天', babyNote: '叶菜类建议尽快做熟。', adultNote: '发黄、出水或发黏请处理。', storageTips: ['叶菜类请冷藏并尽快食用。'], spoilageSigns: ['发黄', '出水', '发黏', '异味'] }, { ...shortFridge, fridge: { babyDaysMax: 2, adultDaysMax: 4, text: '叶菜类请冷藏并尽快食用。' } }),
  item({ id: 'cabbage', name: '小白菜', aliases: ['青菜', '上海青', '油菜'], category: '蔬菜', subCategory: '叶菜类', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_cabbage.png', babyDays: '1-2天', adultDays: '2-4天', babyNote: '建议做熟后给宝宝。', adultNote: '叶片发黏或异味请处理。', storageTips: ['冷藏保存，尽快食用。'], spoilageSigns: ['发黄', '出水', '发黏', '异味'] }, { ...shortFridge, fridge: { babyDaysMax: 2, adultDaysMax: 4, text: '冷藏保存，尽快食用。' } }),
  item({ id: 'chicken', name: '鸡胸肉', aliases: ['鸡肉'], category: '肉类', subCategory: '禽类', defaultStorage: 'freezer', icon: '/assets/sprites/food/food_chicken.png', babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏2天 / 冷冻90天', babyNote: '必须充分加热，冷藏不宜久放。', adultNote: '异味、发黏或变色请处理。', storageTips: ['冷藏仅短期保存。', '建议分装冷冻。'], spoilageSigns: ['异味', '发黏', '变色', '出水'] }, protein),
  item({ id: 'beef', name: '牛肉', aliases: ['牛里脊'], category: '肉类', subCategory: '畜类', defaultStorage: 'freezer', icon: '/assets/sprites/food/food_beef.png', babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏2天 / 冷冻90天', babyNote: '必须充分加热，观察宝宝咀嚼能力。', adultNote: '异味、发黏或明显变色请处理。', storageTips: ['冷藏仅短期保存。', '建议分装冷冻。'], spoilageSigns: ['异味', '发黏', '变色', '出水'] }, protein),
  item({ id: 'fish', name: '鳕鱼', aliases: ['鱼肉', '鱼'], category: '肉类', subCategory: '水产类', defaultStorage: 'freezer', icon: '/assets/sprites/food/food_fish.png', babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏1-2天 / 冷冻60天', babyNote: '去刺后充分加热。', adultNote: '腥臭、发黏或肉质松散请处理。', storageTips: ['水产建议尽快冷冻。'], spoilageSigns: ['腥臭', '发黏', '变色', '肉质松散'] }, protein),
  item({ id: 'shrimp', name: '虾', aliases: ['鲜虾', '虾仁'], category: '肉类', subCategory: '水产类', defaultStorage: 'freezer', icon: '/assets/sprites/food/food_shrimp.png', babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏1-2天 / 冷冻60天', babyNote: '确认不过敏后少量尝试并充分加热。', adultNote: '异味、发黑或发黏请处理。', storageTips: ['水产建议尽快冷冻。'], spoilageSigns: ['异味', '发黑', '发黏', '出水'] }, protein),
  item({ id: 'tofu', name: '豆腐', aliases: ['嫩豆腐', '老豆腐'], category: '蛋奶豆制品', subCategory: '豆制品', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_tofu.png', babyDays: '1天', adultDays: '2天', babyNote: '开封后建议当天处理。', adultNote: '酸味、发黏或胀包请处理。', storageTips: ['开封后密封冷藏。'], spoilageSigns: ['酸味', '发黏', '胀包', '异味'] }, { ...shortFridge, fridge: { babyDaysMax: 1, adultDaysMax: 2, text: '开封后密封冷藏并尽快食用。' } }),
  item({ id: 'rice', name: '米饭', aliases: ['熟米饭', '饭'], category: '主食辅食', subCategory: '熟食', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_rice.png', babyDays: '1天', adultDays: '1-2天', babyNote: '熟食冷藏后需充分加热。', adultNote: '异味、发黏或放置过久请处理。', storageTips: ['熟米饭常温不建议久放。'], spoilageSigns: ['异味', '发黏', '变干', '霉点'] }, { ...shortFridge, fridge: { babyDaysMax: 1, adultDaysMax: 2, text: '冷藏后充分加热。' } }),
  item({ id: 'babyPuree', name: '辅食泥', aliases: ['果泥', '菜泥', '肉泥'], category: '主食辅食', subCategory: '辅食泥', defaultStorage: 'fridge', icon: '/assets/sprites/food/food_baby_puree.png', babyDays: '1天', adultDays: '1天', babyNote: '开封或自制后建议当天食用。', adultNote: '异味、分层异常或胀包请处理。', storageTips: ['开封后冷藏并尽快食用。'], spoilageSigns: ['异味', '胀包', '分层异常', '霉点'] }, { ...shortFridge, fridge: { babyDaysMax: 1, adultDaysMax: 1, text: '开封后冷藏并尽快食用。' } })
]

module.exports = {
  seedFoodBase
}
