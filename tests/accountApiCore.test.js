const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMemoryStore } = require('../cloudfunctions/foodApi/core')

function loadCreateAccountApi() {
  let accountApi = {}
  try {
    accountApi = require('../cloudfunctions/accountApi/core')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes('accountApi/core')) {
      throw error
    }
  }
  assert.equal(typeof accountApi.createAccountApi, 'function')
  return accountApi.createAccountApi
}

test('first save creates a parent profile and syncs active member snapshots', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  await store.add('family_members', {
    id: 'member-1',
    familyId: 'family-1',
    openId: 'parent-1',
    nickname: 'Old name',
    avatarUrl: 'old.png',
    status: 'active',
    updatedAt: '2026-07-01'
  })
  await store.add('family_members', {
    id: 'member-2',
    familyId: 'family-2',
    openId: 'parent-1',
    nickname: 'Old name',
    avatarUrl: 'old.png',
    status: 'active',
    updatedAt: '2026-07-01'
  })
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })

  const result = await api.handle({
    action: 'saveMyProfile',
    nickname: '  宝宝妈妈  ',
    avatarUrl: 12345
  })

  assert.deepEqual(result, {
    ok: true,
    data: {
      id: 'profile_parent-1',
      openId: 'parent-1',
      nickname: '宝宝妈妈',
      avatarUrl: '12345',
      profileUpdatedAt: '2026-07-13',
      createdAt: '2026-07-13',
      updatedAt: '2026-07-13'
    }
  })
  const members = await store.list('family_members', (item) => item.openId === 'parent-1')
  assert.deepEqual(
    members.map(({ nickname, avatarUrl, updatedAt }) => ({ nickname, avatarUrl, updatedAt })),
    [
      { nickname: '宝宝妈妈', avatarUrl: '12345', updatedAt: '2026-07-13' },
      { nickname: '宝宝妈妈', avatarUrl: '12345', updatedAt: '2026-07-13' }
    ]
  )
})

test('saving again updates the existing profile instead of adding a duplicate', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  const firstApi = createAccountApi({ store, userId: 'parent-1', today: '2026-07-12' })

  await firstApi.handle({ action: 'saveMyProfile', nickname: '旧昵称', avatarUrl: 'old.png' })
  const secondApi = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })
  const result = await secondApi.handle({ action: 'saveMyProfile', nickname: '新昵称', avatarUrl: ' new.png ' })

  const profiles = await store.list('user_profiles', (item) => item.openId === 'parent-1')
  assert.equal(profiles.length, 1)
  assert.equal(result.data.nickname, '新昵称')
  assert.equal(result.data.avatarUrl, 'new.png')
  assert.equal(result.data.createdAt, '2026-07-12')
  assert.equal(result.data.updatedAt, '2026-07-13')
})

test('getMyProfile returns the current profile and null when none exists', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  const missingApi = createAccountApi({ store, userId: 'missing', today: '2026-07-13' })
  assert.deepEqual(await missingApi.handle({ action: 'getMyProfile' }), { ok: true, data: null })

  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })
  const saved = await api.handle({ action: 'saveMyProfile', nickname: '家长', avatarUrl: '' })

  assert.deepEqual(await api.handle({ action: 'getMyProfile' }), saved)
})

test('saveMyProfile rejects an empty trimmed nickname without writing', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })

  const result = await api.handle({ action: 'saveMyProfile', nickname: '   ', avatarUrl: 'avatar.png' })

  assert.deepEqual(result, { ok: false, error: '请输入家长昵称' })
  assert.deepEqual(await store.list('user_profiles'), [])
})

