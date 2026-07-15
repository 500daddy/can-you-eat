const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadPage(projectPath, familyService, accountService = { getSession: () => ({}) }, inviteContext = { peek: () => '' }) {
  const familyServicePath = require.resolve('../utils/familyService')
  const accountServicePath = require.resolve('../utils/accountService')
  const inviteContextPath = require.resolve('../utils/inviteContext')
  const pagePath = require.resolve(`../${projectPath}`)
  delete require.cache[familyServicePath]
  delete require.cache[accountServicePath]
  delete require.cache[inviteContextPath]
  delete require.cache[pagePath]
  require.cache[familyServicePath] = {
    id: familyServicePath,
    filename: familyServicePath,
    loaded: true,
    exports: {
      getFamilyService: () => familyService
    }
  }
  require.cache[accountServicePath] = {
    id: accountServicePath,
    filename: accountServicePath,
    loaded: true,
    exports: {
      getAccountService: () => accountService
    }
  }
  require.cache[inviteContextPath] = {
    id: inviteContextPath,
    filename: inviteContextPath,
    loaded: true,
    exports: {
      getInviteContext: () => inviteContext
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
  delete require.cache[accountServicePath]
  delete require.cache[inviteContextPath]
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
  assert.equal(page.data.roleLabel, '创建者')
  assert.equal(page.data.canManageMembers, true)
  assert.deepEqual(calls, [{ action: 'createInvite' }])
  assert.match(clipboards[0], /invite-a/)
})

test('family entry sends the cached parent identity when creating or joining', async () => {
  const calls = []
  const familyService = {
    getMyFamily: async (input) => {
      calls.push({ action: 'getMyFamily', input })
      return {
        family: { familyId: 'family-a', name: '小满家' },
        membership: { role: 'owner' },
        members: []
      }
    },
    joinFamilyByInvite: async (input) => {
      calls.push({ action: 'joinFamilyByInvite', input })
      return { familyId: 'family-b' }
    }
  }
  const accountService = {
    getSession: () => ({
      loggedIn: true,
      profile: { nickname: '小满妈妈', avatarUrl: '/parent.jpg' }
    })
  }
  const page = createPageInstance(loadPage('pages/family/index', familyService, accountService))
  global.wx = { showToast() {} }

  await page.loadFamily()
  page.setData({ inviteCode: 'invite-b' })
  await page.joinByInvite()

  delete global.wx
  assert.deepEqual(calls[0], {
    action: 'getMyFamily',
    input: { nickname: '小满妈妈', avatarUrl: '/parent.jpg' }
  })
  assert.deepEqual(calls[1], {
    action: 'joinFamilyByInvite',
    input: { inviteId: 'invite-b', nickname: '小满妈妈', avatarUrl: '/parent.jpg' }
  })
})

test('family invite button stays tappable before role is known and lets api decide permission', async () => {
  const calls = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '宝宝的小厨房' },
      members: []
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
  assert.equal(page.data.roleLabel, '待确认')
  assert.deepEqual(calls, [{ action: 'createInvite' }])
  assert.match(clipboards[0], /invite-a/)
  assert.doesNotMatch(readText('pages/family/index.wxml'), /disabled="\{\{!canInvite\}\}"/)
})

test('family page surfaces cloud setup errors in user-facing copy', async () => {
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      throw new Error('collection not exists')
    },
    createInvite: async () => {
      throw new Error('function not found')
    }
  }))
  const toasts = []
  const originalConsoleError = console.error
  console.error = () => {}
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.onShow()
  await page.createInvite()

  console.error = originalConsoleError
  delete global.wx
  assert.equal(toasts[0].title, '家庭共享数据表未创建')
  assert.equal(toasts[1].title, '家庭共享云函数未部署')
})

