const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ACCOUNT_SESSION_KEY,
  PENDING_SYNC_KEY,
  createAccountService,
  resetAccountService
} = require('../utils/accountService')

function createStorage(seed = {}) {
  const values = { ...seed }
  return {
    get(key) {
      return values[key]
    },
    set(key, value) {
      values[key] = value
    },
    remove(key) {
      delete values[key]
    },
    values
  }
}

function createLoggedInSession(overrides = {}) {
  return {
    loggedIn: true,
    openId: 'user-a',
    profile: {
      openId: 'user-a',
      nickname: '小满妈妈',
      avatarUrl: 'cloud://avatar-a.jpg'
    },
    family: {
      family: { familyId: 'family-a' },
      membership: { role: 'owner' },
      members: []
    },
    syncStatus: 'synced',
    ...overrides
  }
}

test('returns an idle logged-out session when no account session is cached', () => {
  const service = createAccountService({ storage: createStorage() })

  assert.deepEqual(service.getSession(), { loggedIn: false, syncStatus: 'idle' })
})

test('login returns before avatar family and food background work finishes', async () => {
  const storage = createStorage()
  const scheduled = []
  const accountCalls = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openId: 'user-a' }),
    callAccount: async (input) => {
      accountCalls.push(input)
      return { openId: 'user-a', nickname: input.nickname, avatarUrl: input.avatarUrl || '' }
    },
    uploadAvatar: async () => 'cloud://avatar-a.jpg',
    getFamily: async () => ({ family: { familyId: 'family-a' }, membership: { role: 'owner' }, members: [] }),
    getLocalRecords: () => [{ id: 'record-a' }],
    mergeLocalRecords: async () => ({ added: 1 }),
    setCloudSession: () => {}
  })

  const session = await service.login({ nickname: '小满妈妈', avatarUrl: '/tmp/a.jpg' })

  assert.equal(session.loggedIn, true)
  assert.equal(session.syncStatus, 'pending')
  assert.equal(scheduled.length, 1)
  assert.equal(accountCalls.length, 1)
  await scheduled[0]()
  assert.equal(service.getSession().syncStatus, 'synced')
  assert.equal(accountCalls.length, 2)
})

test('concurrent sync resumes share one in-flight request', async () => {
  let releaseMerge
  const mergeGate = new Promise((resolve) => { releaseMerge = resolve })
  let mergeCalls = 0
  const storage = createStorage({
    [ACCOUNT_SESSION_KEY]: createLoggedInSession({ syncStatus: 'pending' }),
    [PENDING_SYNC_KEY]: {
      openId: 'user-a',
      nickname: '小满妈妈',
      avatarUrl: '',
      records: [{ id: 'record-a' }],
      stages: { avatar: false, family: false, food: true }
    }
  })
  const service = createAccountService({
    storage,
    mergeLocalRecords: async () => {
      mergeCalls += 1
      await mergeGate
    }
  })

  const first = service.resumePendingSync()
  const second = service.resumePendingSync()
  await new Promise((resolve) => setImmediate(resolve))
  releaseMerge()
  await Promise.all([first, second])

  assert.equal(mergeCalls, 1)
  assert.equal(service.getSession().syncStatus, 'synced')
})

test('logs in and keeps the original local snapshot pending when sync fails', async () => {
  const storage = createStorage()
  const events = []
  const scheduled = []
  const records = [{ id: 'record-local', status: 'deleted', updatedAt: '2026-07-13' }]
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openid: 'user-a' }),
    uploadAvatar: async (openId, avatarUrl) => {
      events.push(['upload', openId, avatarUrl])
      return 'cloud://account-avatars/user-a/a.jpg'
    },
    callAccount: async (input) => {
      events.push(['account', input])
      return {
        openId: 'user-a',
        nickname: input.nickname,
        avatarUrl: input.avatarUrl
      }
    },
    getFamily: async (input) => {
      events.push(['family', input])
      return { family: { familyId: 'family-a' }, membership: { role: 'owner' }, members: [] }
    },
    getLocalRecords: () => {
      events.push(['snapshot'])
      return records
    },
    mergeLocalRecords: async (input) => {
      events.push(['merge', input])
      throw new Error('network failed')
    },
    setCloudSession: (loggedIn) => events.push(['cloud', loggedIn])
  })

  const result = await service.login({ nickname: '小满妈妈', avatarUrl: '/tmp/a.jpg' })
  await scheduled[0]()
  const syncedSession = service.getSession()

  assert.equal(result.loggedIn, true)
  assert.equal(result.openId, 'user-a')
  assert.equal(syncedSession.syncStatus, 'pending')
  assert.deepEqual(storage.get(PENDING_SYNC_KEY), {
    openId: 'user-a',
    nickname: '小满妈妈',
    avatarUrl: '/tmp/a.jpg',
    records,
    stages: { avatar: false, family: false, food: true }
  })
  assert.deepEqual(storage.get(ACCOUNT_SESSION_KEY), syncedSession)
  assert.equal(events.some((item) => item[0] === 'cloud' && item[1] === true), true)
  assert.deepEqual(events.find((item) => item[0] === 'family')[1], {
    nickname: '小满妈妈',
    avatarUrl: ''
  })
  assert.equal(events.findIndex((item) => item[0] === 'snapshot') < events.findIndex((item) => item[0] === 'merge'), true)
})

