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
