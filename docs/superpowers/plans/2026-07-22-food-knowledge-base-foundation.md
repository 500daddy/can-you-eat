# 食材知识库底座与发布快照实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 建立可校验、可审计、可复现的食材知识库数据模型和发布快照工具，并把现有食材库导出为只读迁移基线，但暂不切换小程序搜索和保存提醒。

**架构：** 先用 Node.js 纯函数实现 Schema 校验、确定性快照编译和旧数据迁移审计，再用两个命令行入口生成候选发布文件。所有旧保存期限只进入 `legacy_unverified` 迁移候选，不进入正式发布快照；CloudBase 运行接入留给下一份计划。

**技术栈：** 微信小程序现有 CommonJS、Node.js 24、`node:test`、`node:crypto`、JSON、CloudBase 文档数据库设计

---

## 范围拆分

已确认规格跨越多个可独立交付的子系统，按以下计划顺序实施：

1. **本计划：知识库底座与发布快照**——Schema、校验器、编译器、迁移基线、命令行和数据库文档。
2. **运行快照与搜索计划**——CloudBase manifest/snapshot 读取、本地双版本缓存、搜索排序、歧义提示和零结果反馈。
3. **状态化保存规则计划**——状态与起算时间表单、规则匹配、用户记录规则快照和重大修正规则。
4. **内容迁移与扩充计划**——审核现有约 100 种食材，再根据真实零结果分批扩展到 300～500 种。
5. **可选 RAG 计划**——前三项稳定且自然语言查询样本充足后再评估，不进入当前交付。

本计划完成后，用户可运行确定性的知识库校验与构建命令，也可查看现有数据的迁移冲突报告；小程序仍继续使用当前 `foodBase`，因此该阶段可单独上线且不会改变现有用户体验。

## 文件结构

### 新建

- `scripts/lib/foodKnowledgeSchema.js`：受控枚举、字段校验、引用校验、证据与期限一致性、冲突检查。
- `scripts/lib/foodKnowledgeCompiler.js`：从审核数据生成确定性 manifest 和运行快照。
- `scripts/lib/legacyFoodKnowledgeExport.js`：将当前 `foodBase` 转换为不可发布的迁移基线并生成冲突报告。
- `scripts/build-food-knowledge.js`：读取审核 JSON，写出候选 manifest 和 snapshot。
- `scripts/export-legacy-food-knowledge.js`：导出现有食材库迁移基线。
- `tests/fixtures/foodKnowledgeFixture.js`：全部知识库测试共享的最小、已审核固定样本。
- `tests/foodKnowledgeSchema.test.js`：Schema、证据和冲突测试。
- `tests/foodKnowledgeCompiler.test.js`：确定性构建、过滤与 checksum 测试。
- `tests/legacyFoodKnowledgeExport.test.js`：现有数据导出和错误合并报告测试。
- `tests/foodKnowledgeCli.test.js`：两个命令行入口的端到端测试。
- `_knowledge_base/migrations/legacy-v1/foods.json`：现有食材身份迁移基线。
- `_knowledge_base/migrations/legacy-v1/search-terms.json`：现有名称与别名迁移基线。
- `_knowledge_base/migrations/legacy-v1/storage-candidates.json`：不可发布的旧保存范围候选。
- `_knowledge_base/migrations/legacy-v1/report.json`：数量、冲突和待审核清单。

### 修改

- `tests/foodDataSources.test.js`：锁定新增集合、权限和发布边界文档。
- `docs/cloud-setup.md`：记录知识库集合、权限和阶段 A 操作方式。
- `docs/food-data-sources.md`：补充 `direct/derived/insufficient` 证据等级和成人/宝宝证据隔离。

### 明确不修改

- `utils/foodBase.js`、`utils/expandedFoodBase.js`：本计划只读取，不重写。
- `utils/foodRepository.js`、`utils/foodService.js`：本计划不切换运行时。
- `cloudfunctions/foodApi/**`：本计划不部署新读取接口。
- `user_food_records`：本计划不迁移用户数据。
- 页面、家庭共享、提醒订阅和图片识别代码：均不在本计划范围内。

## 执行约束

- 工作目录必须是隔离 worktree：`/Users/a500/Documents/宝宝食材小管家/.worktrees/food-knowledge-base-plan`。
- 根目录没有 `package.json`，测试统一使用 `node --test tests/*.test.js` 或精确测试文件。
- 每个任务提交前运行 `git diff --cached --name-only`，确保只暂存任务声明的文件。
- 不把 `legacy_unverified` 数据标为 `approved`，不从旧成人期限推导宝宝期限。
- 所有生成文件必须由命令重建且通过 checksum/重复构建测试。

### 任务 1：定义知识库 Schema 和共享测试样本

**文件：**

- 创建：`scripts/lib/foodKnowledgeSchema.js`
- 创建：`tests/fixtures/foodKnowledgeFixture.js`
- 创建：`tests/foodKnowledgeSchema.test.js`

- [ ] **步骤 1：创建最小审核样本**

创建 `tests/fixtures/foodKnowledgeFixture.js`：