test('clears pending records after a successful login sync', async () => {
  const storage = createStorage()
  const cloudStates = []
  const scheduled = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openId: 'user-a' }),
    uploadAvatar: async () => 'https://example.com/avatar.jpg',
    callAccount: async () => ({ nickname: '小满爸爸', avatarUrl: 'https://example.com/avatar.jpg' }),
    getFamily: async () => ({ family: { familyId: 'family-a' }, members: [] }),
    getLocalRecords: () => [{ id: 'record-a' }],
    mergeLocalRecords: async () => ({ added: 1 }),
    setCloudSession: (loggedIn) => cloudStates.push(loggedIn)
  })

  const result = await service.login({ nickname: '小满爸爸', avatarUrl: 'https://example.com/avatar.jpg' })
  await scheduled[0]()
  const syncedSession = service.getSession()

  assert.equal(result.openId, 'user-a')
  assert.equal(result.syncStatus, 'pending')
  assert.equal(syncedSession.syncStatus, 'synced')
  assert.equal(storage.get(PENDING_SYNC_KEY), undefined)
  assert.deepEqual(cloudStates, [true])
})

test('same account login syncs preserved pending records after logout cleared the local snapshot', async () => {
  const storage = createStorage()
  const scheduled = []
  let localRecords = [
    { id: 'record-old', note: '退出前记录', updatedAt: '2026-07-12' },
    { note: '没有 id 的旧记录', updatedAt: '2026-07-12' }
  ]
  let shouldFailSync = true
  const mergedBatches = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openid: 'user-a' }),
    uploadAvatar: async () => 'cloud://avatar-a.jpg',
    callAccount: async () => ({ nickname: '小满妈妈', avatarUrl: 'cloud://avatar-a.jpg' }),
    getFamily: async () => ({ family: { familyId: 'family-a' } }),
    getLocalRecords: () => localRecords,
    mergeLocalRecords: async (records) => {
      mergedBatches.push(records)
      if (shouldFailSync) throw new Error('network failed')
    },
    setCloudSession: (loggedIn) => {
      if (!loggedIn) localRecords = []
    }
  })

  await service.login({ nickname: '小满妈妈', avatarUrl: 'cloud://avatar-a.jpg' })
  await scheduled.shift()()
  service.logout()
  shouldFailSync = false
  await service.login({ nickname: '小满妈妈', avatarUrl: 'cloud://avatar-a.jpg' })
  await scheduled.shift()()
  const relogged = service.getSession()

  assert.equal(relogged.syncStatus, 'synced')
  assert.deepEqual(mergedBatches[1], [
    { id: 'record-old', note: '退出前记录', updatedAt: '2026-07-12' },
    { note: '没有 id 的旧记录', updatedAt: '2026-07-12' }
  ])
  assert.equal(storage.get(PENDING_SYNC_KEY), undefined)
})

test('same account pending merge keeps newer duplicates and every id-less record', async () => {
  const storage = createStorage({
    [PENDING_SYNC_KEY]: {
      openId: 'user-a',
      records: [
        { id: 'record-a', note: '旧 pending 较新', updatedAt: '2026-07-13' },
        { id: 'record-b', note: '旧 pending 较旧', updatedAt: '2026-07-11' },
        { note: 'pending 无 id', updatedAt: '2026-07-10' }
      ]
    }
  })
  let mergedRecords
  const scheduled = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openid: 'user-a' }),
    uploadAvatar: async () => '',
    callAccount: async () => ({ nickname: '家长', avatarUrl: '' }),
    getFamily: async () => ({}),
    getLocalRecords: () => [
      { id: 'record-a', note: '当前快照较旧', updatedAt: '2026-07-12' },
      { id: 'record-b', note: '当前快照较新', updatedAt: '2026-07-13' },
      { note: '当前快照无 id', updatedAt: '2026-07-13' }
    ],
    mergeLocalRecords: async (records) => { mergedRecords = records },
    setCloudSession: () => {}
  })

  await service.login({ nickname: '家长', avatarUrl: '' })
  await scheduled[0]()

  assert.deepEqual(mergedRecords, [
    { id: 'record-a', note: '旧 pending 较新', updatedAt: '2026-07-13' },
    { id: 'record-b', note: '当前快照较新', updatedAt: '2026-07-13' },
    { note: 'pending 无 id', updatedAt: '2026-07-10' },
    { note: '当前快照无 id', updatedAt: '2026-07-13' }
  ])
})

