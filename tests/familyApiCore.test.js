const test = require('node:test')
const assert = require('node:assert/strict')

const { createFamilyApi, roleCan } = require('../cloudfunctions/familyApi/core')
const { createMemoryStore } = require('../cloudfunctions/foodApi/core')

test('creates a default family and owner membership for a new user', async () => {
  const store = createMemoryStore()
  const api = createFamilyApi({ store, userId: 'user-a', today: '2026-07-09' })

  const family = await api.handle({ action: 'getMyFamily' })

  assert.equal(family.ok, true)
  assert.equal(family.data.family.name, '宝宝的小厨房')
  assert.equal(family.data.members[0].openId, 'user-a')
  assert.equal(family.data.members[0].role, 'owner')
  assert.equal(family.data.membership.role, 'owner')
  assert.equal(family.data.family.kind, 'personal')
})

test('default family becomes permanently formal after creating an invite', async () => {
  const store = createMemoryStore()
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const initial = await api.handle({ action: 'getMyFamily' })

  await api.handle({ action: 'createInvite' })
  const family = await store.get('families', (item) => item.familyId === initial.data.family.familyId)
  const again = await api.handle({ action: 'getMyFamily' })

  assert.equal(family.kind, 'formal')
  assert.equal(family.formalizedReason, 'invite_created')
  assert.equal(again.data.family.kind, 'formal')
})

test('a user in a formal family cannot accept another family invite', async () => {
  const store = createMemoryStore()
  const first = createFamilyApi({ store, userId: 'first-owner', today: '2026-07-14' })
  const second = createFamilyApi({ store, userId: 'second-owner', today: '2026-07-14' })
  await first.handle({ action: 'getMyFamily' })
  await second.handle({ action: 'getMyFamily' })
  await first.handle({ action: 'createInvite' })
  const secondInvite = await second.handle({ action: 'createInvite' })

  const rejected = await first.handle({ action: 'joinFamilyByInvite', inviteId: secondInvite.data.inviteId })

  assert.equal(rejected.ok, false)
  assert.equal(rejected.code, 'ALREADY_IN_FORMAL_FAMILY')
  assert.match(rejected.error, /已经加入一个家庭/)
})

test('joining from a personal family keeps its baby settings when the target has none', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const member = createFamilyApi({ store, userId: 'member', today: '2026-07-14' })
  const ownerFamily = await owner.handle({ action: 'getMyFamily' })
  const personalFamily = await member.handle({ action: 'getMyFamily' })
  await store.add('family_settings', {
    id: 'settings-member',
    familyId: personalFamily.data.family.familyId,
    babyName: '小满'
  })
  const invite = await owner.handle({ action: 'createInvite' })

  await member.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  const settings = await store.get('family_settings', (item) => item.familyId === ownerFamily.data.family.familyId)
  assert.equal(settings.babyName, '小满')
})

test('uses three role permissions for family operations', () => {
  assert.equal(roleCan('owner', 'manage_members'), true)
  assert.equal(roleCan('admin', 'invite_members'), true)
  assert.equal(roleCan('admin', 'manage_members'), false)
  assert.equal(roleCan('member', 'edit_food_records'), true)
  assert.equal(roleCan('member', 'manage_members'), false)
  assert.equal(roleCan('admin', 'edit_baby_settings'), false)
})

test('owner can invite a member and invited user can join the family', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  const member = createFamilyApi({ store, userId: 'member-a', today: '2026-07-09' })
  await owner.handle({ action: 'getMyFamily' })

  const invite = await owner.handle({ action: 'createInvite' })
  const joined = await member.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })
  const family = await member.handle({ action: 'getMyFamily' })

  assert.equal(joined.ok, true)
  assert.equal(family.data.members.some((item) => item.openId === 'member-a'), true)
})

