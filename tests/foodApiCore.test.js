const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFoodApi,
  createMemoryStore,
  seedFoodBase
} = require('../cloudfunctions/foodApi/core')
const { createFamilyApi } = require('../cloudfunctions/familyApi/core')

test('initializes food base once and searches by alias', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const init = await api.handle({ action: 'initFoodBase' })
  const initAgain = await api.handle({ action: 'initFoodBase' })
  const search = await api.handle({ action: 'searchFoods', keyword: '西红柿' })
  const mushroom = await api.handle({ action: 'searchFoods', keyword: '菌菇' })

  assert.equal(init.inserted, seedFoodBase.length)
  assert.equal(initAgain.inserted, 0)
  assert.equal(search.data[0].id, 'tomato')
  assert.equal(search.data[0].name, '番茄')
  assert.equal(mushroom.data[0].id, 'mushroom')
})

test('cloud food search covers common family aliases', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const resultIds = async (keyword) => (await api.handle({ action: 'searchFoods', keyword })).data.map((item) => item.id)

  assert.ok((await resultIds('宝宝米粉')).includes('riceNoodle'))
  assert.ok((await resultIds('小青菜')).some((id) => ['cabbage', 'bokChoy'].includes(id)))
  assert.ok((await resultIds('鸡里脊')).includes('chicken'))
  assert.ok((await resultIds('鱼柳')).includes('fish'))
  assert.ok((await resultIds('红心火龙果')).includes('dragonFruit'))
})

test('cloud seed food base mirrors the expanded daily food coverage', () => {
  const ids = seedFoodBase.map((item) => item.id)
  const requiredIds = ['bokChoy', 'shiitake', 'yam', 'pork', 'salmon', 'yogurt', 'oat', 'pear']

  assert.ok(seedFoodBase.length >= 100)
  assert.equal(new Set(ids).size, ids.length)

  for (const id of requiredIds) {
    assert.ok(ids.includes(id), `${id} should exist in cloud seed food base`)
  }
})

test('cloud seed food base normalizes duplicate second-level categories', () => {
  const subCategories = new Set(seedFoodBase.map((item) => item.subCategory))

  assert.equal(subCategories.has('花菜类'), false)
  assert.equal(subCategories.has('叶菜类'), false)
  assert.equal(subCategories.has('根茎薯芋类'), false)
  assert.equal(subCategories.has('茄果瓜类'), false)
  assert.equal(subCategories.has('菌藻类'), false)
  assert.equal(subCategories.has('莓果类'), false)
  assert.equal(subCategories.has('叶花菜类'), true)
  assert.equal(subCategories.has('根茎类'), true)
  assert.equal(subCategories.has('茄果类'), true)
  assert.equal(subCategories.has('菌菇类'), true)
  assert.equal(subCategories.has('浆果类'), true)
})

test('gets complete cloud food base even when stored collection is partially seeded', async () => {
  const store = createMemoryStore()
  await store.add('food_base', {
    id: 'broccoli',
    name: '西兰花',
    category: '蔬菜',
    subCategory: '花菜类'
  })
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })

  const result = await api.handle({ action: 'getFoodBase' })
  const ids = result.data.map((item) => item.id)

  assert.ok(result.data.length >= 100)
  assert.ok(ids.includes('yam'))
  assert.ok(ids.includes('shiitake'))
  assert.ok(ids.includes('salmon'))
})

test('initFoodBase refreshes category metadata for existing foods', async () => {
  const store = createMemoryStore()
  await store.add('food_base', {
    id: 'carrot',
    name: '胡萝卜',
    category: '根茎',
    subCategory: '旧分类'
  })
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })

  const init = await api.handle({ action: 'initFoodBase' })
  const carrot = await api.handle({ action: 'getFoodBaseById', foodBaseId: 'carrot' })

  assert.equal(init.updated, 1)
  assert.equal(carrot.data.category, '蔬菜')
  assert.equal(carrot.data.subCategory, '根茎类')
})

test('adds and lists calculated user food records', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge',
    quantity: 1,
    unit: '颗',
    note: '今晚做熟'
  })
  const list = await api.handle({ action: 'getFoodRecords' })
  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(added.data.status, 'baby_today')
  assert.equal(list.data[0].id, added.data.id)
  assert.equal(detail.data.record.note, '今晚做熟')
  assert.equal(detail.data.base.name, '西兰花')
})

test('cloud records treat configured baby allergens as risk reminders', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  await api.handle({ action: 'updateUserSettings', babyAllergens: ['鸡蛋'] })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'egg',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  const reminders = await api.handle({ action: 'getReminders' })

  assert.equal(added.data.status, 'not_recommended')
  assert.equal(added.data.statusText, '不建议给宝宝食用')
  assert.match(added.data.note, /宝宝过敏源.*鸡蛋/)
  assert.equal(reminders.data.today.length, 0)
  assert.equal(reminders.data.overdue[0].id, added.data.id)
})

