const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadPage(projectPath, familyService) {
  const familyServicePath = require.resolve('../utils/familyService')
  const pagePath = require.resolve(`../${projectPath}`)
  delete require.cache[familyServicePath]
  delete require.cache[pagePath]
  require.cache[familyServicePath] = {
    id: familyServicePath,
    filename: familyServicePath,
    loaded: true,
    exports: {
      getFamilyService: () => familyService
    }
  }

  let definition
  global.Page = (input) => {
    definition = input
  }
  require(`../${projectPath}`)
  delete global.Page
  delete require.cache[pagePath]
  delete require.cache[familyServicePath]
  return definition
}

function createPageInstance(definition) {
  return {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch }
    },
    ...definition
  }
}

test('mine page exposes family sharing entry and app registers family pages', () => {
  const markup = readText('pages/mine/index.wxml')
  const script = readText('pages/mine/index.js')
  const appConfig = JSON.parse(readText('app.json'))

  assert.match(markup, /家庭共享/)
  assert.match(markup, /共用食材库/)
  assert.match(markup, /bindtap="goFamily"/)
  assert.match(script, /goFamily\(\)/)
  assert.ok(appConfig.pages.includes('pages/family/index'))
  assert.ok(appConfig.pages.includes('pages/family/member'))
})

test('family page loads members and creates an invite', async () => {
  const calls = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '宝宝的小厨房' },
      membership: { role: 'owner' },
      members: [
        { openId: 'owner', nickname: '妈妈', role: 'owner' },
        { openId: 'member', nickname: '爸爸', role: 'member' }
      ]
    }),
    createInvite: async () => {
      calls.push({ action: 'createInvite' })
      return { inviteId: 'invite-a', expiresAt: '2026-07-16' }
    }
  }))
  const clipboards = []
  global.wx = {
    setClipboardData: (input) => {
      clipboards.push(input.data)
      if (input.success) input.success()
    },
    showToast: () => {},
    navigateTo: () => {}
  }

  await page.onShow()
  await page.createInvite()

  delete global.wx
  assert.equal(page.data.family.name, '宝宝的小厨房')
  assert.equal(page.data.members.length, 2)
  assert.equal(page.data.canManageMembers, true)
  assert.deepEqual(calls, [{ action: 'createInvite' }])
  assert.match(clipboards[0], /invite-a/)
})

test('member page only lets owner manage member roles', async () => {
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'member' },
      members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
    }),
    updateMemberRole: async () => {
      throw new Error('should not be called')
    }
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.onShow()
  page.updateRole({ currentTarget: { dataset: { openid: 'member', role: 'admin' } } })

  delete global.wx
  assert.equal(page.data.canManageMembers, false)
  assert.match(toasts[0].title, /创建者/)
})