test('invite preview hides private ids and accepted invites are idempotent for the recipient', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const member = createFamilyApi({ store, userId: 'member', today: '2026-07-14' })
  await owner.handle({ action: 'getMyFamily', nickname: '小满妈妈' })
  const invite = await owner.handle({ action: 'createInvite' })

  const preview = await member.handle({ action: 'getInvitePreview', inviteId: invite.data.inviteId })
  const first = await member.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId, nickname: '外婆' })
  const second = await member.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId, nickname: '外婆' })

  assert.deepEqual(Object.keys(preview.data).sort(), ['expiresAt', 'familyName', 'inviterName', 'memberCount', 'status'])
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(second.data.familyId, first.data.familyId)
})

test('an invite already used by another account cannot be accepted', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const first = createFamilyApi({ store, userId: 'first', today: '2026-07-14' })
  const second = createFamilyApi({ store, userId: 'second', today: '2026-07-14' })
  await owner.handle({ action: 'getMyFamily' })
  const invite = await owner.handle({ action: 'createInvite' })
  await first.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  const rejected = await second.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  assert.equal(rejected.ok, false)
  assert.equal(rejected.code, 'INVITE_USED')
})

test('invited user can replace an empty default family and keep own food records', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  const invited = createFamilyApi({ store, userId: 'member-a', today: '2026-07-09' })
  const ownerFamily = await owner.handle({ action: 'getMyFamily' })
  const defaultFamily = await invited.handle({ action: 'getMyFamily' })
  await store.add('user_food_records', {
    id: 'record-a',
    userId: 'member-a',
    familyId: defaultFamily.data.family.familyId,
    foodBaseId: 'carrot'
  })

  const invite = await owner.handle({ action: 'createInvite' })
  const joined = await invited.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })
  const records = await store.list('user_food_records', (item) => item.id === 'record-a')

  assert.equal(joined.ok, true)
  assert.equal(joined.data.familyId, ownerFamily.data.family.familyId)
  assert.equal(records[0].familyId, ownerFamily.data.family.familyId)
})

test('owner can promote a member to admin but admin cannot modify owner', async () => {
  const store = createMemoryStore()
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-09' })
  const member = createFamilyApi({ store, userId: 'member-a', today: '2026-07-09' })
  await owner.handle({ action: 'getMyFamily' })
  const invite = await owner.handle({ action: 'createInvite' })
  await member.handle({ action: 'joinFamilyByInvite', inviteId: invite.data.inviteId })

  const updated = await owner.handle({ action: 'updateMemberRole', openId: 'member-a', role: 'admin' })
  const forbidden = await member.handle({ action: 'updateMemberRole', openId: 'owner', role: 'member' })

  assert.equal(updated.data.role, 'admin')
  assert.equal(forbidden.ok, false)
  assert.match(forbidden.error, /权限/)
})

async function seedFamily(store, members) {
  await store.add('families', {
    id: 'family-shared',
    familyId: 'family-shared',
    name: '小满家',
    ownerOpenId: 'owner',
    kind: 'formal',
    status: 'active'
  })
  for (const member of members) {
    await store.add('family_members', {
      id: `membership-${member.openId}`,
      familyId: 'family-shared',
      nickname: member.nickname || member.openId,
      avatarUrl: member.avatarUrl || '',
      status: 'active',
      ...member
    })
  }
}

function withConcurrentMemberUpdates(store, expectedUpdates = 2) {
  let waiting = 0
  let release
  const ready = new Promise((resolve) => {
    release = resolve
  })

  return {
    ...store,
    async update(collection, predicate, patch) {
      if (collection === 'family_members' && patch.status === 'inactive') {
        waiting += 1
        if (waiting === expectedUpdates) release()
        await ready
      }
      return store.update(collection, predicate, patch)
    }
  }
}