test('gets cloud food base by id', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })

  const result = await api.handle({ action: 'getFoodBaseById', foodBaseId: 'broccoli' })

  assert.equal(result.ok, true)
  assert.equal(result.data.id, 'broccoli')
  assert.equal(result.data.name, '西兰花')
})

test('adds custom cloud food records without falling back to broccoli', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const added = await api.handle({
    action: 'addFoodRecord',
    foodName: '雪莲果',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(added.data.foodBaseId, 'custom')
  assert.equal(added.data.name, '雪莲果')
  assert.equal(added.data.icon, '/assets/sprites/food/food_jar.png')
  assert.equal(detail.data.record.name, '雪莲果')
  assert.equal(detail.data.base, null)
})

test('returns empty cloud detail when a record is not found', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: 'missing-record' })

  assert.equal(detail.data.record, null)
  assert.equal(detail.data.base, null)
})

test('keeps user records isolated and handles finish action', async () => {
  const store = createMemoryStore()
  const userA = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  const userB = createFoodApi({ store, userId: 'user-b', today: '2026-06-12' })
  await userA.handle({ action: 'initFoodBase' })
  const added = await userA.handle({
    action: 'addFoodRecord',
    foodBaseId: 'carrot',
    purchaseDate: '2026-06-07',
    storageMethod: 'fridge'
  })

  assert.equal((await userB.handle({ action: 'getFoodRecords' })).data.length, 0)

  await userA.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'finished' })

  assert.equal((await userA.handle({ action: 'getFoodRecords' })).data.length, 0)
  assert.equal((await userA.handle({ action: 'getFoodDetail', recordId: added.data.id })).data.record.status, 'finished')
})

test('family members share food records by family id', async () => {
  const store = createMemoryStore()
  const ownerFamily = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  const memberFamily = createFamilyApi({ store, userId: 'member-a', today: '2026-07-09' })
  await ownerFamily.handle({ action: 'getMyFamily' })
  const invite = await ownerFamily.handle({ action: 'createInvite' })
  await memberFamily.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  const ownerFood = createFoodApi({ store, userId: 'owner', today: '2026-07-09' })
  const memberFood = createFoodApi({ store, userId: 'member-a', today: '2026-07-09' })
  const outsiderFood = createFoodApi({ store, userId: 'outsider', today: '2026-07-09' })

  const added = await ownerFood.handle({ action: 'addFoodRecord', foodBaseId: 'carrot', purchaseDate: '2026-07-09' })

  assert.equal((await memberFood.handle({ action: 'getFoodRecords' })).data[0].id, added.data.id)
  assert.equal((await outsiderFood.handle({ action: 'getFoodRecords' })).data.length, 0)
})

test('food edits write family audit logs with actor information', async () => {
  const store = createMemoryStore()
  const familyApi = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  await familyApi.handle({
    action: 'getMyFamily',
    nickname: '小满妈妈',
    avatarUrl: '/old-avatar.jpg'
  })
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-09' })
  const added = await api.handle({ action: 'addFoodRecord', foodBaseId: 'carrot', purchaseDate: '2026-07-09' })
  await store.update('family_members', (item) => item.openId === 'owner', {
    nickname: '小满爸爸',
    avatarUrl: '/new-avatar.jpg'
  })
  await api.handle({ action: 'updateFoodRecord', recordId: added.data.id, note: '已经切块密封' })

  const logs = await api.handle({ action: 'getRecordAuditLogs', recordId: added.data.id })

  assert.equal(logs.data[0].targetId, added.data.id)
  assert.match(logs.data[0].summary, /编辑/)
  assert.equal(logs.data[0].actorOpenId, 'owner')
  assert.equal(logs.data[0].actorName, '小满爸爸')
  assert.equal(logs.data[0].actorAvatar, '/new-avatar.jpg')
  assert.equal(logs.data[1].actorName, '小满妈妈')
  assert.equal(logs.data[1].actorAvatar, '/old-avatar.jpg')
})

test('preserves manual cloud adult_only status', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })

  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(detail.data.record.status, 'adult_only')
  assert.equal(detail.data.record.group, '可留给大人吃')
})

test('expires manual cloud adult_only status after adult reference period', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-01',
    storageMethod: 'fridge'
  })

  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const detail = await api.handle({ action: 'getFoodDetail', recordId: added.data.id })

  assert.equal(detail.data.record.status, 'expired')
  assert.equal(detail.data.record.group, '不建议继续食用')
})

