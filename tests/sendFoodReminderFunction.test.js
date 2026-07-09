const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

process.env.BABY_FOOD_IGNORE_LOCAL_CONFIG = '1'

const {
  buildReminderMessagePayload,
  createSendFoodReminder,
  PLACEHOLDER_TEMPLATE_ID,
  selectReminderCandidate,
  TEMPLATE_ID_FOOD_EXPIRE
} = require('../cloudfunctions/sendFoodReminder/core')

test('sendFoodReminder cloud function entry stays self-contained for deployment', () => {
  const entryPath = path.join(__dirname, '..', 'cloudfunctions', 'sendFoodReminder', 'index.js')
  const source = fs.readFileSync(entryPath, 'utf8')

  assert.doesNotMatch(source, /require\(['"]\.\.\//)
})

test('sendFoodReminder cloud function declares subscribe message OpenAPI permission', () => {
  const configPath = path.join(__dirname, '..', 'cloudfunctions', 'sendFoodReminder', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  assert.ok(config.permissions)
  assert.deepEqual(config.permissions.openapi, ['subscribeMessage.send'])
})

test('builds subscribe message payload with configured reminder template keywords', () => {
  const payload = buildReminderMessagePayload({
    touser: 'openid-test',
    templateId: 'tmpl_private_food_expire',
    foodName: '西兰花',
    remainingDays: 1,
    expireDate: '2026-07-01'
  })

  assert.equal(payload.touser, 'openid-test')
  assert.equal(payload.templateId, 'tmpl_private_food_expire')
  assert.equal(payload.page, 'pages/reminder/index')
  assert.equal(payload.miniprogramState, 'developer')
  assert.deepEqual(payload.data, {
    thing6: { value: '西兰花' },
    number2: { value: '1' },
    time16: { value: '2026-07-01' }
  })
})

test('defaults to placeholder template id for open source safety', () => {
  const payload = buildReminderMessagePayload({
    touser: 'openid-test'
  })

  assert.equal(TEMPLATE_ID_FOOD_EXPIRE, PLACEHOLDER_TEMPLATE_ID)
  assert.equal(payload.templateId, PLACEHOLDER_TEMPLATE_ID)
})

test('does not send reminder when template id is not configured', async () => {
  let called = false
  const sendFoodReminder = createSendFoodReminder({
    getOpenId: () => 'openid-test',
    sendSubscribeMessage: async () => {
      called = true
      return { errCode: 0, errMsg: 'ok' }
    }
  })

  const result = await sendFoodReminder({ test: true })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'template_not_configured')
  assert.equal(called, false)
})

test('sends a test reminder to current openid', async () => {
  const calls = []
  const sendFoodReminder = createSendFoodReminder({
    getOpenId: () => 'openid-test',
    templateId: 'tmpl_private_food_expire',
    sendSubscribeMessage: async (payload) => {
      calls.push(payload)
      return { errCode: 0, errMsg: 'ok' }
    }
  })

  const result = await sendFoodReminder({ test: true })

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].touser, 'openid-test')
  assert.deepEqual(calls[0].data.thing6, { value: '西兰花' })
})

test('returns a readable error when user has not accepted the subscribe message', async () => {
  const sendFoodReminder = createSendFoodReminder({
    getOpenId: () => 'openid-test',
    templateId: 'tmpl_private_food_expire',
    sendSubscribeMessage: async () => {
      throw new Error('errCode: 43101 errMsg: openapi.subscribeMessage.send:fail user refuse to accept the msg')
    }
  })

  const result = await sendFoodReminder({ test: true })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'subscribe_message_refused')
})

test('uses the current reminder candidate when no explicit food is provided', async () => {
  const calls = []
  const sendFoodReminder = createSendFoodReminder({
    getOpenId: () => 'openid-test',
    templateId: 'tmpl_private_food_expire',
    getReminderCandidate: async () => ({
      foodName: '杏鲍菇',
      remainingDays: 0,
      expireDate: '2026-06-30'
    }),
    sendSubscribeMessage: async (payload) => {
      calls.push(payload)
      return { errCode: 0, errMsg: 'ok' }
    }
  })

  const result = await sendFoodReminder({ test: true })

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].data, {
    thing6: { value: '杏鲍菇' },
    number2: { value: '0' },
    time16: { value: '2026-06-30' }
  })
})

test('summarizes only the highest-priority reminder group into one subscribe message candidate', () => {
  const candidate = selectReminderCandidate({
    today: [
      { foodName: '粥', babyExpireDate: '2026-07-02' },
      { foodName: '胡萝卜', babyExpireDate: '2026-07-03' }
    ],
    soon: [
      { foodName: '蓝莓', babyExpireDate: '2026-07-01' }
    ],
    overdue: [
      { foodName: '杏鲍菇', babyExpireDate: '2026-06-29' },
      { foodName: '牛奶', babyExpireDate: '2026-06-29' }
    ]
  }, '2026-07-02')

  assert.deepEqual(candidate, {
    foodName: '粥、胡萝卜',
    remainingDays: 0,
    expireDate: '2026-07-02'
  })
})

test('uses compact summary text for three or more foods in the selected group', () => {
  const candidate = selectReminderCandidate({
    today: [],
    soon: [
      { foodName: '蓝莓', babyExpireDate: '2026-07-03' },
      { foodName: '鸡蛋', babyExpireDate: '2026-07-04' },
      { foodName: '牛奶', babyExpireDate: '2026-07-05' }
    ],
    overdue: [
      { foodName: '粥', babyExpireDate: '2026-07-01' }
    ]
  }, '2026-07-02')

  assert.deepEqual(candidate, {
    foodName: '蓝莓、鸡蛋等3样',
    remainingDays: 1,
    expireDate: '2026-07-03'
  })
})
