const test = require('node:test')
const assert = require('node:assert/strict')

process.env.BABY_FOOD_IGNORE_LOCAL_CONFIG = '1'

const {
  createSubscribeService,
  PLACEHOLDER_TEMPLATE_ID,
  TEMPLATE_ID_FOOD_EXPIRE
} = require('../utils/subscribeService')

test('requests food reminder template and reports accepted state', async () => {
  const service = createSubscribeService({
    templateId: 'tmpl_food_expire',
    requestSubscribeMessage: async ({ tmplIds }) => ({
      [tmplIds[0]]: 'accept'
    })
  })

  const result = await service.requestFoodExpireSubscribe()

  assert.equal(result.templateId, 'tmpl_food_expire')
  assert.equal(result.accepted, true)
})

test('reports rejected subscription without throwing', async () => {
  const service = createSubscribeService({
    templateId: 'tmpl_food_expire',
    requestSubscribeMessage: async ({ tmplIds }) => ({
      [tmplIds[0]]: 'reject'
    })
  })

  const result = await service.requestFoodExpireSubscribe()

  assert.equal(result.accepted, false)
  assert.equal(result.status, 'reject')
})

test('returns not_configured for placeholder template id', async () => {
  const service = createSubscribeService({
    templateId: '请替换为实际订阅消息模板ID'
  })

  const result = await service.requestFoodExpireSubscribe()

  assert.equal(result.accepted, false)
  assert.equal(result.status, 'not_configured')
})

test('uses placeholder by default so open source code does not expose template id', async () => {
  const service = createSubscribeService({
    requestSubscribeMessage: async ({ tmplIds }) => ({
      [tmplIds[0]]: 'accept'
    })
  })

  const result = await service.requestFoodExpireSubscribe()

  assert.equal(TEMPLATE_ID_FOOD_EXPIRE, PLACEHOLDER_TEMPLATE_ID)
  assert.equal(result.templateId, PLACEHOLDER_TEMPLATE_ID)
  assert.equal(result.accepted, false)
  assert.equal(result.status, 'not_configured')
})

test('uses explicit configured template id for subscribe request', async () => {
  const service = createSubscribeService({
    templateId: 'tmpl_private_food_expire',
    requestSubscribeMessage: async ({ tmplIds }) => ({
      [tmplIds[0]]: 'accept'
    })
  })

  const result = await service.requestFoodExpireSubscribe()

  assert.equal(result.templateId, 'tmpl_private_food_expire')
  assert.equal(result.accepted, true)
  assert.equal(result.status, 'accept')
})
