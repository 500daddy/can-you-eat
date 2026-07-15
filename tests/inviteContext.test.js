const test = require('node:test')
const assert = require('node:assert/strict')

const { createInviteContext } = require('../utils/inviteContext')

test('stores a trimmed invite id and consumes it once', () => {
  const values = {}
  const context = createInviteContext({
    get: (key) => values[key],
    set: (key, value) => { values[key] = value },
    remove: (key) => { delete values[key] }
  })

  assert.equal(context.save(' invite-a '), 'invite-a')
  assert.equal(context.peek(), 'invite-a')
  assert.equal(context.consume(), 'invite-a')
  assert.equal(context.peek(), '')
  assert.equal(context.save('   '), '')
})