function createRollbackTransactionStore(baseStore, { failAudit = false } = {}) {
  let transactionCalls = 0
  let rootCalls = 0

  return {
    get transactionCalls() {
      return transactionCalls
    },
    get rootCalls() {
      return rootCalls
    },
    async runTransaction(callback) {
      transactionCalls += 1
      const stagedUpdates = []
      const stagedSets = []
      const transactionStore = {
        async getById(collection, id) {
          const item = await baseStore.get(collection, (entry) => entry._id === id)
          const staged = stagedUpdates.find((entry) => entry.collection === collection && entry.id === id)
          return staged && item ? { ...item, ...staged.patch } : item
        },
        async updateById(collection, id, patch) {
          stagedUpdates.push({ collection, id, patch })
          return patch
        },
        async setById(collection, id, doc) {
          if (failAudit && collection === 'family_audit_logs') throw new Error('transaction audit unavailable')
          stagedSets.push({ collection, id, doc })
          return doc
        }
      }

      const result = await callback(transactionStore)
      for (const entry of stagedUpdates) {
        await baseStore.update(entry.collection, (item) => item._id === entry.id, entry.patch)
      }
      for (const entry of stagedSets) {
        await baseStore.add(entry.collection, { ...entry.doc, _id: entry.id })
      }
      return result
    },
    async get(collection, predicate) {
      rootCalls += 1
      return baseStore.get(collection, predicate)
    },
    async list(collection, predicate) {
      rootCalls += 1
      return baseStore.list(collection, predicate)
    },
    async update() {
      rootCalls += 1
      throw new Error('root update used outside transaction')
    },
    async add() {
      rootCalls += 1
      throw new Error('root add used outside transaction')
    }
  }
}

test('owner removes an active member without deleting family records and writes an audit log', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner', nickname: '小满妈妈', avatarUrl: 'owner.png' },
    { openId: 'member-a', role: 'member', nickname: '外婆', avatarUrl: 'member.png' }
  ])
  await store.add('user_food_records', { id: 'food-old', familyId: 'family-shared', userId: 'member-a' })
  await store.add('purchase_plans', { id: 'purchase-old', familyId: 'family-shared', userId: 'member-a' })
  await store.add('recognition_logs', { id: 'recognition-old', familyId: 'family-shared', userId: 'member-a' })
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const removed = await owner.handle({ action: 'removeMember', openId: 'member-a' })
  const membership = await store.get('family_members', (item) => item.id === 'membership-member-a')
  const logs = await store.list('family_audit_logs')
  const nextFamily = await createFamilyApi({ store, userId: 'member-a', today: '2026-07-17' })
    .handle({ action: 'getMyFamily' })

  assert.equal(removed.ok, true)
  assert.equal(membership.status, 'inactive')
  assert.equal(membership.leftAt, '2026-07-16')
  assert.equal(membership.updatedAt, '2026-07-16')
  assert.equal((await store.get('user_food_records', (item) => item.id === 'food-old')).familyId, 'family-shared')
  assert.equal((await store.get('purchase_plans', (item) => item.id === 'purchase-old')).familyId, 'family-shared')
  assert.equal((await store.get('recognition_logs', (item) => item.id === 'recognition-old')).familyId, 'family-shared')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].familyId, 'family-shared')
  assert.equal(logs[0].action, 'member_removed')
  assert.equal(logs[0].targetType, 'family_member')
  assert.equal(logs[0].targetId, 'member-a')
  assert.equal(logs[0].actorOpenId, 'owner')
  assert.equal(logs[0].actorName, '小满妈妈')
  assert.equal(logs[0].actorAvatar, 'owner.png')
  assert.deepEqual(logs[0].before, { role: 'member', status: 'active' })
  assert.deepEqual(logs[0].after, { role: 'member', status: 'inactive' })
  assert.match(logs[0].summary, /移出.*外婆/)
  assert.equal(logs[0].createdAt, '2026-07-16')
  assert.equal(nextFamily.ok, true)
  assert.equal(nextFamily.data.family.kind, 'personal')
  assert.notEqual(nextFamily.data.family.familyId, 'family-shared')
  assert.equal(nextFamily.data.membership.role, 'owner')
})

