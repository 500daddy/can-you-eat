const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyCloudIssue, syncIssueText } = require('../utils/cloudIssue')
const { unwrapCloudResult } = require('../utils/foodService')

test('keeps structured cloud error codes when unwrapping a response', () => {
  assert.throws(
    () => unwrapCloudResult({ result: { ok: false, code: 'COLLECTION_MISSING', error: 'user_profiles not found' } }),
    (error) => error.code === 'COLLECTION_MISSING' && /user_profiles/.test(error.message)
  )
})

test('classifies common cloud failures without calling every failure a network issue', () => {
  assert.equal(classifyCloudIssue(new Error('collection not exists')).code, 'COLLECTION_MISSING')
  assert.equal(classifyCloudIssue(new Error('function not found')).code, 'FUNCTION_NOT_DEPLOYED')
  assert.equal(classifyCloudIssue(new Error('env not found')).code, 'ENV_MISMATCH')
  assert.equal(classifyCloudIssue(new Error('permission denied')).code, 'PERMISSION_DENIED')
  assert.equal(classifyCloudIssue(new Error('request:fail timeout')).code, 'NETWORK_ERROR')
  assert.equal(syncIssueText({ code: 'COLLECTION_MISSING' }), '家庭信息暂不可用')
  assert.equal(syncIssueText({ code: 'NETWORK_ERROR' }), '部分食材尚未同步')
})