test('login never merges pending records owned by a different account', async () => {
  const storage = createStorage({
    [PENDING_SYNC_KEY]: {
      openId: 'user-b',
      records: [{ id: 'private-record-b', updatedAt: '2026-07-13' }]
    }
  })
  let mergedRecords
  const scheduled = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openid: 'user-a' }),
    uploadAvatar: async () => '',
    callAccount: async () => ({ nickname: '家长 A', avatarUrl: '' }),
    getFamily: async () => ({}),
    getLocalRecords: () => [{ id: 'record-a', updatedAt: '2026-07-12' }],
    mergeLocalRecords: async (records) => { mergedRecords = records },
    setCloudSession: () => {}
  })

  await service.login({ nickname: '家长 A', avatarUrl: '' })
  await scheduled[0]()

  assert.deepEqual(mergedRecords, [{ id: 'record-a', updatedAt: '2026-07-12' }])
  assert.equal(mergedRecords.some((item) => item.id === 'private-record-b'), false)
})

test('retries pending sync only for the current logged-in account', async () => {
  const session = createLoggedInSession({ syncStatus: 'pending' })
  const otherStorage = createStorage({
    [ACCOUNT_SESSION_KEY]: session,
    [PENDING_SYNC_KEY]: { openId: 'user-b', records: [{ id: 'record-b' }] }
  })
  let mergeCalls = 0
  const otherService = createAccountService({
    storage: otherStorage,
    mergeLocalRecords: async () => { mergeCalls += 1 }
  })

  assert.deepEqual(await otherService.retryPendingSync(), session)
  assert.equal(mergeCalls, 0)
  assert.equal(otherStorage.get(PENDING_SYNC_KEY).openId, 'user-b')

  const ownStorage = createStorage({
    [ACCOUNT_SESSION_KEY]: session,
    [PENDING_SYNC_KEY]: { openId: 'user-a', records: [{ id: 'record-a' }] }
  })
  const ownService = createAccountService({
    storage: ownStorage,
    mergeLocalRecords: async (records) => {
      assert.deepEqual(records, [{ id: 'record-a' }])
      mergeCalls += 1
    }
  })

  const retried = await ownService.retryPendingSync()

  assert.equal(retried.syncStatus, 'synced')
  assert.equal(ownStorage.get(PENDING_SYNC_KEY), undefined)
  assert.equal(mergeCalls, 1)
})

test('updates a logged-in profile and rejects profile updates when logged out', async () => {
  const loggedOut = createAccountService({ storage: createStorage() })
  await assert.rejects(() => loggedOut.updateProfile({ nickname: '妈妈' }), /请先登录/)

  const storage = createStorage({ [ACCOUNT_SESSION_KEY]: createLoggedInSession() })
  const calls = []
  const service = createAccountService({
    storage,
    uploadAvatar: async (openId, avatarUrl) => {
      calls.push(['upload', openId, avatarUrl])
      return 'cloud://avatar-new.jpg'
    },
    callAccount: async (input) => {
      calls.push(['account', input])
      return { openId: 'user-a', nickname: input.nickname, avatarUrl: input.avatarUrl }
    }
  })

  const result = await service.updateProfile({ nickname: '小满外婆', avatarUrl: '/tmp/new.png' })

  assert.equal(result.profile.nickname, '小满外婆')
  assert.equal(result.profile.avatarUrl, 'cloud://avatar-new.jpg')
  assert.deepEqual(calls[1][1], {
    action: 'saveMyProfile',
    nickname: '小满外婆',
    avatarUrl: 'cloud://avatar-new.jpg'
  })
})

test('refresh keeps cached profile and family when their remote reads fail', async () => {
  const oldSession = createLoggedInSession()
  const storage = createStorage({ [ACCOUNT_SESSION_KEY]: oldSession })
  const service = createAccountService({
    storage,
    callAccount: async () => { throw new Error('profile unavailable') },
    getFamily: async (input) => {
      assert.equal(input.nickname, oldSession.profile.nickname)
      throw new Error('family unavailable')
    }
  })

  const result = await service.refresh()

  assert.deepEqual(result.profile, oldSession.profile)
  assert.deepEqual(result.family, oldSession.family)
  assert.equal(result.familyLoadError, true)
})