```js
function createFoodKnowledgeFixture() {
  return {
    foods: [{
      foodId: 'tomato',
      canonicalName: '番茄',
      category: '蔬菜',
      subCategory: '茄果类',
      defaultState: 'raw_whole',
      allergenTags: [],
      riskTags: [],
      iconKey: 'tomato',
      status: 'active',
      revision: 1,
      reviewStatus: 'approved'
    }],
    searchTerms: [{
      termId: 'tomato-canonical',
      foodId: 'tomato',
      term: '番茄',
      normalizedTerm: '番茄',
      type: 'canonical',
      region: '全国',
      weight: 100,
      reviewStatus: 'approved'
    }, {
      termId: 'tomato-alias-xihongshi',
      foodId: 'tomato',
      term: '西红柿',
      normalizedTerm: '西红柿',
      type: 'alias',
      region: '全国',
      weight: 90,
      reviewStatus: 'approved'
    }],
    evidenceSources: [{
      sourceId: 'source-general-storage',
      organization: '测试用政府机构',
      title: '测试用通用保存指引',
      url: 'https://example.test/general-storage',
      sourceType: 'government_guideline',
      locale: 'zh-CN',
      applicableScope: '测试用番茄切开冷藏保存',
      status: 'active'
    }],
    storageRules: [{
      ruleId: 'tomato-cut-fridge-v1',
      foodId: 'tomato',
      foodState: 'cut',
      storageMethod: 'fridge',
      packageState: 'not_applicable',
      referenceDateType: 'cut_at',
      babyDaysMin: null,
      babyDaysMax: null,
      adultDaysMin: 1,
      adultDaysMax: 2,
      priority: 100,
      advice: '切开后密封冷藏，并尽快食用。',
      discardSigns: ['霉点', '异味', '发黏'],
      evidenceLevel: 'direct',
      evidenceBindings: [{
        sourceId: 'source-general-storage',
        audience: 'general',
        locator: '测试表格第 1 行'
      }],
      reviewStatus: 'approved',
      ruleVersion: 1
    }]
  }
}

module.exports = { createFoodKnowledgeFixture }
```

- [ ] **步骤 2：编写 Schema 失败测试**

创建 `tests/foodKnowledgeSchema.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')

test('accepts a complete approved food knowledge input', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const result = validateFoodKnowledge(createFoodKnowledgeFixture())

  assert.deepEqual(result, { ok: true, errors: [] })
})

test('rejects missing references duplicate ids and unsupported enums', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const input = createFoodKnowledgeFixture()
  input.foods.push({ ...input.foods[0] })
  input.foods[0].category = '蛋白'
  input.searchTerms[0].foodId = 'missing-food'
  input.storageRules[0].storageMethod = 'cupboard'

  const result = validateFoodKnowledge(input)

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('foods: duplicate foodId tomato'))
  assert.ok(result.errors.includes('foods tomato: invalid category 蛋白'))
  assert.ok(result.errors.includes('food_search_terms tomato-canonical: unknown foodId missing-food'))
  assert.ok(result.errors.includes('storage_rules tomato-cut-fridge-v1: invalid storageMethod cupboard'))
})

test('never derives a baby deadline from general or adult evidence', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const input = createFoodKnowledgeFixture()
  input.storageRules[0].babyDaysMin = 1
  input.storageRules[0].babyDaysMax = 1

  const result = validateFoodKnowledge(input)

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(
    'storage_rules tomato-cut-fridge-v1: baby deadline requires direct baby evidence'
  ))
})

test('derived and insufficient rules cannot contain deadlines', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const input = createFoodKnowledgeFixture()
  input.storageRules[0].evidenceLevel = 'derived'

  const result = validateFoodKnowledge(input)

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(
    'storage_rules tomato-cut-fridge-v1: derived rules cannot contain deadline fields'
  ))
})

test('deadline ranges must be complete non-negative and ordered', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const input = createFoodKnowledgeFixture()
  input.storageRules[0].adultDaysMin = 3
  input.storageRules[0].adultDaysMax = 2

  const result = validateFoodKnowledge(input)

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(
    'storage_rules tomato-cut-fridge-v1: invalid adult deadline range 3-2'
  ))
})

test('rejects conflicting approved rules with the same specificity', () => {
  const { validateFoodKnowledge } = require('../scripts/lib/foodKnowledgeSchema')
  const input = createFoodKnowledgeFixture()
  input.storageRules.push({
    ...input.storageRules[0],
    ruleId: 'tomato-cut-fridge-conflict-v1',
    adultDaysMax: 3
  })

  const result = validateFoodKnowledge(input)

  assert.equal(result.ok, false)
  assert.ok(result.errors.some((message) => message.includes(
    'conflicting rules tomato-cut-fridge-conflict-v1,tomato-cut-fridge-v1'
  )))
})
```

- [ ] **步骤 3：运行测试并确认正确失败**

运行：

```bash
node --test tests/foodKnowledgeSchema.test.js
```

预期：FAIL，错误包含 `Cannot find module '../scripts/lib/foodKnowledgeSchema'`。

- [ ] **步骤 4：实现 Schema 校验器**

创建 `scripts/lib/foodKnowledgeSchema.js`，实现并导出：