for (const role of ['admin', 'member']) {
  test(`${role} can leave a family and gets a new personal family next time`, async () => {
    const store = createMemoryStore()
    await seedFamily(store, [
      { openId: 'owner', role: 'owner' },
      { openId: `${role}-a`, role, nickname: `${role} name`, avatarUrl: `${role}.png` }
    ])
    const api = createFamilyApi({ store, userId: `${role}-a`, today: '2026-07-16' })

    const left = await api.handle({ action: 'leaveFamily' })
    const oldMembership = await store.get('family_members', (item) => item.id === `membership-${role}-a`)
    const logs = await store.list('family_audit_logs')
    const nextFamily = await api.handle({ action: 'getMyFamily' })

    assert.equal(left.ok, true)
    assert.equal(oldMembership.status, 'inactive')
    assert.equal(oldMembership.leftAt, '2026-07-16')
    assert.equal(logs.length, 1)
    assert.equal(logs[0].action, 'member_left')
    assert.equal(logs[0].targetType, 'family_member')
    assert.equal(logs[0].targetId, `${role}-a`)
    assert.equal(logs[0].actorOpenId, `${role}-a`)
    assert.equal(logs[0].actorName, `${role} name`)
    assert.equal(logs[0].actorAvatar, `${role}.png`)
    assert.deepEqual(logs[0].before, { role, status: 'active' })
    assert.deepEqual(logs[0].after, { role, status: 'inactive' })
    assert.match(logs[0].summary, /退出/)
    assert.equal(nextFamily.data.family.kind, 'personal')
    assert.notEqual(nextFamily.data.family.familyId, 'family-shared')
  })
}

test('owner cannot leave a family', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [{ openId: 'owner', role: 'owner' }])
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })

  assert.equal(result.ok, false)
  assert.match(result.error, /创建者不能退出/)
})

test('unknown roles cannot leave a family through the fallback path', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'viewer-a', role: 'viewer' }
  ])
  const api = createFamilyApi({ store, userId: 'viewer-a', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })
  const membership = await store.get('family_members', (item) => item.openId === 'viewer-a')

  assert.equal(result.ok, false)
  assert.match(result.error, /没有权限/)
  assert.equal(membership.status, 'active')
  assert.equal((await store.list('family_audit_logs')).length, 0)
})

test('admin cannot remove another member', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'admin-a', role: 'admin' },
    { openId: 'member-a', role: 'member' }
  ])
  const api = createFamilyApi({ store, userId: 'admin-a', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, false)
  assert.match(result.error, /权限/)
})

test('owner can remove an admin', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'admin-a', role: 'admin' }
  ])
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'admin-a' })

  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'inactive')
})

test('member and non-member cannot remove a family member', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' },
    { openId: 'member-b', role: 'member' }
  ])

  const memberResult = await createFamilyApi({ store, userId: 'member-a', today: '2026-07-16' })
    .handle({ action: 'removeMember', openId: 'member-b' })
  const outsiderResult = await createFamilyApi({ store, userId: 'outsider', today: '2026-07-16' })
    .handle({ action: 'removeMember', openId: 'member-b' })

  assert.equal(memberResult.ok, false)
  assert.match(memberResult.error, /权限/)
  assert.equal(outsiderResult.ok, false)
  assert.match(outsiderResult.error, /请先加入家庭/)
})

test('owner cannot remove self or another owner', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'owner-b', role: 'owner' }
  ])
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const self = await api.handle({ action: 'removeMember', openId: 'owner' })
  const otherOwner = await api.handle({ action: 'removeMember', openId: 'owner-b' })

  assert.equal(self.ok, false)
  assert.match(self.error, /不能移出自己/)
  assert.equal(otherOwner.ok, false)
  assert.match(otherOwner.error, /不能移出创建者/)
})