test('refresh saves new profile and clears family load error after success', async () => {
  const storage = createStorage({
    [ACCOUNT_SESSION_KEY]: createLoggedInSession({ familyLoadError: true })
  })
  const service = createAccountService({
    storage,
    callAccount: async () => ({ nickname: '新昵称', avatarUrl: 'cloud://new.jpg' }),
    getFamily: async (input) => ({ family: { familyId: 'family-b', name: input.nickname } })
  })

  const result = await service.refresh()

  assert.equal(result.profile.nickname, '新昵称')
  assert.equal(result.family.family.familyId, 'family-b')
  assert.equal(result.familyLoadError, false)
})

test('logout clears the readable account session but preserves account-owned pending records', () => {
  const pending = { openId: 'user-a', records: [{ id: 'record-a' }] }
  const storage = createStorage({
    [ACCOUNT_SESSION_KEY]: createLoggedInSession(),
    [PENDING_SYNC_KEY]: pending
  })
  const cloudStates = []
  const service = createAccountService({
    storage,
    setCloudSession: (loggedIn) => cloudStates.push(loggedIn)
  })

  const result = service.logout()

  assert.deepEqual(result, { loggedIn: false, syncStatus: 'idle' })
  assert.equal(storage.get(ACCOUNT_SESSION_KEY), undefined)
  assert.deepEqual(storage.get(PENDING_SYNC_KEY), pending)
  assert.deepEqual(cloudStates, [false])
})

test('default adapters call login and accountApi and upload a local avatar to the account path', async () => {
  const originalWx = global.wx
  const cloudCalls = []
  const uploads = []
  const storage = createStorage()
  try {
    global.wx = {
      cloud: {
        callFunction: async (input) => {
          cloudCalls.push(input)
          if (input.name === 'login') return { result: { openid: 'user-default' } }
          return {
            result: {
              ok: true,
              data: {
                openId: 'user-default',
                nickname: input.data.nickname,
                avatarUrl: input.data.avatarUrl
              }
            }
          }
        },
        uploadFile: async (input) => {
          uploads.push(input)
          return { fileID: 'cloud://uploaded-avatar.png' }
        }
      }
    }
    const service = createAccountService({
      storage,
      schedule: (task) => task(),
      getFamily: async () => ({ family: { familyId: 'family-default' } }),
      getLocalRecords: () => [],
      mergeLocalRecords: async () => {},
      setCloudSession: () => {}
    })

    await service.login({ nickname: '微信家长', avatarUrl: '/tmp/avatar.PNG' })
    await service.resumePendingSync()

    assert.deepEqual(cloudCalls.map((item) => item.name), ['login', 'accountApi', 'accountApi'])
    assert.deepEqual(cloudCalls[0].data, {})
    assert.equal(cloudCalls[1].data.action, 'saveMyProfile')
    assert.equal(Object.hasOwn(cloudCalls[1].data, 'avatarUrl'), false)
    assert.equal(cloudCalls[2].data.avatarUrl, 'cloud://uploaded-avatar.png')
    assert.equal(uploads[0].filePath, '/tmp/avatar.PNG')
    assert.match(uploads[0].cloudPath, /^account-avatars\/user-default\/\d+\.png$/)
  } finally {
    global.wx = originalWx
    resetAccountService()
  }
})

test('default avatar adapter reuses cloud and http addresses without uploading', async () => {
  const originalWx = global.wx
  let uploadCount = 0
  try {
    global.wx = {
      cloud: {
        callFunction: async (input) => input.name === 'login'
          ? { result: { openid: 'user-default' } }
          : { result: { ok: true, data: input.data } },
        uploadFile: async () => {
          uploadCount += 1
          return { fileID: 'cloud://unexpected' }
        }
      }
    }
    const service = createAccountService({
      storage: createStorage(),
      getFamily: async () => ({}),
      getLocalRecords: () => [],
      mergeLocalRecords: async () => {},
      setCloudSession: () => {}
    })

    const result = await service.login({ nickname: '微信家长', avatarUrl: 'https://example.com/avatar.webp' })

    assert.equal(result.profile.avatarUrl, 'https://example.com/avatar.webp')
    assert.equal(uploadCount, 0)
  } finally {
    global.wx = originalWx
    resetAccountService()
  }
})