test('family page shows setup copy when family api initialization fails', async () => {
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      throw new Error('家庭共享初始化失败：permission denied')
    }
  }))
  const toasts = []
  const originalConsoleError = console.error
  console.error = () => {}
  global.wx = {
    showToast: (input) => toasts.push(input)
  }

  await page.onShow()

  console.error = originalConsoleError
  delete global.wx
  assert.equal(toasts[0].title, '家庭共享初始化失败')
})

test('family page lets invited user join by invite code', async () => {
  const calls = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '宝宝的小厨房' },
      membership: { role: 'owner' },
      members: []
    }),
    createInvite: async () => ({ inviteId: 'invite-a' }),
    joinFamilyByInvite: async (input) => {
      calls.push(input)
      return { familyId: 'family-a' }
    }
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input),
    navigateTo: () => {}
  }

  page.onInviteCodeInput({ detail: { value: ' invite-a ' } })
  await page.joinByInvite()

  delete global.wx
  assert.deepEqual(calls, [{ inviteId: 'invite-a' }])
  assert.equal(toasts[0].title, '已加入家庭')
  assert.match(readText('pages/family/index.wxml'), /收到家人邀请/)
  assert.match(readText('pages/family/index.wxml'), /joinByInvite/)
})

test('family page prepares a native WeChat share card with the generated invite', async () => {
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '小满家' },
      membership: { role: 'owner' },
      members: [{ openId: 'owner', role: 'owner' }]
    }),
    createInvite: async () => ({ inviteId: 'invite-a', expiresAt: '2026-07-21' })
  }, {
    getSession: () => ({ loggedIn: true, profile: { nickname: '小满妈妈' } })
  }))
  global.wx = { showToast() {} }
  await page.onShow()
  await page.prepareInvite()

  const share = page.onShareAppMessage()

  delete global.wx
  assert.equal(share.title, '小满妈妈邀请你加入小满家')
  assert.equal(share.path, '/pages/family/index?inviteId=invite-a')
  assert.match(readText('pages/family/index.wxml'), /open-type="share"/)
})

test('opening a shared invite while logged out stores it and opens account login once', async () => {
  const navigations = []
  const inviteContext = {
    saved: '',
    save(value) { this.saved = value },
    peek() { return this.saved },
    clear() { this.saved = '' }
  }
  const page = createPageInstance(loadPage(
    'pages/family/index',
    {},
    { getSession: () => ({ loggedIn: false }) },
    inviteContext
  ))
  global.wx = { navigateTo: (input) => navigations.push(input) }

  page.onLoad({ inviteId: 'invite-a' })
  await page.onShow()
  await page.onShow()

  delete global.wx
  assert.equal(inviteContext.saved, 'invite-a')
  assert.deepEqual(navigations, [{ url: '/pages/settings/account?fromInvite=1' }])
  assert.equal(page.data.needsLogin, true)
})

test('logged-in recipient previews and confirms a shared family invite', async () => {
  const joined = []
  const inviteContext = {
    value: 'invite-a',
    save(value) { this.value = value },
    peek() { return this.value },
    clear() { this.value = '' }
  }
  const page = createPageInstance(loadPage('pages/family/index', {
    getInvitePreview: async () => ({
      familyName: '小满家',
      inviterName: '小满妈妈',
      memberCount: 1,
      expiresAt: '2026-07-21'
    }),
    joinFamilyByInvite: async (input) => {
      joined.push(input)
      return { familyId: 'family-a' }
    },
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '小满家' },
      membership: { role: 'member' },
      members: []
    })
  }, {
    getSession: () => ({ loggedIn: true, profile: { nickname: '外婆', avatarUrl: 'cloud://avatar.jpg' } })
  }, inviteContext))
  global.wx = { showToast() {} }

  await page.onShow()
  await page.confirmJoinInvite()

  delete global.wx
  assert.equal(page.data.invitePreview, null)
  assert.equal(inviteContext.value, '')
  assert.deepEqual(joined, [{
    inviteId: 'invite-a',
    nickname: '外婆',
    avatarUrl: 'cloud://avatar.jpg'
  }])
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