```js
const FOOD_STATES = new Set([
  'raw_whole', 'washed', 'cut', 'opened', 'cooked',
  'homemade_baby_food', 'thawed'
])
const CATEGORIES = new Set(['蔬菜', '水果', '肉禽水产', '蛋奶豆制品', '主食辅食'])
const FOOD_STATUSES = new Set(['active', 'inactive'])
const REVIEW_STATUSES = new Set(['draft', 'sourced', 'validated', 'approved'])
const STORAGE_METHODS = new Set(['room', 'fridge', 'freezer'])
const REFERENCE_DATE_TYPES = new Set([
  'purchased_at', 'washed_at', 'cut_at', 'opened_at',
  'cooked_at', 'made_at', 'thawed_at'
])
const TERM_TYPES = new Set(['canonical', 'alias', 'regional', 'pinyin', 'typo'])
const EVIDENCE_LEVELS = new Set(['direct', 'derived', 'insufficient'])
const AUDIENCES = new Set(['general', 'adult', 'baby'])

function list(value) {
  return Array.isArray(value) ? value : []
}

function present(value) {
  return value !== undefined && value !== null
}

function hasAnyDeadline(rule) {
  return ['babyDaysMin', 'babyDaysMax', 'adultDaysMin', 'adultDaysMax']
    .some((key) => present(rule[key]))
}

function validateDeadlineRange(rule, audience, errors) {
  const min = rule[`${audience}DaysMin`]
  const max = rule[`${audience}DaysMax`]
  const hasMin = present(min)
  const hasMax = present(max)
  if (!hasMin && !hasMax) return
  if (!hasMin || !hasMax || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    errors.push(`storage_rules ${rule.ruleId}: invalid ${audience} deadline range ${min}-${max}`)
  }
}

function duplicateIds(items, key, label) {
  const seen = new Set()
  const duplicates = new Set()
  for (const item of items) {
    const id = String(item && item[key] || '').trim()
    if (!id) continue
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates].sort().map((id) => `${label}: duplicate ${key} ${id}`)
}

function ruleConditionKey(rule) {
  return [
    rule.foodId,
    rule.foodState,
    rule.storageMethod,
    rule.packageState || '',
    present(rule.temperatureMinC) ? rule.temperatureMinC : '',
    present(rule.temperatureMaxC) ? rule.temperatureMaxC : ''
  ].join('|')
}

function ruleOutcomeKey(rule) {
  return JSON.stringify({
    babyDaysMin: rule.babyDaysMin,
    babyDaysMax: rule.babyDaysMax,
    adultDaysMin: rule.adultDaysMin,
    adultDaysMax: rule.adultDaysMax,
    advice: rule.advice
  })
}

function validateFoodKnowledge(input = {}) {
  const foods = list(input.foods)
  const searchTerms = list(input.searchTerms)
  const storageRules = list(input.storageRules)
  const evidenceSources = list(input.evidenceSources)
  const errors = [
    ...duplicateIds(foods, 'foodId', 'foods'),
    ...duplicateIds(searchTerms, 'termId', 'food_search_terms'),
    ...duplicateIds(storageRules, 'ruleId', 'storage_rules'),
    ...duplicateIds(evidenceSources, 'sourceId', 'evidence_sources')
  ]
  const foodIds = new Set(foods.map((item) => item.foodId))
  const sourceIds = new Set(evidenceSources
    .filter((item) => item.status === 'active')
    .map((item) => item.sourceId))

  for (const food of foods) {
    if (!food.foodId || !food.canonicalName || !food.category || !food.subCategory) {
      errors.push(`foods ${food.foodId || '<missing>'}: missing identity fields`)
    }
    if (!FOOD_STATES.has(food.defaultState)) {
      errors.push(`foods ${food.foodId || '<missing>'}: invalid defaultState ${food.defaultState}`)
    }
    if (!CATEGORIES.has(food.category)) {
      errors.push(`foods ${food.foodId || '<missing>'}: invalid category ${food.category}`)
    }
    if (!FOOD_STATUSES.has(food.status)) {
      errors.push(`foods ${food.foodId || '<missing>'}: invalid status ${food.status}`)
    }
    if (!REVIEW_STATUSES.has(food.reviewStatus)) {
      errors.push(`foods ${food.foodId || '<missing>'}: invalid reviewStatus ${food.reviewStatus}`)
    }
  }

  for (const term of searchTerms) {
    if (!foodIds.has(term.foodId)) {
      errors.push(`food_search_terms ${term.termId}: unknown foodId ${term.foodId}`)
    }
    if (!TERM_TYPES.has(term.type)) {
      errors.push(`food_search_terms ${term.termId}: invalid type ${term.type}`)
    }
    if (!term.term || !term.normalizedTerm) {
      errors.push(`food_search_terms ${term.termId}: missing term text`)
    }
    if (!REVIEW_STATUSES.has(term.reviewStatus)) {
      errors.push(`food_search_terms ${term.termId}: invalid reviewStatus ${term.reviewStatus}`)
    }
  }

  for (const rule of storageRules) {
    const prefix = `storage_rules ${rule.ruleId}`
    if (!foodIds.has(rule.foodId)) errors.push(`${prefix}: unknown foodId ${rule.foodId}`)
    if (!FOOD_STATES.has(rule.foodState)) errors.push(`${prefix}: invalid foodState ${rule.foodState}`)
    if (!STORAGE_METHODS.has(rule.storageMethod)) {
      errors.push(`${prefix}: invalid storageMethod ${rule.storageMethod}`)
    }
    if (!REFERENCE_DATE_TYPES.has(rule.referenceDateType)) {
      errors.push(`${prefix}: invalid referenceDateType ${rule.referenceDateType}`)
    }
    if (!EVIDENCE_LEVELS.has(rule.evidenceLevel)) {
      errors.push(`${prefix}: invalid evidenceLevel ${rule.evidenceLevel}`)
    }
    if (!REVIEW_STATUSES.has(rule.reviewStatus)) {
      errors.push(`${prefix}: invalid reviewStatus ${rule.reviewStatus}`)
    }
    validateDeadlineRange(rule, 'baby', errors)
    validateDeadlineRange(rule, 'adult', errors)
    const bindings = list(rule.evidenceBindings)
    for (const binding of bindings) {
      if (!sourceIds.has(binding.sourceId)) {
        errors.push(`${prefix}: unknown sourceId ${binding.sourceId}`)
      }
      if (!AUDIENCES.has(binding.audience)) {
        errors.push(`${prefix}: invalid evidence audience ${binding.audience}`)
      }
    }
    const hasBabyDeadline = present(rule.babyDaysMin) || present(rule.babyDaysMax)
    const hasAdultDeadline = present(rule.adultDaysMin) || present(rule.adultDaysMax)
    if (rule.evidenceLevel !== 'direct' && hasAnyDeadline(rule)) {
      errors.push(`${prefix}: ${rule.evidenceLevel} rules cannot contain deadline fields`)
    }
    if (hasBabyDeadline && !bindings.some((item) => item.audience === 'baby')) {
      errors.push(`${prefix}: baby deadline requires direct baby evidence`)
    }
    if (hasAdultDeadline && !bindings.some((item) => ['general', 'adult'].includes(item.audience))) {
      errors.push(`${prefix}: adult deadline requires direct general or adult evidence`)
    }
  }

  const conflictGroups = new Map()
  for (const rule of storageRules.filter((item) => item.reviewStatus === 'approved')) {
    const key = ruleConditionKey(rule)
    if (!conflictGroups.has(key)) conflictGroups.set(key, [])
    conflictGroups.get(key).push(rule)
  }
  for (const rules of conflictGroups.values()) {
    if (rules.length < 2) continue
    if (new Set(rules.map(ruleOutcomeKey)).size > 1) {
      const ids = rules.map((item) => item.ruleId).sort().join(',')
      errors.push(`storage_rules: conflicting rules ${ids}`)
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() }
}

module.exports = {
  AUDIENCES,
  CATEGORIES,
  EVIDENCE_LEVELS,
  FOOD_STATUSES,
  FOOD_STATES,
  REFERENCE_DATE_TYPES,
  REVIEW_STATUSES,
  STORAGE_METHODS,
  TERM_TYPES,
  validateFoodKnowledge
}
```

