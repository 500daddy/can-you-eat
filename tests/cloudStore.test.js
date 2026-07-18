const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { buildCloudUpdateData } = require('../cloudfunctions/foodApi/cloudStore')
const familyCloudStore = require('../cloudfunctions/familyApi/cloudStore')

test('cloud update data removes fields explicitly set to undefined', () => {
  const removeCommand = { __remove: true }
  const data = buildCloudUpdateData(
    { id: 'record-1', status: 'adult_only', note: 'old', _id: 'cloud-id' },
    { status: undefined, note: 'new' },
    removeCommand
  )

  assert.deepEqual(data, {
    id: 'record-1',
    status: removeCommand,
    note: 'new'
  })
})

test('family cloud store is self-contained for cloud function deployment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/familyApi/cloudStore.js'), 'utf8')

  assert.equal(typeof familyCloudStore.createCloudStore, 'function')
  assert.equal(typeof familyCloudStore.buildCloudUpdateData, 'function')
  assert.doesNotMatch(source, /require\(['"]\.\.\/foodApi/)
})

test('family cloud store can ensure deployment collections', async () => {
  const created = []
  const db = {
    createCollection: async (name) => {
      if (name === 'families') {
        throw new Error('createCollection:fail [ResourceUnavailable.ResourceExist] Table exist')
      }
      created.push(name)
    }
  }

  const result = await familyCloudStore.ensureCollections(db, ['families', 'family_members'])

  assert.deepEqual(result.existing, ['families'])
  assert.deepEqual(created, ['family_members'])
  assert.deepEqual(result.created, ['family_members'])
})

test('family cloud store treats common cloudbase exist errors as harmless', () => {
  assert.equal(familyCloudStore.isAlreadyExistsError(new Error('collection already exists')), true)
  assert.equal(familyCloudStore.isAlreadyExistsError(new Error('[ResourceUnavailable.ResourceExist] Table exist')), true)
  assert.equal(familyCloudStore.isAlreadyExistsError(new Error('permission denied')), false)
})

test('family cloud store updates all matching family records by fields', async () => {
  const whereCalls = []
  const updateCalls = []
  const db = {
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

  const result = await familyCloudStore.createCloudStore(db).updateManyByFields(
    'user_food_records',
    { familyId: 'personal-a', userId: 'user-a' },
    { familyId: 'formal-b' }
  )

  assert.deepEqual(whereCalls, [{
    collection: 'user_food_records',
    fields: { familyId: 'personal-a', userId: 'user-a' }
  }])
  assert.deepEqual(updateCalls, [{ data: { familyId: 'formal-b' } }])
  assert.deepEqual(result, { stats: { updated: 2 } })
})

test('family cloud store runs reads and writes on the cloud transaction', async () => {
  const calls = []
  const removeCommand = { __remove: true }
  const transaction = {
    collection(collection) {
      calls.push(`transaction:collection:${collection}`)
      return {
        skip() {
          return this
        },
        limit() {
          return {
            async get() {
              calls.push(`transaction:get:${collection}`)
              return { data: [{ _id: 'member-cloud-id', status: 'active', note: 'old' }] }
            }
          }
        },
        doc(id) {
          return {
            async update(input) {
              calls.push(`transaction:update:${collection}:${id}`)
              assert.equal(input.data.note, removeCommand)
            }
          }
        },
        async add() {
          calls.push(`transaction:add:${collection}`)
        }
      }
    }
  }
  const db = {
    command: {
      remove() {
        calls.push('root:command:remove')
        return removeCommand
      }
    },
    collection(collection) {
      calls.push(`root:collection:${collection}`)
      throw new Error('root collection must not be used in transaction')
    },
    async runTransaction(callback) {
      calls.push('root:runTransaction')
      return callback(transaction)
    }
  }

  const result = await familyCloudStore.createCloudStore(db).runTransaction(async (store) => {
    const member = await store.get('family_members', (item) => item.status === 'active')
    const updated = await store.update('family_members', (item) => item._id === member._id, { note: undefined })
    await store.add('family_audit_logs', { id: 'audit-1' })
    assert.equal(store.runTransaction, undefined)
    return updated
  })

  assert.equal(result._id, 'member-cloud-id')
  assert.equal(calls.includes('root:runTransaction'), true)
  assert.equal(calls.includes('root:command:remove'), true)
  assert.equal(calls.some((call) => call.startsWith('root:collection:')), false)
  assert.equal(calls.some((call) => call === 'transaction:get:family_members'), true)
  assert.equal(calls.some((call) => call === 'transaction:update:family_members:member-cloud-id'), true)
  assert.equal(calls.some((call) => call === 'transaction:add:family_audit_logs'), true)
})

test('family cloud store propagates cloud transaction failures', async () => {
  const expected = new Error('transaction aborted')
  const db = {
    async runTransaction(callback) {
      await callback({})
      throw expected
    }
  }

  await assert.rejects(
    familyCloudStore.createCloudStore(db).runTransaction(async () => 'unused'),
    expected
  )
})