test('removeMember clearly rejects a missing or inactive target', async () => {
  const store = createMemoryStore()
  await seedFamily(store, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member', status: 'inactive' }
  ])
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const missing = await api.handle({ action: 'removeMember', openId: 'missing' })
  const inactive = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(missing.ok, false)
  assert.match(missing.error, /成员不存在/)
  assert.equal(inactive.ok, false)
  assert.match(inactive.error, /成员已退出/)
})

test('removeMember treats a lost conditional update as already exited and skips audit', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const store = {
    ...baseStore,
    async update(collection, predicate, patch) {
      if (collection === 'family_members' && patch.status === 'inactive') return null
      return baseStore.update(collection, predicate, patch)
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, false)
  assert.match(result.error, /已退出|不存在/)
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('audit failure restores member state for removeMember', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    {
      openId: 'member-a',
      role: 'member',
      leftAt: 'never',
      updatedAt: '2026-07-01'
    }
  ])
  const store = {
    ...baseStore,
    async add(collection, doc) {
      if (collection === 'family_audit_logs') throw new Error('audit unavailable')
      return baseStore.add(collection, doc)
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })
  const membership = await baseStore.get('family_members', (item) => item.openId === 'member-a')

  assert.equal(result.ok, false)
  assert.match(result.error, /audit unavailable/)
  assert.equal(membership.status, 'active')
  assert.equal(membership.leftAt, 'never')
  assert.equal(membership.updatedAt, '2026-07-01')
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('fallback reports both audit and compensation failures', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const store = {
    ...baseStore,
    async add(collection, doc) {
      if (collection === 'family_audit_logs') throw new Error('audit unavailable')
      return baseStore.add(collection, doc)
    },
    async update(collection, predicate, patch) {
      if (collection === 'family_members' && patch.status === 'active') {
        throw new Error('compensation unavailable')
      }
      return baseStore.update(collection, predicate, patch)
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, false)
  assert.match(result.error, /audit unavailable/)
  assert.match(result.error, /compensation unavailable/)
})

test('fallback reports audit failure when compensation does not restore the member', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const store = {
    ...baseStore,
    async add(collection, doc) {
      if (collection === 'family_audit_logs') throw new Error('audit unavailable')
      return baseStore.add(collection, doc)
    },
    async update(collection, predicate, patch) {
      if (collection === 'family_members' && patch.status === 'active') return null
      return baseStore.update(collection, predicate, patch)
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, false)
  assert.match(result.error, /audit unavailable/)
  assert.match(result.error, /compensation failed: member state was not restored/)
})

test('audit failure restores member state for leaveFamily', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member', updatedAt: '2026-07-01' }
  ])
  const store = {
    ...baseStore,
    async add(collection, doc) {
      if (collection === 'family_audit_logs') throw new Error('audit unavailable')
      return baseStore.add(collection, doc)
    }
  }
  const api = createFamilyApi({ store, userId: 'member-a', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })
  const membership = await baseStore.get('family_members', (item) => item.openId === 'member-a')

  assert.equal(result.ok, false)
  assert.match(result.error, /audit unavailable/)
  assert.equal(membership.status, 'active')
  assert.equal(membership.leftAt, undefined)
  assert.equal(membership.updatedAt, '2026-07-01')
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('removeMember uses one transaction for membership checks, update, and audit', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const store = createRollbackTransactionStore(baseStore)
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, true)
  assert.equal(store.transactionCalls, 1)
  assert.equal(store.rootCalls, 2)
  assert.equal((await baseStore.get('family_members', (item) => item.openId === 'member-a')).status, 'inactive')
  assert.equal((await baseStore.list('family_audit_logs')).length, 1)
})

