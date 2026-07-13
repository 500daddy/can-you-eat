const test = require('node:test')
const assert = require('node:assert/strict')

function loadAccountCloudStore() {
  let accountCloudStore = {}
  try {
    accountCloudStore = require('../cloudfunctions/accountApi/cloudStore')
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes('accountApi/cloudStore')) {
      throw error
    }
  }
  assert.equal(typeof accountCloudStore.createCloudStore, 'function')
  return accountCloudStore
}

test('account cloud store is self-contained for cloud function deployment', () => {
  const accountCloudStore = loadAccountCloudStore()
  const source = require('node:fs').readFileSync(require.resolve('../cloudfunctions/accountApi/cloudStore'), 'utf8')

  assert.equal(typeof accountCloudStore.buildCloudUpdateData, 'function')
  assert.equal(typeof accountCloudStore.ensureCollections, 'function')
  const store = accountCloudStore.createCloudStore({})
  assert.equal(typeof store.getByFields, 'function')
  assert.equal(typeof store.listByFields, 'function')
  assert.equal(typeof store.updateManyByFields, 'function')
  assert.equal(typeof store.updateByDocumentId, 'function')
  assert.equal(typeof store.setByDocumentId, 'function')
  assert.doesNotMatch(source, /require\(['"]\.\.\/(?:familyApi|foodApi)/)
})

test('account cloud store treats existing collections as initialized', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const created = []
  const db = {
    createCollection: async (name) => {
      if (name === 'user_profiles') {
        throw new Error('createCollection:fail [ResourceUnavailable.ResourceExist] Table exist')
      }
      if (name === 'family_members') {
        throw new Error('DATABASE_COLLECTION_ALREADY_EXIST')
      }
      created.push(name)
    }
  }

  const result = await accountCloudStore.ensureCollections(db, ['user_profiles', 'family_members'])

  assert.deepEqual(result.existing, ['user_profiles', 'family_members'])
  assert.deepEqual(result.created, [])
  assert.deepEqual(created, [])
})

test('account cloud store paginates structured reads with database where fields', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: index, active: index % 2 === 0 }))
  const requestedSkips = []
  const receivedFields = []
  const db = {
    collection: () => ({
      where(fields) {
        receivedFields.push(fields)
        return {
          skip(skip) {
            requestedSkips.push(skip)
            return {
              limit: (limit) => ({
                get: async () => ({ data: rows.slice(skip, skip + limit) })
              })
            }
          }
        }
      }
    })
  }

  const fields = { openId: 'parent-1', status: 'active' }
  const result = await accountCloudStore.createCloudStore(db).listByFields('family_members', fields)

  assert.equal(result.length, 205)
  assert.deepEqual(receivedFields, [fields])
  assert.deepEqual(requestedSkips, [0, 100, 200])
})

test('account cloud store paginates predicate reads in batches of 100', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: index, active: index % 2 === 0 }))
  const requestedSkips = []
  const db = {
    collection: () => ({
      skip(skip) {
        requestedSkips.push(skip)
        return {
          limit: (limit) => ({
            get: async () => ({ data: rows.slice(skip, skip + limit) })
          })
        }
      }
    })
  }

  const result = await accountCloudStore.createCloudStore(db).list(
    'family_members',
    (item) => item.active
  )

  assert.equal(result.length, 103)
  assert.deepEqual(result.map((item) => item.id), rows.filter((item) => item.active).map((item) => item.id))
  assert.deepEqual(requestedSkips, [0, 100, 200])
})

test('account cloud store gets profiles with a structured database query', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const fields = { openId: 'parent-1' }
  let receivedFields
  const profile = { _id: 'profile_parent-1', openId: 'parent-1' }
  const db = {
    collection: () => ({
      where(nextFields) {
        receivedFields = nextFields
        return {
          limit: (limit) => ({
            get: async () => ({ data: limit === 1 ? [profile] : [] })
          })
        }
      }
    })
  }

  const result = await accountCloudStore.createCloudStore(db).getByFields('user_profiles', fields)

  assert.equal(receivedFields, fields)
  assert.deepEqual(result, profile)
})

