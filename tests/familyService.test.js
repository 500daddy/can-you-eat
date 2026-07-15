const test = require('node:test')
const assert = require('node:assert/strict')

const { createFamilyService, resetFamilyService } = require('../utils/familyService')

test('gets current family through familyApi cloud function', async () => {
  const calls = []
  const service = createFamilyService({
    callCloud: async (data) => {
      calls.push(data)
      return {
        family: { familyId: 'family-a', name: '宝宝的小厨房' },
        members: [{ openId: 'owner', role: 'owner' }]
      }
    }
  })

  const result = await service.getMyFamily({ nickname: '小芽贝' })

  assert.deepEqual(calls, [{ action: 'getMyFamily', nickname: '小芽贝' }])
  assert.equal(result.family.familyId, 'family-a')
  assert.equal(result.members[0].role, 'owner')
})

test('creates invite and joins family through service actions', async () => {
  const calls = []
  const service = createFamilyService({
    callCloud: async (data) => {
      calls.push(data)
      if (data.action === 'createInvite') return { inviteId: 'invite-a' }
      return { familyId: 'family-a', role: 'member' }
    }
  })

  const invite = await service.createInvite()
  const joined = await service.joinFamilyByInvite({ inviteId: invite.inviteId, nickname: '家人' })

  assert.deepEqual(calls, [
    { action: 'createInvite' },
    { action: 'joinFamilyByInvite', inviteId: 'invite-a', nickname: '家人' }
  ])
  assert.equal(joined.role, 'member')
})

test('gets a safe invite preview through familyApi', async () => {
  const calls = []
  const service = createFamilyService({
    callCloud: async (data) => {
      calls.push(data)
      return { familyName: '小满家', inviterName: '小满妈妈', memberCount: 1 }
    }
  })

  const preview = await service.getInvitePreview({ inviteId: 'invite-a' })

  assert.deepEqual(calls, [{ action: 'getInvitePreview', inviteId: 'invite-a' }])
  assert.equal(preview.familyName, '小满家')
})

test('resets family service singleton without throwing', () => {
  assert.doesNotThrow(() => resetFamilyService())
})
