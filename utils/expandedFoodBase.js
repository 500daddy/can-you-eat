const assets = require('./assets')

const notes = {
  vegetable: {
    baby: '建议清洗干净并充分做熟，再按宝宝月龄处理成合适大小。',
    adult: '超过宝宝建议期后，请结合外观、气味和触感判断。'
  },
  fruit: {
    baby: '给宝宝前需清洗、去皮去核或去籽，并处理成合适大小。',
    adult: '软烂、发霉、酒味或酸败味明显时请处理。'
  },
  protein: {
    baby: '给宝宝前必须充分加热，首次尝试请少量并观察不适反应。',
    adult: '异味、发黏、变色或包装异常时请处理。'
  },
  dairy: {
    baby: '是否适合宝宝需结合月龄、配料和医生建议，开封后尽快食用。',
    adult: '酸味、胀包、结块或包装异常时请处理。'
  },
  staple: {
    baby: '熟食冷藏后需充分加热，并按宝宝月龄处理质地和大小。',
    adult: '异味、发黏、发霉或放置过久时请处理。'
  }
}

const dayText = {
  short: { babyDays: '1-2天', adultDays: '2-4天' },
  medium: { babyDays: '2-4天', adultDays: '5-10天' },
  long: { babyDays: '5-7天', adultDays: '10-15天' },
  protein: { babyDays: '冷藏1天 / 冷冻30天', adultDays: '冷藏2天 / 冷冻90天' },
  dairy: { babyDays: '1-2天', adultDays: '2-3天' },
  cooked: { babyDays: '1天', adultDays: '1-2天' }
}

const spoilage = {
  vegetable: ['发黄', '出水', '发黏', '异味'],
  fruit: ['发霉', '软烂', '酒味', '异味'],
  protein: ['异味', '发黏', '变色', '出水'],
  dairy: ['酸味', '胀包', '结块', '异味'],
  staple: ['异味', '发黏', '霉点', '变干']
}