- [ ] **步骤 5：运行 Schema 测试验证通过**

运行：

```bash
node --test tests/foodKnowledgeSchema.test.js
```

预期：6 个测试 PASS，0 个 FAIL。

- [ ] **步骤 6：提交 Schema 和测试**

```bash
git add scripts/lib/foodKnowledgeSchema.js tests/fixtures/foodKnowledgeFixture.js tests/foodKnowledgeSchema.test.js
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(食材库): 添加知识数据校验器"
```

预期暂存文件只有上述 3 个文件。

### 任务 2：生成确定性 manifest 和运行快照

**文件：**

- 创建：`scripts/lib/foodKnowledgeCompiler.js`
- 创建：`tests/foodKnowledgeCompiler.test.js`
- 使用：`scripts/lib/foodKnowledgeSchema.js`
- 使用：`tests/fixtures/foodKnowledgeFixture.js`

- [ ] **步骤 1：编写编译器失败测试**

创建 `tests/foodKnowledgeCompiler.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')

test('builds one deterministic published search document', () => {
  const {
    buildFoodKnowledgeRelease,
    checksum
  } = require('../scripts/lib/foodKnowledgeCompiler')
  const options = {
    releaseId: 'food-kb-test.1',
    previousReleaseId: 'food-kb-test.0',
    generatedAt: '2026-07-22T00:00:00.000Z'
  }

  const first = buildFoodKnowledgeRelease(createFoodKnowledgeFixture(), options)
  const second = buildFoodKnowledgeRelease(createFoodKnowledgeFixture(), options)

  assert.deepEqual(first, second)
  assert.equal(first.manifest.releaseId, 'food-kb-test.1')
  assert.equal(first.manifest.foodCount, 1)
  assert.equal(first.snapshot.foods[0].foodId, 'tomato')
  assert.deepEqual(first.snapshot.foods[0].searchTerms, ['番茄', '西红柿'])
  assert.deepEqual(first.snapshot.foods[0].activeRuleIds, ['tomato-cut-fridge-v1'])
  assert.match(first.manifest.snapshotChecksum, /^sha256:[a-f0-9]{64}$/)
  assert.equal(first.manifest.snapshotChecksum, checksum(first.snapshot))
})

test('excludes draft and inactive content from the runtime snapshot', () => {
  const { buildFoodKnowledgeRelease } = require('../scripts/lib/foodKnowledgeCompiler')
  const input = createFoodKnowledgeFixture()
  input.foods.push({
    ...input.foods[0],
    foodId: 'draft-food',
    canonicalName: '草稿食材',
    reviewStatus: 'draft'
  })
  input.searchTerms.push({
    ...input.searchTerms[0],
    termId: 'draft-food-canonical',
    foodId: 'draft-food',
    term: '草稿食材',
    normalizedTerm: '草稿食材',
    reviewStatus: 'draft'
  })

  const result = buildFoodKnowledgeRelease(input, {
    releaseId: 'food-kb-test.1',
    previousReleaseId: null,
    generatedAt: '2026-07-22T00:00:00.000Z'
  })

  assert.deepEqual(result.snapshot.foods.map((item) => item.foodId), ['tomato'])
})

test('fails the whole build when validation fails', () => {
  const { buildFoodKnowledgeRelease } = require('../scripts/lib/foodKnowledgeCompiler')
  const input = createFoodKnowledgeFixture()
  input.storageRules[0].babyDaysMax = 1

  assert.throws(() => buildFoodKnowledgeRelease(input, {
    releaseId: 'food-kb-test.1',
    previousReleaseId: null,
    generatedAt: '2026-07-22T00:00:00.000Z'
  }), /baby deadline requires direct baby evidence/)
})

test('refuses to produce an empty candidate release', () => {
  const { buildFoodKnowledgeRelease } = require('../scripts/lib/foodKnowledgeCompiler')
  const input = createFoodKnowledgeFixture()
  input.foods[0].reviewStatus = 'draft'

  assert.throws(() => buildFoodKnowledgeRelease(input, {
    releaseId: 'food-kb-test.1',
    previousReleaseId: null,
    generatedAt: '2026-07-22T00:00:00.000Z'
  }), /at least one approved active food is required/)
})
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
node --test tests/foodKnowledgeCompiler.test.js
```

预期：FAIL，错误包含 `Cannot find module '../scripts/lib/foodKnowledgeCompiler'`。

- [ ] **步骤 3：实现确定性编译器**

创建 `scripts/lib/foodKnowledgeCompiler.js`：

```js
const crypto = require('node:crypto')
const { validateFoodKnowledge } = require('./foodKnowledgeSchema')

function compareText(left, right) {
  const leftText = String(left)
  const rightText = String(right)
  if (leftText === rightText) return 0
  return leftText < rightText ? -1 : 1
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`
}

