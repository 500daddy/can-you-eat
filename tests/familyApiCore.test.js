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
