const test = require('node:test')
const assert = require('node:assert/strict')

const { buildCloudUpdateData } = require('../cloudfunctions/foodApi/cloudStore')

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