function buildFoodKnowledgeRelease(input, options = {}) {
  const validation = validateFoodKnowledge(input)
  if (!validation.ok) {
    throw new Error(`food knowledge validation failed:\n${validation.errors.join('\n')}`)
  }
  if (!options.releaseId || !options.generatedAt) {
    throw new Error('releaseId and generatedAt are required')
  }

  const approvedFoods = input.foods
    .filter((item) => item.reviewStatus === 'approved' && item.status === 'active')
    .sort((left, right) => compareText(left.foodId, right.foodId))
  if (approvedFoods.length === 0) {
    throw new Error('at least one approved active food is required')
  }
  const approvedFoodIds = new Set(approvedFoods.map((item) => item.foodId))
  const approvedTerms = input.searchTerms
    .filter((item) => item.reviewStatus === 'approved' && approvedFoodIds.has(item.foodId))
    .sort((left, right) => right.weight - left.weight || compareText(left.termId, right.termId))
  const approvedRules = input.storageRules
    .filter((item) => item.reviewStatus === 'approved' && approvedFoodIds.has(item.foodId))
    .sort((left, right) => compareText(left.ruleId, right.ruleId))

  const foods = approvedFoods.map((food) => {
    const terms = approvedTerms.filter((item) => item.foodId === food.foodId)
    const rules = approvedRules.filter((item) => item.foodId === food.foodId)
    return {
      foodId: food.foodId,
      canonicalName: food.canonicalName,
      normalizedCanonicalName: food.canonicalName.trim().toLowerCase(),
      category: food.category,
      subCategory: food.subCategory,
      iconKey: food.iconKey || '',
      searchTerms: [...new Set(terms.map((item) => item.term))],
      rankedTerms: terms.map((item) => ({
        term: item.term,
        normalizedTerm: item.normalizedTerm,
        type: item.type,
        weight: item.weight
      })),
      activeRuleIds: rules.map((item) => item.ruleId),
      releaseId: options.releaseId
    }
  })
  const snapshot = {
    releaseId: options.releaseId,
    generatedAt: options.generatedAt,
    foods,
    storageRules: approvedRules
  }
  const snapshotChecksum = checksum(snapshot)
  const manifest = {
    releaseId: options.releaseId,
    previousReleaseId: options.previousReleaseId || null,
    status: 'release_candidate',
    generatedAt: options.generatedAt,
    foodCount: foods.length,
    searchTermCount: approvedTerms.length,
    ruleCount: approvedRules.length,
    sourceCount: input.evidenceSources.filter((item) => item.status === 'active').length,
    snapshotChecksum
  }

  return { manifest, snapshot }
}

module.exports = {
  buildFoodKnowledgeRelease,
  checksum,
  stableJson
}
```

- [ ] **步骤 4：运行编译器测试验证通过**

运行：

```bash
node --test tests/foodKnowledgeCompiler.test.js
```

预期：4 个测试 PASS，0 个 FAIL。

- [ ] **步骤 5：提交编译器和测试**

```bash
git add scripts/lib/foodKnowledgeCompiler.js tests/foodKnowledgeCompiler.test.js
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(食材库): 添加确定性发布快照编译器"
```

预期暂存文件只有上述 2 个文件。

### 任务 3：导出现有食材库并生成迁移审计报告

**文件：**

- 创建：`scripts/lib/legacyFoodKnowledgeExport.js`
- 创建：`tests/legacyFoodKnowledgeExport.test.js`
- 读取：`utils/foodBase.js`

- [ ] **步骤 1：编写旧数据导出失败测试**

创建 `tests/legacyFoodKnowledgeExport.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { foodBase } = require('../utils/foodBase')

test('exports every current food as a non-publishable migration draft', () => {
  const { exportLegacyFoodKnowledge } = require('../scripts/lib/legacyFoodKnowledgeExport')
  const result = exportLegacyFoodKnowledge(foodBase)

  assert.equal(result.foods.length, foodBase.length)
  assert.equal(result.foods.every((item) => item.reviewStatus === 'legacy_unverified'), true)
  assert.equal(result.storageCandidates.every((item) => (
    item.migrationStatus === 'legacy_unverified' && item.evidenceLevel === 'insufficient'
  )), true)
  assert.equal(result.searchTerms.some((item) => (
    item.foodId === 'tomato' && item.term === '西红柿'
  )), true)
})

test('reports alias collisions without silently choosing one food', () => {
  const { exportLegacyFoodKnowledge } = require('../scripts/lib/legacyFoodKnowledgeExport')
  const result = exportLegacyFoodKnowledge(foodBase)
  const collision = result.report.termCollisions.find((item) => item.term === '青菜')

  assert.ok(collision)
  assert.ok(collision.foodIds.includes('cabbage'))
  assert.ok(collision.foodIds.includes('bokChoy'))
})

test('preserves old ranges only inside raw migration payloads', () => {
  const { exportLegacyFoodKnowledge } = require('../scripts/lib/legacyFoodKnowledgeExport')
  const result = exportLegacyFoodKnowledge(foodBase)
  const tomatoFridge = result.storageCandidates.find((item) => (
    item.foodId === 'tomato' && item.storageMethod === 'fridge'
  ))

  assert.ok(tomatoFridge)
  assert.equal(typeof tomatoFridge.legacyPayload.adultDaysMax, 'number')
  assert.equal(tomatoFridge.adultDaysMax, undefined)
  assert.equal(tomatoFridge.babyDaysMax, undefined)
})
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
node --test tests/legacyFoodKnowledgeExport.test.js
```

预期：FAIL，错误包含 `Cannot find module '../scripts/lib/legacyFoodKnowledgeExport'`。

- [ ] **步骤 3：实现旧数据导出器**

创建 `scripts/lib/legacyFoodKnowledgeExport.js`：

```js
function normalizeAliases(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[、,，]/)
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))]
}

