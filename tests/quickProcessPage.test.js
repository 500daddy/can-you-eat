const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadQuickProcessPage(foodService) {
  const servicePath = require.resolve('../utils/foodService')
  const pagePath = require.resolve('../pages/quick-process/index')
  delete require.cache[servicePath]
  delete require.cache[pagePath]
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      getFoodService: () => foodService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  const exports = require('../pages/quick-process/index')
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[servicePath]
  return { definition, exports }
}

function createPageInstance(definition) {
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    ...definition
  }
}

test('quick process page builds recipe suggestions from today and soon reminders only', async () => {
  const { definition } = loadQuickProcessPage({
    getAssets: () => ({
      food: { babyPuree: '/assets/sprites/food/food_baby_puree.png' },
      mascot: { emptyFood: '/assets/sprites/mascot/empty_no_food.png' }
    }),
    getReminders: async () => ({
      today: [
        {
          id: 'spinach',
          name: '菠菜',
          category: '蔬菜',
          storageText: '冷藏',
          babyLeftText: '今天建议处理',
          icon: '/assets/sprites/food/food_spinach.png'
        }
      ],
      soon: [
        {
          id: 'fish',
          name: '鳕鱼',
          category: '肉禽水产',
          storageText: '冷冻',
          babyLeftText: '可留给大人吃',
          icon: '/assets/sprites/food/food_fish.png'
        }
      ],
      overdue: [
        {
          id: 'milk',
          name: '牛奶',
          category: '蛋奶豆制品',
          babyLeftText: '已超过建议期'
        }
      ]
    })
  })
  const page = createPageInstance(definition)

  await page.refresh()

  assert.deepEqual(page.data.items.map((item) => item.name), ['菠菜', '鳕鱼'])
  assert.equal(page.data.safetyNotes.length, 1)
  assert.match(page.data.safetyNotes[0], /牛奶/)
  assert.match(page.data.items[0].suggestion.title, /焯水|蒸熟/)
  assert.match(page.data.items[1].suggestion.title, /充分加热/)
})

test('quick process advice is conservative for unknown custom foods', () => {
  const { exports } = loadQuickProcessPage({
    getAssets: () => ({ food: {}, mascot: {} }),
    getReminders: async () => ({ today: [], soon: [], overdue: [] })
  })
  const advice = exports.buildProcessAdvice({
    name: '自定义食材',
    category: '',
    isCustom: true
  })

  assert.match(advice.title, /先确认状态/)
  assert.ok(advice.steps.some((step) => /不替代食品安全判断/.test(step)))
  assert.ok(advice.steps.some((step) => /不建议给宝宝/.test(step)))
})

test('quick process page renders safety disclaimer and empty state copy', () => {
  const markup = readText('pages/quick-process/index.wxml')
  const styles = readText('pages/quick-process/index.wxss')
  const config = JSON.parse(readText('pages/quick-process/index.json'))

  assert.equal(config.navigationBarTitleText, '快速处理')
  assert.match(markup, /快速处理临期食材/)
  assert.match(markup, /assets\.food\.babyPuree/)
  assert.doesNotMatch(markup, /assets\.actions\.cookware/)
  assert.doesNotMatch(markup, /assets\.ui\.heat/)
  assert.doesNotMatch(markup, /assets\.actions\.eaten/)
  assert.match(markup, /不替代食品安全判断/)
  assert.match(markup, /不建议把已过期或异常食材推荐给宝宝/)
  assert.match(markup, /暂时没有需要快速处理的食材/)
  assert.match(styles, /\.process-card/)
  assert.match(styles, /\.safety-box/)
})
