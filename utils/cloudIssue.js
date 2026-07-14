const patterns = [
  ['COLLECTION_MISSING', /collection not exists|collection.*not.*exist|集合.*不存在/i],
  ['FUNCTION_NOT_DEPLOYED', /function not found|函数.*不存在/i],
  ['ENV_MISMATCH', /env.*not found|environment.*not found|云环境.*不存在/i],
  ['PERMISSION_DENIED', /permission denied|没有权限|权限不足/i],
  ['NETWORK_ERROR', /request:fail|timeout|timed out|network/i]
]

function classifyCloudIssue(error, fallbackCode = 'UNKNOWN_ERROR') {
  if (error && error.code) {
    return { code: error.code, message: error.message || '' }
  }
  const message = String((error && error.message) || error || '')
  const matched = patterns.find(([, pattern]) => pattern.test(message))
  return { code: matched ? matched[0] : fallbackCode, message }
}

function syncIssueText(issue = {}) {
  if (['COLLECTION_MISSING', 'FUNCTION_NOT_DEPLOYED', 'ENV_MISMATCH', 'PERMISSION_DENIED'].includes(issue.code)) {
    return '家庭信息暂不可用'
  }
  return '部分食材尚未同步'
}

module.exports = {
  classifyCloudIssue,
  syncIssueText
}