function createExpandedFoodBase({ food, baseRanges }) {
  function build(item, rangeKey, noteKey) {
    const note = notes[noteKey]
    const days = dayText[rangeKey]
    const range = rangeKey === 'short'
      ? baseRanges.shortFridge
      : rangeKey === 'medium'
        ? baseRanges.mediumFridge
        : rangeKey === 'long'
          ? baseRanges.longRoom
          : rangeKey === 'protein'
            ? baseRanges.protein
            : rangeKey === 'dairy'
              ? baseRanges.shortFridge
              : baseRanges.shortFridge

    return food({
      aliases: [],
      defaultStorage: rangeKey === 'long' ? 'room' : 'fridge',
      babyNote: note.baby,
      adultNote: note.adult,
      storageTips: item.storageTips || ['优先选择新鲜食材。', '给宝宝食用前请确认无变质迹象。'],
      spoilageSigns: item.spoilageSigns || spoilage[noteKey],
      ...days,
      ...item
    }, range)
  }

  return [
    build({ id: 'bokChoy', name: '上海青', aliases: ['青菜', '小油菜', '小白菜'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.cabbage }, 'short', 'vegetable'),
    build({ id: 'lettuce', name: '生菜', aliases: ['叶用莴苣'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'napaCabbage', name: '大白菜', aliases: ['白菜'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.cabbage }, 'medium', 'vegetable'),
    build({ id: 'cabbageHead', name: '卷心菜', aliases: ['圆白菜', '包菜'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.cabbage }, 'medium', 'vegetable'),
    build({ id: 'celery', name: '芹菜', aliases: ['西芹'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'cauliflower', name: '花菜', aliases: ['菜花'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.broccoli }, 'medium', 'vegetable'),
    build({ id: 'asparagus', name: '芦笋', aliases: [], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'amaranth', name: '苋菜', aliases: ['红苋菜'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'peaShoots', name: '豌豆苗', aliases: ['豆苗'], category: '蔬菜', subCategory: '叶花菜类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'yam', name: '山药', aliases: ['淮山'], category: '蔬菜', subCategory: '根茎薯芋类', icon: assets.food.lotusRoot }, 'medium', 'vegetable'),
    build({ id: 'taro', name: '芋头', aliases: ['芋艿'], category: '蔬菜', subCategory: '根茎薯芋类', icon: assets.food.potato, defaultStorage: 'room' }, 'long', 'vegetable'),
    build({ id: 'radish', name: '白萝卜', aliases: ['萝卜'], category: '蔬菜', subCategory: '根茎薯芋类', icon: assets.food.customFood }, 'medium', 'vegetable'),
    build({ id: 'bambooShoot', name: '竹笋', aliases: ['笋'], category: '蔬菜', subCategory: '根茎薯芋类', icon: assets.food.lotusRoot }, 'short', 'vegetable'),
    build({ id: 'zucchini', name: '西葫芦', aliases: ['角瓜'], category: '蔬菜', subCategory: '茄果瓜类', icon: assets.food.cucumber }, 'medium', 'vegetable'),
    build({ id: 'waxGourd', name: '冬瓜', aliases: [], category: '蔬菜', subCategory: '茄果瓜类', icon: assets.food.cucumber }, 'medium', 'vegetable'),
    build({ id: 'bitterMelon', name: '苦瓜', aliases: ['凉瓜'], category: '蔬菜', subCategory: '茄果瓜类', icon: assets.food.cucumber }, 'medium', 'vegetable'),
    build({ id: 'loofah', name: '丝瓜', aliases: [], category: '蔬菜', subCategory: '茄果瓜类', icon: assets.food.cucumber }, 'medium', 'vegetable'),
    build({ id: 'pea', name: '豌豆', aliases: ['青豆'], category: '蔬菜', subCategory: '鲜豆类', icon: assets.food.corn }, 'short', 'vegetable'),
    build({ id: 'greenBean', name: '四季豆', aliases: ['豆角'], category: '蔬菜', subCategory: '鲜豆类', icon: assets.food.greenPepper }, 'short', 'vegetable'),
    build({ id: 'shiitake', name: '香菇', aliases: ['冬菇'], category: '蔬菜', subCategory: '菌藻类', icon: assets.food.mushroom }, 'short', 'vegetable'),
    build({ id: 'enoki', name: '金针菇', aliases: [], category: '蔬菜', subCategory: '菌藻类', icon: assets.food.mushroom }, 'short', 'vegetable'),
    build({ id: 'oysterMushroom', name: '平菇', aliases: [], category: '蔬菜', subCategory: '菌藻类', icon: assets.food.mushroom }, 'short', 'vegetable'),
    build({ id: 'kelp', name: '海带', aliases: ['昆布'], category: '蔬菜', subCategory: '菌藻类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'laver', name: '紫菜', aliases: ['海苔'], category: '蔬菜', subCategory: '菌藻类', icon: assets.food.spinach }, 'short', 'vegetable'),
    build({ id: 'pear', name: '梨', aliases: ['雪梨'], category: '水果', subCategory: '仁果类', icon: assets.food.customFood }, 'long', 'fruit'),
    build({ id: 'peach', name: '桃子', aliases: ['水蜜桃'], category: '水果', subCategory: '核果类', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'grape', name: '葡萄', aliases: ['提子'], category: '水果', subCategory: '浆果类', icon: assets.food.blueberry, babyNote: '给宝宝前必须去皮去籽并切成安全形态，避免整颗造成呛噎风险。' }, 'short', 'fruit'),
    build({ id: 'watermelon', name: '西瓜', aliases: [], category: '水果', subCategory: '瓜果类', icon: assets.food.customFood }, 'short', 'fruit'),
    build({ id: 'cantaloupe', name: '哈密瓜', aliases: ['甜瓜'], category: '水果', subCategory: '瓜果类', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'mango', name: '芒果', aliases: [], category: '水果', subCategory: '热带水果', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'papaya', name: '木瓜', aliases: [], category: '水果', subCategory: '热带水果', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'dragonFruit', name: '火龙果', aliases: [], category: '水果', subCategory: '热带水果', icon: assets.food.kiwi }, 'medium', 'fruit'),
    build({ id: 'cherry', name: '樱桃', aliases: ['车厘子'], category: '水果', subCategory: '核果类', icon: assets.food.strawberry, babyNote: '给宝宝前必须去核并切成安全形态，避免整颗造成呛噎风险。' }, 'short', 'fruit'),
    build({ id: 'plum', name: '李子', aliases: [], category: '水果', subCategory: '核果类', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'grapefruit', name: '柚子', aliases: ['西柚'], category: '水果', subCategory: '柑橘类', icon: assets.food.orange }, 'long', 'fruit'),
    build({ id: 'pineapple', name: '菠萝', aliases: ['凤梨'], category: '水果', subCategory: '热带水果', icon: assets.food.customFood }, 'medium', 'fruit'),
    build({ id: 'pomegranate', name: '石榴', aliases: [], category: '水果', subCategory: '浆果类', icon: assets.food.strawberry, babyNote: '籽粒较小且较硬，给宝宝前需结合月龄谨慎处理，避免呛噎风险。' }, 'medium', 'fruit'),
    build({ id: 'raspberry', name: '树莓', aliases: ['覆盆子'], category: '水果', subCategory: '浆果类', icon: assets.food.strawberry }, 'short', 'fruit'),
    build({ id: 'pork', name: '猪里脊', aliases: ['猪肉', '瘦猪肉'], category: '肉禽水产', subCategory: '畜肉类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'lamb', name: '羊肉', aliases: ['羊腿肉'], category: '肉禽水产', subCategory: '畜肉类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'duck', name: '鸭肉', aliases: [], category: '肉禽水产', subCategory: '禽肉类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'turkey', name: '火鸡肉', aliases: [], category: '肉禽水产', subCategory: '禽肉类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'salmon', name: '三文鱼', aliases: ['鲑鱼'], category: '肉禽水产', subCategory: '水产类', icon: assets.food.fish, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'bass', name: '鲈鱼', aliases: [], category: '肉禽水产', subCategory: '水产类', icon: assets.food.fish, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'hairtail', name: '带鱼', aliases: [], category: '肉禽水产', subCategory: '水产类', icon: assets.food.fish, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'scallop', name: '扇贝', aliases: ['贝柱'], category: '肉禽水产', subCategory: '水产类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'clam', name: '蛤蜊', aliases: ['花甲'], category: '肉禽水产', subCategory: '水产类', icon: assets.food.customFood, defaultStorage: 'freezer' }, 'protein', 'protein'),
    build({ id: 'quailEgg', name: '鹌鹑蛋', aliases: [], category: '蛋奶豆制品', subCategory: '蛋类', icon: assets.food.egg }, 'dairy', 'protein'),
    build({ id: 'yogurt', name: '酸奶', aliases: ['原味酸奶'], category: '蛋奶豆制品', subCategory: '奶制品', icon: assets.food.milk }, 'dairy', 'dairy'),
    build({ id: 'soyMilk', name: '豆浆', aliases: [], category: '蛋奶豆制品', subCategory: '豆制品', icon: assets.food.milk, babyNote: '需充分煮沸，是否适合宝宝需结合月龄和医生建议。' }, 'dairy', 'dairy'),
    build({ id: 'driedTofu', name: '豆干', aliases: ['豆腐干'], category: '蛋奶豆制品', subCategory: '豆制品', icon: assets.food.tofu }, 'short', 'dairy'),
    build({ id: 'edamame', name: '毛豆', aliases: [], category: '蛋奶豆制品', subCategory: '豆制品', icon: assets.food.customFood, babyNote: '需充分煮熟并去壳，按月龄处理大小，避免整粒呛噎。' }, 'short', 'dairy'),
    build({ id: 'millet', name: '小米', aliases: [], category: '主食辅食', subCategory: '谷物杂粮', icon: assets.food.rice, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'oat', name: '燕麦', aliases: ['燕麦片'], category: '主食辅食', subCategory: '谷物杂粮', icon: assets.food.porridge, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'blackRice', name: '黑米', aliases: [], category: '主食辅食', subCategory: '谷物杂粮', icon: assets.food.rice, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'quinoa', name: '藜麦', aliases: [], category: '主食辅食', subCategory: '谷物杂粮', icon: assets.food.rice, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'buckwheat', name: '荞麦', aliases: [], category: '主食辅食', subCategory: '谷物杂粮', icon: assets.food.noodle, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'wheatFlour', name: '面粉', aliases: ['小麦粉'], category: '主食辅食', subCategory: '面点粉类', icon: assets.food.bread, defaultStorage: 'room' }, 'long', 'staple'),
    build({ id: 'riceNoodle', name: '米粉', aliases: ['婴儿米粉'], category: '主食辅食', subCategory: '辅食谷粉', icon: assets.food.babyPuree, defaultStorage: 'room', babyNote: '优先选择适合月龄的正规包装产品，开封后按包装说明保存。' }, 'long', 'staple'),
    build({ id: 'steamedBun', name: '馒头', aliases: [], category: '主食辅食', subCategory: '面点粉类', icon: assets.food.bread }, 'cooked', 'staple'),
    build({ id: 'dumpling', name: '饺子', aliases: ['馄饨'], category: '主食辅食', subCategory: '熟食', icon: assets.food.noodle }, 'cooked', 'staple'),
    build({ id: 'eggCustard', name: '蒸蛋羹', aliases: ['蛋羹'], category: '主食辅食', subCategory: '熟食', icon: assets.food.egg }, 'cooked', 'staple'),
    build({ id: 'meatPuree', name: '肉泥', aliases: ['自制肉泥'], category: '主食辅食', subCategory: '辅食泥', icon: assets.food.babyPuree }, 'cooked', 'staple')
  ]
}

module.exports = {
  createExpandedFoodBase
}
