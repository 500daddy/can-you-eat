const test = require('node:test')
const assert = require('node:assert/strict')

process.env.BABY_FOOD_IGNORE_LOCAL_CONFIG = '1'

const {
  buildReminderMessagePayload,
  createSendFoodReminder,
  PLACEHOLDER_TEMPLATE_ID,
  TEMPLATE_ID_FOOD_EXPIRE
} = require('../cloudfunctions/sendFoodReminder/core')

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