test('clears manual cloud status when a record is edited', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-12',
    storageMethod: 'fridge'
  })
  await api.handle({ action: 'finishFoodRecord', recordId: added.data.id, finishAction: 'adult_only' })

  const updated = await api.handle({
    action: 'updateFoodRecord',
    recordId: added.data.id,
    note: '重新检查'
  })

  assert.equal(updated.data.status, 'baby_ok')
  assert.equal(updated.data.note, '重新检查')
})

test('updates settings and submits feedback', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-12' })

  const settings = await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒',
    reminderEnabled: false
  })
  const feedback = await api.handle({
    action: 'submitFeedback',
    type: 'food_not_found',
    content: '想补充雪莲果',
    foodName: '雪莲果'
  })

  assert.equal(settings.data.babyName, '小米粒')
  assert.equal(settings.data.reminderEnabled, false)
  assert.equal(feedback.data.status, 'pending')
  assert.equal(feedback.data.userId, 'user-a')
})

test('only family owner can update baby settings', async () => {
  const store = createMemoryStore()
  const ownerFamily = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  const memberFamily = createFamilyApi({ store, userId: 'member-a', today: '2026-07-09' })
  await ownerFamily.handle({ action: 'getMyFamily' })
  const invite = await ownerFamily.handle({ action: 'createInvite' })
  await memberFamily.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  const ownerFood = createFoodApi({ store, userId: 'owner', today: '2026-07-09' })
  const memberFood = createFoodApi({ store, userId: 'member-a', today: '2026-07-09' })

  const ownerUpdate = await ownerFood.handle({ action: 'updateUserSettings', babyName: '小米粒' })
  const memberUpdate = await memberFood.handle({ action: 'updateUserSettings', babyName: '不应该成功' })
  const memberSettings = await memberFood.handle({ action: 'getUserSettings' })

  assert.equal(ownerUpdate.ok, true)
  assert.equal(memberUpdate.ok, false)
  assert.equal(memberSettings.data.babyName, '小米粒')
  assert.equal(memberSettings.data.canEditBabySettings, false)
})

test('computes baby age text when updating cloud settings', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-16' })

  const settings = await api.handle({
    action: 'updateUserSettings',
    babyBirthday: '2025-10-01'
  })

  assert.equal(settings.data.babyAgeText, '8个月15天')
})

test('gets cloud user settings with computed baby age text', async () => {
  const api = createFoodApi({ store: createMemoryStore(), userId: 'user-a', today: '2026-06-16' })
  await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒',
    babyBirthday: '2025-10-01'
  })

  const settings = await api.handle({ action: 'getUserSettings' })

  assert.equal(settings.data.babyName, '小米粒')
  assert.equal(settings.data.babyAgeText, '8个月15天')
})

test('logs recognition selections by user', async () => {
  const store = createMemoryStore()
  const userA = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  const userB = createFoodApi({ store, userId: 'user-b', today: '2026-06-12' })

  const log = await userA.handle({
    action: 'logRecognition',
    imageUrl: 'cloud://image',
    selectedFoodName: '胡萝卜',
    selectedFoodBaseId: 'carrot',
    confidence: 0.92
  })

  assert.equal(log.data.userId, 'user-a')
  assert.equal((await userA.handle({ action: 'getRecognitionLogs' })).data.length, 1)
  assert.equal((await userB.handle({ action: 'getRecognitionLogs' })).data.length, 0)
})

test('cloud api update payloads do not persist undefined fields', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'user-a', today: '2026-06-12' })
  await api.handle({ action: 'initFoodBase' })
  const added = await api.handle({
    action: 'addFoodRecord',
    foodBaseId: 'broccoli',
    purchaseDate: '2026-06-10',
    storageMethod: 'fridge'
  })

  await api.handle({
    action: 'updateFoodRecord',
    recordId: added.data.id,
    note: '只改备注'
  })
  await api.handle({
    action: 'updateUserSettings',
    babyName: '小米粒'
  })

  const rawRecord = (await store.list('user_food_records'))[0]
  const rawSettings = (await store.list('family_settings'))[0]

  assert.equal(Object.prototype.hasOwnProperty.call(rawRecord, 'status'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(rawSettings, 'action'), false)
})