test('removeMember uses exact field queries to locate members before a transaction', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const transactionStore = createRollbackTransactionStore(baseStore)
  const fieldQueries = []
  const store = {
    ...transactionStore,
    async getByFields(collection, fields) {
      fieldQueries.push({ collection, fields })
      return baseStore.get(collection, (item) => (
        Object.entries(fields).every(([key, value]) => item[key] === value)
      ))
    },
    async get() {
      throw new Error('full collection lookup must not be used')
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, true)
  assert.deepEqual(fieldQueries, [
    {
      collection: 'family_members',
      fields: { openId: 'owner', status: 'active' }
    },
    {
      collection: 'family_members',
      fields: { familyId: 'family-shared', openId: 'member-a', status: 'active' }
    }
  ])
})

test('leaveFamily rolls back the transaction when audit writing fails', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member', updatedAt: '2026-07-01' }
  ])
  const store = createRollbackTransactionStore(baseStore, { failAudit: true })
  const api = createFamilyApi({ store, userId: 'member-a', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })
  const membership = await baseStore.get('family_members', (item) => item.openId === 'member-a')

  assert.equal(result.ok, false)
  assert.match(result.error, /transaction audit unavailable/)
  assert.equal(store.transactionCalls, 1)
  assert.equal(store.rootCalls, 1)
  assert.equal(membership.status, 'active')
  assert.equal(membership.updatedAt, '2026-07-01')
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('unknown roles cannot leave a family through the transaction path', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'viewer-a', role: 'viewer' }
  ])
  const store = createRollbackTransactionStore(baseStore)
  const api = createFamilyApi({ store, userId: 'viewer-a', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })
  const membership = await baseStore.get('family_members', (item) => item.openId === 'viewer-a')

  assert.equal(result.ok, false)
  assert.match(result.error, /没有权限/)
  assert.equal(store.transactionCalls, 1)
  assert.equal(membership.status, 'active')
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('transaction retry re-reads an inactive target and commits no duplicate audit', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const attemptedAuditIds = []
  let callbackCalls = 0
  const store = {
    async get(collection, predicate) {
      return baseStore.get(collection, predicate)
    },
    async runTransaction(callback) {
      const runAttempt = () => callback({
        async getById(collection, id) {
          return baseStore.get(collection, (item) => item._id === id)
        },
        async updateById() {},
        async setById(collection, id) {
          attemptedAuditIds.push(id)
        }
      })

      callbackCalls += 1
      const first = await runAttempt()
      assert.equal(first.ok, true)
      await baseStore.update(
        'family_members',
        (item) => item.openId === 'member-a',
        { status: 'inactive' }
      )
      callbackCalls += 1
      return runAttempt()
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'removeMember', openId: 'member-a' })

  assert.equal(result.ok, false)
  assert.match(result.error, /已退出|不存在/)
  assert.equal(callbackCalls, 2)
  assert.equal(attemptedAuditIds.length, 1)
  assert.equal((await baseStore.list('family_audit_logs')).length, 0)
})

test('storage TypeError is surfaced instead of being treated as a missing collection', async () => {
  const expected = "Cannot read properties of undefined (reading 'collection')"
  const store = {
    async get() {
      throw new TypeError(expected)
    }
  }
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })

  const result = await api.handle({ action: 'leaveFamily' })

  assert.equal(result.ok, false)
  assert.equal(result.error, expected)
})

test('concurrent removeMember and leaveFamily succeed and audit at most once', async () => {
  const baseStore = createMemoryStore()
  await seedFamily(baseStore, [
    { openId: 'owner', role: 'owner' },
    { openId: 'member-a', role: 'member' }
  ])
  const store = withConcurrentMemberUpdates(baseStore)
  const owner = createFamilyApi({ store, userId: 'owner', today: '2026-07-16' })
  const member = createFamilyApi({ store, userId: 'member-a', today: '2026-07-16' })

  const results = await Promise.all([
    owner.handle({ action: 'removeMember', openId: 'member-a' }),
    member.handle({ action: 'leaveFamily' })
  ])
  const logs = await baseStore.list('family_audit_logs')

  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(results.filter((result) => !result.ok).length, 1)
  assert.match(results.find((result) => !result.ok).error, /已退出|不存在/)
  assert.equal(logs.length, 1)
})