function normalizeTerm(value) {
  return String(value || '').trim().toLowerCase()
}

function exportLegacyFoodKnowledge(foodBase) {
  const foods = []
  const searchTerms = []
  const storageCandidates = []
  const termFoodIds = new Map()

  for (const food of foodBase) {
    foods.push({
      foodId: food.id,
      canonicalName: food.name,
      category: food.category,
      subCategory: food.subCategory,
      defaultState: 'raw_whole',
      allergenTags: [],
      riskTags: [],
      iconKey: food.id,
      status: 'active',
      revision: 1,
      reviewStatus: 'legacy_unverified'
    })
    const terms = [{ term: food.name, type: 'canonical', weight: 100 }]
      .concat(normalizeAliases(food.aliases).map((term) => ({
        term,
        type: 'alias',
        weight: 90
      })))
    for (const term of terms) {
      const normalizedTerm = normalizeTerm(term.term)
      const termId = `${food.id}-${term.type}-${Buffer.from(normalizedTerm).toString('hex')}`
      searchTerms.push({
        termId,
        foodId: food.id,
        term: term.term,
        normalizedTerm,
        type: term.type,
        region: '',
        weight: term.weight,
        reviewStatus: 'legacy_unverified'
      })
      if (!termFoodIds.has(normalizedTerm)) termFoodIds.set(normalizedTerm, new Set())
      termFoodIds.get(normalizedTerm).add(food.id)
    }
    for (const storageMethod of ['room', 'fridge', 'freezer']) {
      if (!food[storageMethod]) continue
      storageCandidates.push({
        candidateId: `${food.id}-${storageMethod}-legacy-v1`,
        foodId: food.id,
        foodState: 'raw_whole',
        storageMethod,
        referenceDateType: 'purchased_at',
        evidenceLevel: 'insufficient',
        migrationStatus: 'legacy_unverified',
        legacyPayload: food[storageMethod]
      })
    }
  }

  const termCollisions = [...termFoodIds.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([term, ids]) => ({ term, foodIds: [...ids].sort() }))
    .sort((left, right) => {
      if (left.term === right.term) return 0
      return left.term < right.term ? -1 : 1
    })
  const report = {
    foodCount: foods.length,
    searchTermCount: searchTerms.length,
    storageCandidateCount: storageCandidates.length,
    termCollisionCount: termCollisions.length,
    termCollisions,
    publishableFoodCount: 0,
    publishableRuleCount: 0
  }

  return { foods, searchTerms, storageCandidates, report }
}

module.exports = { exportLegacyFoodKnowledge }
```

- [ ] **步骤 4：运行迁移导出测试验证通过**

运行：

```bash
node --test tests/legacyFoodKnowledgeExport.test.js
```

预期：3 个测试 PASS，0 个 FAIL。

- [ ] **步骤 5：提交导出器和测试**

```bash
git add scripts/lib/legacyFoodKnowledgeExport.js tests/legacyFoodKnowledgeExport.test.js
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(食材库): 添加旧数据迁移审计"
```

预期暂存文件只有上述 2 个文件。

### 任务 4：增加可复现的构建与导出命令

**文件：**

- 创建：`scripts/build-food-knowledge.js`
- 创建：`scripts/export-legacy-food-knowledge.js`
- 创建：`tests/foodKnowledgeCli.test.js`
- 生成：`_knowledge_base/migrations/legacy-v1/foods.json`
- 生成：`_knowledge_base/migrations/legacy-v1/search-terms.json`
- 生成：`_knowledge_base/migrations/legacy-v1/storage-candidates.json`
- 生成：`_knowledge_base/migrations/legacy-v1/report.json`

- [ ] **步骤 1：编写命令行失败测试**

创建 `tests/foodKnowledgeCli.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createFoodKnowledgeFixture } = require('./fixtures/foodKnowledgeFixture')
const { checksum } = require('../scripts/lib/foodKnowledgeCompiler')

const root = path.resolve(__dirname, '..')

function temporaryDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
}

function writeInput(directory, input) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'foods.json'), JSON.stringify(input.foods, null, 2))
  fs.writeFileSync(path.join(directory, 'search-terms.json'), JSON.stringify(input.searchTerms, null, 2))
  fs.writeFileSync(path.join(directory, 'storage-rules.json'), JSON.stringify(input.storageRules, null, 2))
  fs.writeFileSync(path.join(directory, 'evidence-sources.json'), JSON.stringify(input.evidenceSources, null, 2))
}