test('saveMyProfile only updates active memberships', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  await store.add('family_members', {
    id: 'member-active',
    openId: 'parent-1',
    nickname: 'Active old',
    avatarUrl: 'active-old.png',
    status: 'active',
    updatedAt: '2026-07-01'
  })
  await store.add('family_members', {
    id: 'member-left',
    openId: 'parent-1',
    nickname: 'Left old',
    avatarUrl: 'left-old.png',
    status: 'left',
    updatedAt: '2026-07-01'
  })
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })

  await api.handle({ action: 'saveMyProfile', nickname: '新昵称', avatarUrl: 'new.png' })

  const active = await store.get('family_members', (item) => item.id === 'member-active')
  const left = await store.get('family_members', (item) => item.id === 'member-left')
  assert.deepEqual(
    { nickname: active.nickname, avatarUrl: active.avatarUrl, updatedAt: active.updatedAt },
    { nickname: '新昵称', avatarUrl: 'new.png', updatedAt: '2026-07-13' }
  )
  assert.deepEqual(
    { nickname: left.nickname, avatarUrl: left.avatarUrl, updatedAt: left.updatedAt },
    { nickname: 'Left old', avatarUrl: 'left-old.png', updatedAt: '2026-07-01' }
  )
})

test('production store uses deterministic profile upsert and one structured active-member update', async () => {
  const createAccountApi = loadCreateAccountApi()
  const calls = {
    getByFields: [],
    setByDocumentId: [],
    updateManyByFields: []
  }
  const store = {
    async getByFields(collection, fields) {
      calls.getByFields.push({ collection, fields })
      return null
    },
    async setByDocumentId(collection, documentId, doc) {
      calls.setByDocumentId.push({ collection, documentId, doc })
      return doc
    },
    async updateManyByFields(collection, fields, patch) {
      calls.updateManyByFields.push({ collection, fields, patch })
      return { updated: 2 }
    },
    async add() {
      throw new Error('structured store must not add a profile with an automatic document id')
    },
    async list() {
      throw new Error('structured store must not scan active memberships')
    }
  }
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13T08:00:00.000Z' })

  const result = await api.handle({ action: 'saveMyProfile', nickname: ' 家长 ', avatarUrl: ' avatar.png ' })

  assert.equal(result.ok, true)
  assert.deepEqual(calls.getByFields, [
    { collection: 'user_profiles', fields: { openId: 'parent-1' } }
  ])
  assert.deepEqual(calls.setByDocumentId, [{
    collection: 'user_profiles',
    documentId: 'profile_parent-1',
    doc: result.data
  }])
  assert.deepEqual(calls.updateManyByFields, [{
    collection: 'family_members',
    fields: { openId: 'parent-1', status: 'active' },
    patch: {
      nickname: '家长',
      avatarUrl: 'avatar.png',
      updatedAt: '2026-07-13T08:00:00.000Z'
    }
  }])
})

test('updating an existing structured profile writes directly by document id without a predicate scan', async () => {
  const createAccountApi = loadCreateAccountApi()
  const existing = {
    _id: 'cloud-profile-legacy',
    id: 'profile_parent-1',
    openId: 'parent-1',
    nickname: '旧昵称',
    avatarUrl: 'old.png',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    unrelated: 'keep-on-server'
  }
  let receivedPatch
  let receivedDocumentId
  let setCalls = 0
  const store = {
    async getByFields() {
      return existing
    },
    async updateByDocumentId(collection, documentId, patch) {
      assert.equal(collection, 'user_profiles')
      receivedDocumentId = documentId
      receivedPatch = patch
      return { ...existing, ...patch }
    },
    async update() {
      throw new Error('structured store must not perform a predicate profile scan')
    },
    async setByDocumentId() {
      setCalls += 1
    },
    async updateManyByFields() {
      return { updated: 0 }
    }
  }
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13T08:00:00.000Z' })

  const result = await api.handle({ action: 'saveMyProfile', nickname: '新昵称', avatarUrl: 'new.png' })

  assert.deepEqual(receivedPatch, {
    nickname: '新昵称',
    avatarUrl: 'new.png',
    profileUpdatedAt: '2026-07-13T08:00:00.000Z',
    updatedAt: '2026-07-13T08:00:00.000Z'
  })
  assert.equal(Object.hasOwn(receivedPatch, 'createdAt'), false)
  assert.equal(Object.hasOwn(receivedPatch, 'unrelated'), false)
  assert.equal(receivedDocumentId, 'cloud-profile-legacy')
  assert.equal(result.data.createdAt, '2026-07-01T00:00:00.000Z')
  assert.equal(setCalls, 0)
})