test('merges local records idempotently and keeps the newest duplicate', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-13' })
  await api.handle({ action: 'getFoodRecords' })
  const membership = await store.get('family_members', (item) => item.openId === 'owner')
  await store.add('user_food_records', {
    id: 'record-shared',
    familyId: membership.familyId,
    userId: 'owner',
    foodBaseId: 'carrot',
    note: '云端新备注',
    createdAt: '2026-07-10',
    updatedAt: '2026-07-13'
  })

  const input = [
    { id: 'record-shared', foodBaseId: 'carrot', note: '本机旧备注', updatedAt: '2026-07-12' },
    { id: 'record-local', foodBaseId: 'egg', purchaseDate: '2026-07-13', updatedAt: '2026-07-13' }
  ]
  const first = await api.handle({ action: 'mergeLocalRecords', records: input })
  const second = await api.handle({ action: 'mergeLocalRecords', records: input })
  const records = await store.list('user_food_records', (item) => item.familyId === membership.familyId)

  assert.deepEqual(first.data, { added: 1, updated: 0, skipped: 1 })
  assert.deepEqual(second.data, { added: 0, updated: 0, skipped: 2 })
  assert.equal(records.length, 2)
  assert.equal(records.find((item) => item.id === 'record-shared').note, '云端新备注')
})

test('merge local records accepts only safe fields and records a family audit summary', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-13' })

  const result = await api.handle({
    action: 'mergeLocalRecords',
    records: [{
      _id: 'forged-cloud-id',
      id: 'record-local',
      familyId: 'forged-family',
      userId: 'forged-user',
      foodBaseId: 'custom',
      customFoodName: '自制高汤',
      purchaseDate: '2026-07-12',
      storageMethod: 'freezer',
      quantity: '2',
      unit: '盒',
      isBabyFood: false,
      note: '分装冷冻',
      status: 'finished',
      createdAt: '2026-07-12',
      updatedAt: '2026-07-13',
      unexpected: 'do-not-save'
    }]
  })
  const membership = await store.get('family_members', (item) => item.openId === 'owner')
  const saved = await store.get('user_food_records', (item) => item.id === 'record-local')
  const logs = await store.list('family_audit_logs', (item) => item.action === 'local_records_merged')

  assert.deepEqual(result.data, { added: 1, updated: 0, skipped: 0 })
  assert.equal(saved.familyId, membership.familyId)
  assert.equal(saved.userId, 'owner')
  assert.notEqual(saved._id, 'forged-cloud-id')
  assert.equal(saved.unexpected, undefined)
  assert.equal(saved.customFoodName, '自制高汤')
  assert.equal(saved.status, 'finished')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].familyId, membership.familyId)
  assert.match(logs[0].summary, /新增 1 条.*更新 0 条/)
})

test('merge local records updates only when both timestamps exist and local is newer', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-13' })
  await api.handle({ action: 'getFoodRecords' })
  const membership = await store.get('family_members', (item) => item.openId === 'owner')
  await store.add('user_food_records', {
    id: 'record-newer-local',
    familyId: membership.familyId,
    userId: 'owner',
    foodBaseId: 'carrot',
    note: '云端旧备注',
    createdAt: '2026-07-10',
    updatedAt: '2026-07-11'
  })
  await store.add('user_food_records', {
    id: 'record-missing-time',
    familyId: membership.familyId,
    userId: 'owner',
    foodBaseId: 'egg',
    note: '云端无时间'
  })

  const result = await api.handle({
    action: 'mergeLocalRecords',
    records: [
      { id: 'record-newer-local', foodBaseId: 'carrot', note: '本机新备注', updatedAt: '2026-07-12' },
      { id: 'record-missing-time', foodBaseId: 'egg', note: '不能覆盖', updatedAt: '2026-07-13' }
    ]
  })
  const updated = await store.get('user_food_records', (item) => item.id === 'record-newer-local')
  const skipped = await store.get('user_food_records', (item) => item.id === 'record-missing-time')

  assert.deepEqual(result.data, { added: 0, updated: 1, skipped: 1 })
  assert.equal(updated.note, '本机新备注')
  assert.equal(updated.familyId, membership.familyId)
  assert.equal(skipped.note, '云端无时间')
})

test('merge local records rejects more than 200 records without writing', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-13' })
  const records = Array.from({ length: 201 }, (_, index) => ({
    id: `record-${index}`,
    foodBaseId: 'carrot',
    updatedAt: '2026-07-13'
  }))

  const result = await api.handle({ action: 'mergeLocalRecords', records })

  assert.equal(result.ok, false)
  assert.match(result.error, /最多.*200/)
  assert.equal((await store.list('user_food_records')).length, 0)
})

test('merge local records requires food editing permission', async () => {
  const store = createMemoryStore()
  await store.add('family_members', {
    id: 'viewer-membership',
    familyId: 'family-a',
    openId: 'viewer',
    role: 'viewer',
    status: 'active'
  })
  const api = createFoodApi({ store, userId: 'viewer', today: '2026-07-13' })

  await assert.rejects(
    () => api.handle({
      action: 'mergeLocalRecords',
      records: [{ id: 'record-a', foodBaseId: 'carrot', updatedAt: '2026-07-13' }]
    }),
    /没有权限/
  )
  assert.equal((await store.list('user_food_records')).length, 0)
})