test('build command writes a manifest and snapshot with matching checksum', () => {
  const inputDir = temporaryDirectory('food-kb-input')
  const outputDir = temporaryDirectory('food-kb-output')
  writeInput(inputDir, createFoodKnowledgeFixture())

  const result = spawnSync(process.execPath, [
    'scripts/build-food-knowledge.js',
    '--input', inputDir,
    '--output', outputDir,
    '--release', 'food-kb-test.1',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ], { cwd: root, encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'))
  const snapshot = JSON.parse(fs.readFileSync(path.join(outputDir, 'snapshot.json'), 'utf8'))
  assert.equal(manifest.releaseId, snapshot.releaseId)
  assert.match(manifest.snapshotChecksum, /^sha256:[a-f0-9]{64}$/)
  assert.equal(manifest.snapshotChecksum, checksum(snapshot))
})

test('build command refuses invalid baby evidence', () => {
  const inputDir = temporaryDirectory('food-kb-invalid')
  const outputDir = temporaryDirectory('food-kb-invalid-output')
  const input = createFoodKnowledgeFixture()
  input.storageRules[0].babyDaysMax = 1
  writeInput(inputDir, input)

  const result = spawnSync(process.execPath, [
    'scripts/build-food-knowledge.js',
    '--input', inputDir,
    '--output', outputDir,
    '--release', 'food-kb-test.1',
    '--generated-at', '2026-07-22T00:00:00.000Z'
  ], { cwd: root, encoding: 'utf8' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /baby deadline requires direct baby evidence/)
  assert.equal(fs.existsSync(path.join(outputDir, 'manifest.json')), false)
})

test('legacy export command writes four non-publishable audit artifacts', () => {
  const outputDir = temporaryDirectory('food-kb-legacy')
  const result = spawnSync(process.execPath, [
    'scripts/export-legacy-food-knowledge.js',
    '--output', outputDir
  ], { cwd: root, encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(fs.readdirSync(outputDir).sort(), [
    'foods.json',
    'report.json',
    'search-terms.json',
    'storage-candidates.json'
  ])
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'))
  assert.equal(report.publishableFoodCount, 0)
  assert.equal(report.publishableRuleCount, 0)
})
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
node --test tests/foodKnowledgeCli.test.js
```

预期：3 个测试 FAIL；前两个错误指向缺少 `scripts/build-food-knowledge.js`，第三个指向缺少 `scripts/export-legacy-food-knowledge.js`。

- [ ] **步骤 3：实现构建命令**

创建 `scripts/build-food-knowledge.js`：

```js
#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { buildFoodKnowledgeRelease } = require('./lib/foodKnowledgeCompiler')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

function readJson(directory, filename) {
  return JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'))
}

function main() {
  const inputDir = path.resolve(option('--input'))
  const outputDir = path.resolve(option('--output'))
  const releaseId = option('--release')
  const generatedAt = option('--generated-at')
  const previousReleaseId = option('--previous-release') || null
  if (!option('--input') || !option('--output') || !releaseId || !generatedAt) {
    throw new Error('required options: --input --output --release --generated-at')
  }
  const input = {
    foods: readJson(inputDir, 'foods.json'),
    searchTerms: readJson(inputDir, 'search-terms.json'),
    storageRules: readJson(inputDir, 'storage-rules.json'),
    evidenceSources: readJson(inputDir, 'evidence-sources.json')
  }
  const result = buildFoodKnowledgeRelease(input, {
    releaseId,
    previousReleaseId,
    generatedAt
  })
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(result.manifest, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, 'snapshot.json'), `${JSON.stringify(result.snapshot, null, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
```

- [ ] **步骤 4：实现旧数据导出命令**

创建 `scripts/export-legacy-food-knowledge.js`：

```js
#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { foodBase } = require('../utils/foodBase')
const { exportLegacyFoodKnowledge } = require('./lib/legacyFoodKnowledgeExport')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

function main() {
  const outputOption = option('--output')
  if (!outputOption) throw new Error('required option: --output')
  const outputDir = path.resolve(outputOption)
  const result = exportLegacyFoodKnowledge(foodBase)
  const files = {
    'foods.json': result.foods,
    'search-terms.json': result.searchTerms,
    'storage-candidates.json': result.storageCandidates,
    'report.json': result.report
  }
  fs.mkdirSync(outputDir, { recursive: true })
  for (const [filename, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, filename), `${JSON.stringify(value, null, 2)}\n`)
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
```

- [ ] **步骤 5：运行命令行测试验证通过**

运行：

```bash
node --test tests/foodKnowledgeCli.test.js
```

预期：3 个测试 PASS，0 个 FAIL。

- [ ] **步骤 6：生成仓库内的 `legacy-v1` 迁移基线**

运行：

```bash
node scripts/export-legacy-food-knowledge.js --output _knowledge_base/migrations/legacy-v1
```

随后验证：

```bash
node -e "const report=require('./_knowledge_base/migrations/legacy-v1/report.json'); if(report.foodCount < 100 || report.publishableFoodCount !== 0) process.exit(1); console.log(report)"
```

预期：退出码 0；输出中的 `foodCount` 不少于 100，`publishableFoodCount` 和 `publishableRuleCount` 都为 0，并列出至少一个歧义搜索词。

- [ ] **步骤 7：验证重复导出没有差异**

运行第二次导出：

```bash
node scripts/export-legacy-food-knowledge.js --output _knowledge_base/migrations/legacy-v1
git diff --exit-code -- _knowledge_base/migrations/legacy-v1
```

预期：退出码 0，没有生成差异。

- [ ] **步骤 8：提交命令、测试和生成基线**

```bash
git add scripts/build-food-knowledge.js scripts/export-legacy-food-knowledge.js tests/foodKnowledgeCli.test.js _knowledge_base/migrations/legacy-v1
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(食材库): 添加知识库构建与迁移命令"
```

预期暂存范围只有上述 3 个代码/测试文件和 `legacy-v1` 目录。

### 任务 5：记录 CloudBase 集合、权限和证据边界

**文件：**

- 修改：`tests/foodDataSources.test.js`
- 修改：`docs/cloud-setup.md`
- 修改：`docs/food-data-sources.md`

- [ ] **步骤 1：编写文档边界失败测试**

在 `tests/foodDataSources.test.js` 末尾增加：

```js
test('cloud setup documents knowledge collections and server-only writes', () => {
  const setup = fs.readFileSync(path.resolve(__dirname, '../docs/cloud-setup.md'), 'utf8')
  const requiredCollections = [
    'foods',
    'food_search_terms',
    'storage_rules',
    'evidence_sources',
    'knowledge_releases',
    'food_search_docs',
    'search_events'
  ]

  requiredCollections.forEach((name) => assert.match(setup, new RegExp(`\\`${name}\\``)))
  assert.match(setup, /编辑集合和发布操作只允许管理端或云函数访问/)
  assert.match(setup, /小程序不能直接写入/)
})

test('food source policy separates baby and general deadline evidence', () => {
  const document = fs.readFileSync(path.resolve(__dirname, '../docs/food-data-sources.md'), 'utf8')

  assert.match(document, /direct/)
  assert.match(document, /derived/)
  assert.match(document, /insufficient/)
  assert.match(document, /不能把成人或一般家庭保存期限.*宝宝期限/)
  assert.match(document, /没有宝宝直接证据.*不展示独立的宝宝保存天数/)
})
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
node --test tests/foodDataSources.test.js
```

预期：原有 2 个测试 PASS，新增 2 个测试 FAIL，分别缺少知识库集合说明和证据等级说明。

- [ ] **步骤 3：更新 CloudBase 联调文档**

在 `docs/cloud-setup.md` 的集合章节中增加“食材知识库阶段 A”小节，逐项说明：

```markdown
### 食材知识库集合

- `foods`：审核中的食材身份。
- `food_search_terms`：标准名、别名、地域词和审核过的错别字。
- `storage_rules`：按食材、状态和保存方式拆分的规则。
- `evidence_sources`：规则引用的来源和定位信息。
- `knowledge_releases`：不可变候选/正式版本及校验码。
- `food_search_docs`：发布程序生成的运行快照，禁止人工编辑。
- `search_events`：最小化的零结果与选择反馈。

编辑集合和发布操作只允许管理端或云函数访问。小程序不能直接写入
上述知识集合，也不能直接修改 `search_events`；用户端只读取正式发布
快照，反馈经云函数做字段白名单和限流后写入。

阶段 A 只生成本地候选文件和迁移报告，不创建线上正式版本，也不切换
当前食材搜索。CloudBase 上传和活动版本切换在运行快照计划中实施。
```

- [ ] **步骤 4：更新证据等级说明**

在 `docs/food-data-sources.md` 的保存提醒边界后增加：

```markdown
## 规则证据等级

- `direct`：来源直接支持具体食材、处理状态、保存条件和对应人群；只有这一级可以发布有边界的期限。
- `derived`：从同类食材或通用原则推导，只能发布定性建议。
- `insufficient`：证据不足，不发布期限，明确显示信息不足或保守处理原则。

成人和宝宝期限分别审核。不能把成人或一般家庭保存期限简单缩短后当作
宝宝期限。没有宝宝直接证据时，宝宝期限字段保持为空，页面不展示独立
的宝宝保存天数，但可以展示有来源的一般保存提醒和宝宝谨慎提示。
```

- [ ] **步骤 5：运行文档测试验证通过**

运行：

```bash
node --test tests/foodDataSources.test.js
```

预期：4 个测试 PASS，0 个 FAIL。

- [ ] **步骤 6：提交文档和测试**

```bash
git add tests/foodDataSources.test.js docs/cloud-setup.md docs/food-data-sources.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs(食材库): 记录知识库集合与证据边界"
```

预期暂存文件只有上述 3 个文件。

### 任务 6：执行底座回归和交付检查

**文件：**

- 验证：本计划声明的全部新增和修改文件
- 不新增业务文件

- [ ] **步骤 1：运行知识库专项测试**

运行：

```bash
node --test tests/foodKnowledgeSchema.test.js tests/foodKnowledgeCompiler.test.js tests/legacyFoodKnowledgeExport.test.js tests/foodKnowledgeCli.test.js tests/foodDataSources.test.js
```

预期：全部 PASS，0 个 FAIL。

- [ ] **步骤 2：运行食材现有回归测试**

运行：

```bash
node --test tests/foodApiCore.test.js tests/foodRepository.test.js tests/foodService.test.js tests/foodNameSearchPage.test.js tests/foodRules.test.js
```

预期：全部 PASS，0 个 FAIL，证明本计划没有切换现有运行时。

- [ ] **步骤 3：运行全量自动测试**

运行：

```bash
node --test tests/*.test.js
```

预期：全部 PASS，0 个 FAIL；基线为 397 个测试，新计划将增加相应知识库测试。

- [ ] **步骤 4：重新生成并检查确定性**

运行：

```bash
node scripts/export-legacy-food-knowledge.js --output _knowledge_base/migrations/legacy-v1
git diff --exit-code -- _knowledge_base/migrations/legacy-v1
```

预期：退出码 0，无差异。

- [ ] **步骤 5：检查仓库状态和提交范围**

运行：

```bash
git status --short
git log --oneline 972dbdd..HEAD
git diff --check 972dbdd..HEAD
```

预期：

- 工作树无未提交文件；
- 只有本计划列出的原子提交；
- `git diff --check` 无输出；
- `utils/foodBase.js`、页面、用户记录和云函数运行时没有变化。

- [ ] **步骤 6：人工审阅迁移报告**

打开 `_knowledge_base/migrations/legacy-v1/report.json`，确认：

- `publishableFoodCount` 为 0；
- `publishableRuleCount` 为 0；
- “青菜”等歧义词没有被自动归并；
- 报告不包含用户数据、宝宝资料或家庭数据；
- 下一计划可直接按 `termCollisions` 和 `storage-candidates` 建立审核队列。

此步骤只确认迁移基线安全，不把任何旧期限改成已审核规则。

## 完成定义

本计划只有在以下条件全部满足时才算完成：

- Schema 校验器拒绝缺引用、错误枚举、冲突规则和证据不匹配期限；
- 编译器对同一输入生成完全一致的快照和 checksum；
- 旧食材库全部进入 `legacy_unverified` 迁移基线；
- 迁移报告显式列出歧义词，且可发布食材/规则数均为 0；
- 构建命令遇到无效宝宝证据时不写出 manifest；
- CloudBase 集合和服务端权限边界已记录；
- 专项、食材回归和全量测试全部通过；
- 当前小程序搜索、保存提醒和用户数据行为没有改变。