test('predicate fallback rechecks identity and active status before updating a member', async () => {
  const createAccountApi = loadCreateAccountApi()
  const listedMembership = {
    _id: 'member-1',
    id: 'member-1',
    openId: 'parent-1',
    status: 'active'
  }
  let checks
  const store = {
    async get() {
      return null
    },
    async add(collection, doc) {
      return doc
    },
    async list() {
      return [listedMembership]
    },
    async update(collection, predicate) {
      if (collection === 'family_members') {
        checks = {
          current: predicate(listedMembership),
          left: predicate({ ...listedMembership, status: 'left' }),
          otherUser: predicate({ ...listedMembership, openId: 'parent-2' })
        }
      }
      return null
    }
  }
  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13' })

  await api.handle({ action: 'saveMyProfile', nickname: '家长', avatarUrl: '' })

  assert.deepEqual(checks, { current: true, left: false, otherUser: false })
})

test('unknown actions return a descriptive error', async () => {
  const createAccountApi = loadCreateAccountApi()
  const api = createAccountApi({ store: createMemoryStore(), userId: 'parent-1', today: '2026-07-13' })

  assert.deepEqual(await api.handle({ action: 'nope' }), {
    ok: false,
    error: 'Unknown action: nope'
  })
})

function loadAccountIndex(cloud, overrides = {}) {
  const indexPath = path.resolve(__dirname, '../cloudfunctions/accountApi/index.js')
  let source = ''
  try {
    source = fs.readFileSync(indexPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  assert.notEqual(source, '')

  const exported = {}
  const requireForIndex = (request) => {
    if (request === 'wx-server-sdk') return cloud
    if (request === './core') {
      return {
        createAccountApi: overrides.createAccountApi || ((options) => ({
          handle: async (event) => ({ options, event })
        }))
      }
    }
    if (request === './cloudStore') {
      return {
        createCloudStore: overrides.createCloudStore || ((db) => ({ db })),
        ensureCollections: overrides.ensureCollections || (async () => ({ supported: true }))
      }
    }
    throw new Error(`Unexpected require: ${request}`)
  }
  const execute = new Function('require', 'exports', 'console', 'Date', source)
  execute(requireForIndex, exported, { warn: () => {}, error: () => {} }, overrides.Date || Date)
  return exported
}

test('account cloud entry uses server time and ignores client today', async () => {
  const initCalls = []
  const db = { name: 'db' }
  const ensured = []
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic-env',
    init: (options) => initCalls.push(options),
    getWXContext: () => ({ OPENID: 'parent-openid' }),
    database: () => db
  }
  const entry = loadAccountIndex(cloud, {
    Date: class FixedDate {
      toISOString() {
        return '2026-07-13T08:09:10.111Z'
      }
    },
    ensureCollections: async (receivedDb, collections) => {
      ensured.push({ db: receivedDb, collections })
      return { supported: true }
    }
  })

  const result = await entry.main({ action: 'getMyProfile', today: 'client-controlled-time' })

  assert.deepEqual(initCalls, [{ env: 'dynamic-env' }])
  assert.deepEqual(ensured, [{ db, collections: ['user_profiles', 'family_members'] }])
  assert.equal(result.options.userId, 'parent-openid')
  assert.equal(result.options.today, '2026-07-13T08:09:10.111Z')
})

test('account cloud entry reports unexpected collection initialization errors', async () => {
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic-env',
    init: () => {},
    getWXContext: () => ({ OPENID: 'parent-openid' }),
    database: () => ({})
  }
  const entry = loadAccountIndex(cloud, {
    ensureCollections: async () => {
      throw new Error('permission denied')
    }
  })

  assert.deepEqual(await entry.main({ action: 'getMyProfile' }), {
    ok: false,
    error: '账号服务初始化失败：permission denied'
  })
})