test('account cloud store updates active members once with structured fields', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const whereCalls = []
  const updateCalls = []
  let removeCalls = 0
  const db = {
    command: {
      remove: () => {
        removeCalls += 1
        return { __remove: true }
      }
    },
    collection: (collection) => ({
      where(fields) {
        whereCalls.push({ collection, fields })
        return {
          async update(input) {
            updateCalls.push(input)
            return { stats: { updated: 2 } }
          }
        }
      }
    })
  }
  const fields = { openId: 'parent-1', status: 'active' }
  const patch = { nickname: '家长', avatarUrl: 'avatar.png', updatedAt: 'server-time' }

  const result = await accountCloudStore.createCloudStore(db).updateManyByFields(
    'family_members',
    fields,
    patch
  )

  assert.deepEqual(whereCalls, [{ collection: 'family_members', fields }])
  assert.deepEqual(updateCalls, [{ data: patch }])
  assert.deepEqual(result, { stats: { updated: 2 } })
  assert.equal(removeCalls, 0)
})

test('account cloud store sets profiles by deterministic document id', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const docCalls = []
  const setCalls = []
  const db = {
    collection: (collection) => ({
      doc(documentId) {
        docCalls.push({ collection, documentId })
        return {
          async set(input) {
            setCalls.push(input)
          }
        }
      }
    })
  }
  const profile = { id: 'profile_parent-1', openId: 'parent-1', createdAt: 'server-time' }

  const result = await accountCloudStore.createCloudStore(db).setByDocumentId(
    'user_profiles',
    'profile_parent-1',
    profile
  )

  assert.deepEqual(docCalls, [{ collection: 'user_profiles', documentId: 'profile_parent-1' }])
  assert.deepEqual(setCalls, [{ data: profile }])
  assert.deepEqual(result, profile)
})

test('account cloud store patches profiles directly by document id without scanning', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const docCalls = []
  const updateCalls = []
  const db = {
    collection: (collection) => ({
      skip() {
        throw new Error('direct document update must not scan with skip/get')
      },
      doc(documentId) {
        docCalls.push({ collection, documentId })
        return {
          async update(input) {
            updateCalls.push(input)
            return { stats: { updated: 1 } }
          }
        }
      }
    })
  }
  const patch = {
    nickname: '新昵称',
    avatarUrl: 'new.png',
    profileUpdatedAt: 'server-time',
    updatedAt: 'server-time'
  }

  const result = await accountCloudStore.createCloudStore(db).updateByDocumentId(
    'user_profiles',
    'profile_parent-1',
    patch
  )

  assert.deepEqual(docCalls, [{ collection: 'user_profiles', documentId: 'profile_parent-1' }])
  assert.deepEqual(updateCalls, [{ data: patch }])
  assert.deepEqual(result, { _id: 'profile_parent-1', ...patch })
  assert.equal(Object.hasOwn(updateCalls[0].data, 'createdAt'), false)
})

test('account cloud store removes fields explicitly updated to undefined', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const removeCommand = { __remove: true }
  let updateData
  const db = {
    command: { remove: () => removeCommand },
    collection: () => ({
      skip: () => ({
        limit: () => ({
          get: async () => ({
            data: [{
              _id: 'cloud-1',
              id: 'profile-1',
              avatarUrl: 'old.png',
              createdAt: 'old-created-at',
              unrelated: 'keep-on-server'
            }]
          })
        })
      }),
      doc: () => ({
        update: async ({ data }) => {
          updateData = data
        }
      })
    })
  }

  const result = await accountCloudStore.createCloudStore(db).update(
    'user_profiles',
    (item) => item.id === 'profile-1',
    { avatarUrl: undefined }
  )

  assert.deepEqual(updateData, { avatarUrl: removeCommand })
  assert.deepEqual(result, {
    _id: 'cloud-1',
    id: 'profile-1',
    createdAt: 'old-created-at',
    unrelated: 'keep-on-server'
  })
})

test('account cloud store rejects undefined removal when the remove command is unavailable', async () => {
  const accountCloudStore = loadAccountCloudStore()
  const db = {
    collection: () => ({
      skip: () => ({
        limit: () => ({
          get: async () => ({ data: [{ _id: 'cloud-1', id: 'profile-1', avatarUrl: 'old.png' }] })
        })
      })
    })
  }

  await assert.rejects(
    accountCloudStore.createCloudStore(db).update(
      'user_profiles',
      (item) => item.id === 'profile-1',
      { avatarUrl: undefined }
    ),
    /remove command.*avatarUrl/i
  )
})

test('account collection initialization can continue when createCollection is unavailable', async () => {
  const accountCloudStore = loadAccountCloudStore()

  const result = await accountCloudStore.ensureCollections({}, ['user_profiles', 'family_members'])

  assert.deepEqual(result, {
    supported: false,
    created: [],
    existing: [],
    skipped: ['user_profiles', 'family_members']
  })
})
