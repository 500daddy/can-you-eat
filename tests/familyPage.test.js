const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readText(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), 'utf8')
}

function loadPage(
  projectPath,
  familyService,
  accountService = { getSession: () => ({}) },
  inviteContext = { peek: () => '', clear: () => {} }
) {
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
  assert.match(markup, /跨设备保存记录/)
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

test('family page only lets admins and members leave the family', async () => {
  const markup = readText('pages/family/index.wxml')
  assert.match(markup, /wx:if="\{\{canLeaveFamily\}\}"[^>]*class="family-exit-card"/)
  assert.match(markup, /bindtap="leaveFamily"/)

  for (const [role, expected] of [
    ['owner', false],
    ['admin', true],
    ['member', true]
  ]) {
    const page = createPageInstance(loadPage('pages/family/index', {
      getMyFamily: async () => ({
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { role },
        members: []
      })
    }))
    global.wx = { showToast() {} }

    await page.loadFamily()

    assert.equal(page.data.canLeaveFamily, expected, `${role} leave visibility`)
  }
  delete global.wx
})

test('family page does not leave when the exit confirmation is cancelled', async () => {
  let leaveCalls = 0
  const modals = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
      membership: { role: 'member' },
      members: []
    }),
    leaveFamily: async () => { leaveCalls += 1 }
  }))
  global.wx = {
    showToast() {},
    showModal(input) {
      modals.push(input)
      input.success({ confirm: false, cancel: true })
    }
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(modals[0].title, '退出家庭组')
  assert.match(modals[0].content, /不能继续查看和管理该家庭食材/)
  assert.equal(leaveCalls, 0)
  assert.equal(page.data.leaving, false)
})

test('family page leaves a shared family and displays the new personal family', async () => {
  let loads = 0
  let leaveCalls = 0
  let inviteClears = 0
  const toasts = []
  const inviteContext = {
    peek: () => '',
    clear: () => { inviteClears += 1 }
  }
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return loads === 1
        ? {
            family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
            membership: { role: 'member' },
            members: [{ openId: 'member', nickname: '外婆', role: 'member' }]
          }
        : {
            family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
            membership: { role: 'owner' },
            members: [{ openId: 'member', nickname: '外婆', role: 'owner' }]
          }
    },
    leaveFamily: async () => { leaveCalls += 1 }
  }, { getSession: () => ({}) }, inviteContext))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(leaveCalls, 1)
  assert.equal(inviteClears, 1)
  assert.equal(loads, 2)
  assert.equal(page.data.family.kind, 'personal')
  assert.equal(page.data.canLeaveFamily, false)
  assert.equal(page.data.leaving, false)
  assert.deepEqual(toasts.map((item) => item.title), ['已退出家庭'])
})

test('family page keeps the current family when leaving fails', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return {
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { role: 'member' },
        members: []
      }
    },
    leaveFamily: async () => {
      const error = new Error('无权退出该家庭')
      error.code = 'PERMISSION_DENIED'
      throw error
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(loads, 1)
  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.canLeaveFamily, true)
  assert.equal(page.data.leaving, false)
  assert.deepEqual(toasts.map((item) => item.title), ['退出失败，请重试'])
})

test('family page does not confirm a lost leave response without a new family id', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return loads === 1
        ? {
            family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
            membership: { familyId: 'family-a', role: 'member' },
            members: []
          }
        : {
            family: { kind: 'personal', name: '我的家庭' },
            membership: { role: 'owner' },
            members: []
          }
    },
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(loads, 2)
  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.canLeaveFamily, true)
  assert.deepEqual(toasts.map((item) => item.title), ['退出失败，请重试'])
})

test('family page reconciles a lost leave response when membership already changed', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return loads === 1
        ? {
            family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
            membership: { familyId: 'family-a', role: 'member' },
            members: []
          }
        : {
            family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
            membership: { familyId: 'personal-a', role: 'owner' },
            members: []
          }
    },
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(loads, 2)
  assert.equal(page.data.family.familyId, 'personal-a')
  assert.equal(page.data.canInvite, true)
  assert.equal(page.data.familySettling, false)
  assert.deepEqual(toasts.map((item) => item.title), ['已退出家庭'])
})

test('family page keeps an uncertain leave recoverable when the first reconciliation also fails', async () => {
  let loads = 0
  let leaveCalls = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 1) {
        return {
          family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
          membership: { familyId: 'family-a', role: 'member' },
          members: []
        }
      }
      if (loads === 2) throw new Error('network unavailable')
      return {
        family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
        membership: { familyId: 'personal-a', role: 'owner' },
        members: []
      }
    },
    leaveFamily: async () => {
      leaveCalls += 1
      throw new Error('request timed out')
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.familyConfirmationPending, true)
  assert.equal(page.data.familySettling, true)
  assert.equal(page.data.canInvite, false)
  assert.equal(page.data.canViewMembers, false)
  assert.equal(page.data.canLeaveFamily, false)
  assert.match(readText('pages/family/index.wxml'), /familyConfirmationPending/)
  assert.match(readText('pages/family/index.wxml'), /重新确认/)

  await page.retryFamilySync()

  delete global.wx
  assert.equal(leaveCalls, 1)
  assert.equal(loads, 3)
  assert.equal(page.data.family.familyId, 'personal-a')
  assert.equal(page.data.familyConfirmationPending, false)
  assert.equal(page.data.familySettling, false)
  assert.deepEqual(toasts.map((item) => item.title), [
    '退出结果待确认，请重新确认',
    '已退出家庭'
  ])
})

test('family page restores the original family when retry confirms it was not left', async () => {
  let loads = 0
  const toasts = []
  const originalFamily = {
    family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
    membership: { familyId: 'family-a', role: 'admin' },
    members: []
  }
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 2) throw new Error('network unavailable')
      return originalFamily
    },
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()
  await page.leaveFamily()

  await page.retryFamilySync()

  delete global.wx
  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.familyConfirmationPending, false)
  assert.equal(page.data.familySettling, false)
  assert.equal(page.data.canInvite, true)
  assert.equal(page.data.canViewMembers, true)
  assert.equal(page.data.canLeaveFamily, true)
  assert.equal(toasts.at(-1).title, '尚未退出，可重新操作')
})

test('family page keeps leave confirmation pending when retry is still offline', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) throw new Error('network unavailable')
      return {
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { familyId: 'family-a', role: 'member' },
        members: []
      }
    },
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()
  await page.leaveFamily()

  await page.retryFamilySync()

  delete global.wx
  assert.equal(loads, 3)
  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.familyConfirmationPending, true)
  assert.equal(page.data.familySettling, true)
  assert.equal(page.data.retryingFamilySync, false)
  assert.equal(toasts.at(-1).title, '暂时无法确认，请稍后重试')
})

test('family page invalidates a load started during leave before applying reconciled family', async () => {
  const pendingLoads = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: () => new Promise((resolve, reject) => pendingLoads.push({ resolve, reject })),
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast() {},
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  page.setData({
    family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
    membership: { familyId: 'family-a', role: 'member' },
    canLeaveFamily: true
  })

  const leaving = page.leaveFamily()
  await Promise.resolve()
  await Promise.resolve()
  const competingLoad = page.loadFamily()
  await Promise.resolve()
  pendingLoads[0].resolve({
    family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
    membership: { familyId: 'personal-a', role: 'owner' },
    members: []
  })
  await leaving
  pendingLoads[1].resolve({
    family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
    membership: { familyId: 'family-a', role: 'member' },
    members: []
  })
  await competingLoad

  delete global.wx
  assert.equal(page.data.family.familyId, 'personal-a')
  assert.equal(page.data.canLeaveFamily, false)
})

test('family page reconciles wrapped transport errors but not business errors', async () => {
  const cases = [
    {
      error: { errCode: -504002, errMsg: 'request timed out' },
      shouldReconcile: true
    },
    {
      error: { code: 'FUNCTION_ERROR', errCode: -1, message: 'request:fail timeout' },
      shouldReconcile: true
    },
    {
      error: { code: 'PERMISSION_DENIED', message: 'permission denied' },
      shouldReconcile: false
    },
    {
      error: { code: 'INVALID_TARGET', errMsg: 'invalid member' },
      shouldReconcile: false
    }
  ]

  global.wx = {
    showToast() {},
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  for (const { error, shouldReconcile } of cases) {
    let loads = 0
    const page = createPageInstance(loadPage('pages/family/index', {
      getMyFamily: async () => {
        loads += 1
        return loads === 1
          ? {
              family: { familyId: 'family-a', kind: 'shared' },
              membership: { familyId: 'family-a', role: 'member' },
              members: []
            }
          : {
              family: { familyId: 'personal-a', kind: 'personal' },
              membership: { familyId: 'personal-a', role: 'owner' },
              members: []
            }
      },
      leaveFamily: async () => { throw error }
    }))
    await page.loadFamily()
    await page.leaveFamily()

    assert.equal(loads, shouldReconcile ? 2 : 1, JSON.stringify(error))
    assert.equal(page.data.family.familyId, shouldReconcile ? 'personal-a' : 'family-a')
  }
  delete global.wx
})

test('family page keeps the original family when leave reconciliation is not confirmed', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return {
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { familyId: 'family-a', role: 'member' },
        members: []
      }
    },
    leaveFamily: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(loads, 2)
  assert.equal(page.data.family.familyId, 'family-a')
  assert.equal(page.data.canLeaveFamily, true)
  assert.deepEqual(toasts.map((item) => item.title), ['退出失败，请重试'])
})

test('family page ignores repeated exit taps while one request is pending', async () => {
  let resolveLeave
  let leaveCalls = 0
  let modalCalls = 0
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => ({
      family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
      membership: { role: 'member' },
      members: []
    }),
    leaveFamily: async () => {
      leaveCalls += 1
      await new Promise((resolve) => { resolveLeave = resolve })
    }
  }))
  global.wx = {
    showToast() {},
    showModal(input) {
      modalCalls += 1
      input.success({ confirm: true, cancel: false })
    }
  }
  await page.loadFamily()

  const first = page.leaveFamily()
  await Promise.resolve()
  const repeated = page.leaveFamily()
  await Promise.resolve()

  assert.equal(page.data.leaving, true)
  assert.equal(modalCalls, 1)
  assert.equal(leaveCalls, 1)
  assert.match(readText('pages/family/index.wxml'), /disabled="\{\{leaving\}\}"/)
  assert.match(readText('pages/family/index.wxml'), /\{\{leaving \? '处理中' : '退出家庭组'\}\}/)

  resolveLeave()
  await Promise.all([first, repeated])
  delete global.wx
})

test('family page keeps shared actions disabled when personal-family confirmation fails', async () => {
  let loads = 0
  const toasts = []
  const originalConsoleError = console.error
  console.error = () => {}
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) throw new Error('refresh failed')
      return {
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { role: 'admin' },
        members: []
      }
    },
    leaveFamily: async () => {}
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  console.error = originalConsoleError
  delete global.wx
  assert.equal(loads, 2)
  assert.equal(page.data.family.kind, 'personal')
  assert.equal(page.data.canLeaveFamily, false)
  assert.equal(page.data.loadError, false)
  assert.equal(page.data.familySettling, true)
  assert.equal(page.data.canInvite, false)
  assert.equal(page.data.canViewMembers, false)
  assert.equal(page.data.canManageMembers, false)
  assert.match(readText('pages/family/index.wxml'), /bindtap="retryFamilySync"/)
  assert.deepEqual(toasts.map((item) => item.title), ['已退出家庭，新的家庭信息待同步'])
})

test('family page retries pending family sync from the current page', async () => {
  let loads = 0
  const toasts = []
  const originalConsoleError = console.error
  console.error = () => {}
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 1) {
        return {
          family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
          membership: { familyId: 'family-a', role: 'member' },
          members: []
        }
      }
      if (loads === 2) throw new Error('network unavailable')
      return {
        family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
        membership: { familyId: 'personal-a', role: 'owner' },
        members: []
      }
    },
    leaveFamily: async () => {}
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()
  await page.leaveFamily()

  const firstRetry = page.retryFamilySync()
  const repeatedRetry = page.retryFamilySync()
  await Promise.all([firstRetry, repeatedRetry])

  console.error = originalConsoleError
  delete global.wx
  assert.equal(loads, 3)
  assert.equal(page.data.family.familyId, 'personal-a')
  assert.equal(page.data.familySettling, false)
  assert.equal(page.data.retryingFamilySync, false)
  assert.equal(page.data.canViewMembers, true)
  assert.equal(page.data.canManageMembers, true)
  assert.deepEqual(toasts.map((item) => item.title), [
    '已退出家庭，新的家庭信息待同步',
    '家庭信息已同步'
  ])
})

test('family page does not treat a stale original-family response as exit confirmation', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      return {
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { familyId: 'family-a', role: 'member' },
        members: []
      }
    },
    leaveFamily: async () => {}
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadFamily()

  await page.leaveFamily()

  delete global.wx
  assert.equal(loads, 2)
  assert.equal(page.data.family.kind, 'personal')
  assert.equal(page.data.familySettling, true)
  assert.equal(page.data.canInvite, false)
  assert.equal(page.data.canViewMembers, false)
  assert.equal(page.data.canManageMembers, false)
  assert.deepEqual(toasts.map((item) => item.title), ['已退出家庭，新的家庭信息待同步'])
})

test('family page disables and guards family actions until the new personal family is confirmed', async () => {
  let loads = 0
  let resolveConfirmation
  let inviteCalls = 0
  const navigations = []
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 1) {
        return {
          family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
          membership: { familyId: 'family-a', role: 'member' },
          members: []
        }
      }
      return new Promise((resolve) => { resolveConfirmation = resolve })
    },
    leaveFamily: async () => {},
    createInvite: async () => { inviteCalls += 1 }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false }),
    navigateTo: (input) => navigations.push(input.url)
  }
  await page.loadFamily()

  const leaving = page.leaveFamily()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(page.data.familySettling, true)
  assert.equal(page.data.canInvite, false)
  assert.equal(page.data.canManageMembers, false)
  await page.prepareInvite()
  page.goMemberManage()
  assert.equal(inviteCalls, 0)
  assert.deepEqual(navigations, [])
  assert.match(readText('pages/family/index.wxml'), /disabled="\{\{[^\"]*familySettling/)

  resolveConfirmation({
    family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
    membership: { familyId: 'personal-a', role: 'owner' },
    members: []
  })
  await leaving

  delete global.wx
  assert.equal(page.data.familySettling, false)
  assert.equal(page.data.canInvite, true)
  assert.equal(page.data.canViewMembers, true)
  assert.equal(page.data.canManageMembers, true)
})

test('family page lets every formal family role view members while only owner can manage', async () => {
  const navigations = []
  global.wx = {
    showToast() {},
    navigateTo: (input) => navigations.push(input.url)
  }

  for (const role of ['owner', 'admin', 'member']) {
    const page = createPageInstance(loadPage('pages/family/index', {
      getMyFamily: async () => ({
        family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
        membership: { familyId: 'family-a', role },
        members: []
      })
    }))
    await page.loadFamily()
    assert.equal(page.data.canViewMembers, true, `${role} can view`)
    assert.equal(page.data.canManageMembers, role === 'owner', `${role} can manage`)
    page.goMemberManage()
  }

  delete global.wx
  assert.deepEqual(navigations, [
    '/pages/family/member',
    '/pages/family/member',
    '/pages/family/member'
  ])
  const markup = readText('pages/family/index.wxml')
  assert.match(markup, /loading \|\| familySettling \|\| !canViewMembers/)
})

test('family page ignores an old family load that resolves after leaving', async () => {
  const pendingLoads = []
  const page = createPageInstance(loadPage('pages/family/index', {
    getMyFamily: () => new Promise((resolve) => pendingLoads.push(resolve)),
    leaveFamily: async () => {}
  }))
  global.wx = {
    showToast() {},
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }

  const oldLoad = page.loadFamily()
  page.setData({
    family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
    membership: { role: 'member' },
    canLeaveFamily: true
  })
  const leaving = page.leaveFamily()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  pendingLoads[1]({
    family: { familyId: 'personal-a', name: '我的家庭', kind: 'personal' },
    membership: { role: 'owner' },
    members: []
  })
  await leaving
  pendingLoads[0]({
    family: { familyId: 'family-a', name: '小满家', kind: 'shared' },
    membership: { role: 'member' },
    members: []
  })
  await oldLoad

  delete global.wx
  assert.equal(page.data.family.familyId, 'personal-a')
  assert.equal(page.data.canLeaveFamily, false)
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

test('member page only shows remove actions to owners for non-owner members', async () => {
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [
        { openId: 'owner', nickname: '妈妈', role: 'owner' },
        { openId: 'member', nickname: '爸爸', role: 'member' }
      ]
    })
  }))
  global.wx = { showToast() {} }

  await page.onShow()

  delete global.wx
  const markup = readText('pages/family/member.wxml')
  assert.equal(page.data.canManageMembers, true)
  assert.match(markup, /wx:if="\{\{canManageMembers && !item\.isOwner\}\}"/)
  assert.match(markup, /bindtap="removeMember"/)
  assert.match(markup, /pendingRemovalOpenId === item\.openId \? '确认状态' : '移出家庭'/)
})

test('member page ignores an older member load that finishes after the latest load', async () => {
  const pendingLoads = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: () => new Promise((resolve) => pendingLoads.push(resolve))
  }))
  global.wx = { showToast() {} }

  const olderLoad = page.loadMembers()
  const latestLoad = page.loadMembers()
  pendingLoads[1]({
    membership: { role: 'owner' },
    members: []
  })
  await latestLoad
  pendingLoads[0]({
    membership: { role: 'owner' },
    members: [{ openId: 'removed-member', nickname: '爸爸', role: 'member' }]
  })
  await olderLoad

  delete global.wx
  assert.deepEqual(page.data.members, [])
  assert.equal(page.data.loading, false)
})

test('member page rejects forged remove attempts without permission or against owner', async () => {
  const removed = []
  const service = {
    getMyFamily: async () => ({
      membership: { role: 'member' },
      members: [
        { openId: 'owner', nickname: '妈妈', role: 'owner' },
        { openId: 'member', nickname: '爸爸', role: 'member' }
      ]
    }),
    removeMember: async (input) => removed.push(input)
  }
  const page = createPageInstance(loadPage('pages/family/member', service))
  global.wx = { showToast() {} }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })
  page.setData({ canManageMembers: true })
  await page.removeMember({ currentTarget: { dataset: { openid: 'owner' } } })

  delete global.wx
  assert.deepEqual(removed, [])
})

test('member page confirms removal details and does not call service when cancelled', async () => {
  const removed = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
    }),
    removeMember: async (input) => removed.push(input)
  }))
  const modals = []
  global.wx = {
    showToast() {},
    showModal(input) {
      modals.push(input)
      input.success({ confirm: false, cancel: true })
    }
  }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(modals[0].title, '移出家庭')
  assert.equal(modals[0].content, '移出后将无法继续查看和管理这个家庭的食材，历史记录仍会保留')
  assert.equal(modals[0].confirmText, '确认移出')
  assert.equal(modals[0].confirmColor, '#a64038')
  assert.deepEqual(removed, [])
})

test('member page removes a confirmed member without waiting for background refresh', async () => {
  let loads = 0
  let resolveRefresh
  const removed = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) return new Promise((resolve) => { resolveRefresh = resolve })
      return {
        membership: { role: 'owner' },
        family: { familyId: 'family-a' },
        members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
      }
    },
    removeMember: async (input) => removed.push(input)
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  const removal = page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })
  await removal

  assert.deepEqual(removed, [{ openId: 'member' }])
  assert.equal(loads, 2)
  assert.deepEqual(page.data.members, [])
  assert.equal(page.data.removingOpenId, '')
  assert.equal(toasts.at(-1).title, '已移出家庭')
  resolveRefresh({
    family: { familyId: 'family-a' },
    membership: { familyId: 'family-a', role: 'owner' },
    members: []
  })
  await Promise.resolve()
  delete global.wx
})

test('member page reconciles a lost removal response when the target is already absent', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      return loads === 1
        ? {
            family: { familyId: 'family-a' },
            membership: { familyId: 'family-a', role: 'owner' },
            members: [{ openId: 'member', nickname: '爸爸', role: 'member', status: 'active' }]
          }
        : {
            family: { familyId: 'family-a' },
            membership: { familyId: 'family-a', role: 'owner' },
            members: []
          }
    },
    removeMember: async () => { throw new Error('request timed out') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(loads, 3)
  assert.deepEqual(page.data.members, [])
  assert.deepEqual(toasts.map((item) => item.title), ['已移出家庭'])
})

test('member page confirms an uncertain removal from the current page without repeating the write', async () => {
  let loads = 0
  let removeCalls = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 2) throw new Error('network unavailable')
      return {
        family: { familyId: 'family-a' },
        membership: { familyId: 'family-a', role: 'owner' },
        members: loads === 1
          ? [{ openId: 'member', nickname: '爸爸', role: 'member' }]
          : []
      }
    },
    removeMember: async () => {
      removeCalls += 1
      throw new Error('request timed out')
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadMembers()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  assert.equal(page.data.pendingRemovalOpenId, 'member')
  assert.equal(page.data.members.length, 1)
  assert.equal(page.data.removingOpenId, '')
  assert.match(readText('pages/family/member.wxml'), /pendingRemovalOpenId === item\.openId \? '确认状态'/)

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(removeCalls, 1)
  assert.equal(loads, 4)
  assert.equal(page.data.pendingRemovalOpenId, '')
  assert.deepEqual(page.data.members, [])
  assert.deepEqual(toasts.map((item) => item.title), [
    '状态待确认，请再次点击确认',
    '已移出家庭'
  ])
})

test('member page clears pending removal when confirmation shows the member is still active', async () => {
  let loads = 0
  let removeCalls = 0
  const toasts = []
  const activeFamily = {
    family: { familyId: 'family-a' },
    membership: { familyId: 'family-a', role: 'owner' },
    members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
  }
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 2) throw new Error('network unavailable')
      return activeFamily
    },
    removeMember: async () => {
      removeCalls += 1
      throw new Error('request timed out')
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadMembers()
  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(removeCalls, 1)
  assert.equal(loads, 3)
  assert.equal(page.data.pendingRemovalOpenId, '')
  assert.equal(page.data.members.length, 1)
  assert.equal(toasts.at(-1).title, '成员仍在家庭，可重新移出')
})

test('member page keeps removal pending when confirmation is still offline', async () => {
  let loads = 0
  let removeCalls = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) throw new Error('network unavailable')
      return {
        family: { familyId: 'family-a' },
        membership: { familyId: 'family-a', role: 'owner' },
        members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
      }
    },
    removeMember: async () => {
      removeCalls += 1
      throw new Error('request timed out')
    }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.loadMembers()
  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(removeCalls, 1)
  assert.equal(loads, 3)
  assert.equal(page.data.pendingRemovalOpenId, 'member')
  assert.equal(page.data.removingOpenId, '')
  assert.equal(page.data.members.length, 1)
  assert.equal(toasts.at(-1).title, '状态待确认，请再次点击确认')
})

test('member page reconciles wrapped transport errors but not business errors', async () => {
  const cases = [
    {
      error: { errCode: -504002, errMsg: 'request timed out' },
      shouldReconcile: true
    },
    {
      error: { code: 'FUNCTION_ERROR', errCode: -1, message: 'request:fail timeout' },
      shouldReconcile: true
    },
    {
      error: { code: 'PERMISSION_DENIED', message: 'permission denied' },
      shouldReconcile: false
    },
    {
      error: { code: 'INVALID_TARGET', errMsg: 'invalid member' },
      shouldReconcile: false
    }
  ]

  global.wx = {
    showToast() {},
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  for (const { error, shouldReconcile } of cases) {
    let loads = 0
    const page = createPageInstance(loadPage('pages/family/member', {
      getMyFamily: async () => {
        loads += 1
        return {
          family: { familyId: 'family-a' },
          membership: { familyId: 'family-a', role: 'owner' },
          members: loads === 1 || !shouldReconcile
            ? [{ openId: 'member', nickname: '爸爸', role: 'member' }]
            : []
        }
      },
      removeMember: async () => { throw error }
    }))
    await page.loadMembers()
    await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

    assert.equal(loads, shouldReconcile ? 3 : 1, JSON.stringify(error))
    assert.equal(page.data.members.length, shouldReconcile ? 0 : 1)
  }
  delete global.wx
})

test('member page preserves the target when removal reconciliation is not confirmed', async () => {
  let loads = 0
  const toasts = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      return {
        family: { familyId: 'family-a' },
        membership: { familyId: 'family-a', role: 'owner' },
        members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
      }
    },
    removeMember: async () => { throw new Error('无权移出该成员') }
  }))
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(loads, 1)
  assert.equal(page.data.members.length, 1)
  assert.deepEqual(toasts.map((item) => item.title), ['无权移出该成员'])
})

test('member page keeps members and surfaces removal errors with a fallback', async () => {
  const errors = [new Error('无权移出该成员'), {}]
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [{ openId: 'member', nickname: '爸爸', role: 'member' }]
    }),
    removeMember: async () => {
      throw errors.shift()
    }
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })
  await page.removeMember({ currentTarget: { dataset: { openid: 'member' } } })

  delete global.wx
  assert.equal(page.data.members.length, 1)
  assert.deepEqual(toasts.map((item) => item.title), [
    '无权移出该成员',
    '移出失败，请重试'
  ])
})

test('member page keeps one global removal lock across interleaved member clicks', async () => {
  const pendingRemovals = []
  const calls = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [
        { openId: 'member-a', nickname: '爸爸', role: 'member' },
        { openId: 'member-b', nickname: '外婆', role: 'member' }
      ]
    }),
    removeMember: async (input) => {
      calls.push(input)
      await new Promise((resolve) => { pendingRemovals.push(resolve) })
    }
  }))
  const modals = []
  global.wx = {
    showToast() {},
    showModal(input) {
      modals.push(input)
      if (modals.length === 1) input.success({ confirm: true, cancel: false })
    }
  }
  await page.onShow()

  const firstRemoval = page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })
  await Promise.resolve()
  const secondRemoval = page.removeMember({ currentTarget: { dataset: { openid: 'member-b' } } })
  if (modals[1]) modals[1].success({ confirm: false, cancel: true })
  await secondRemoval
  const repeatedRemoval = page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })
  await Promise.resolve()

  assert.equal(page.data.removingOpenId, 'member-a')
  assert.deepEqual(calls, [{ openId: 'member-a' }])
  assert.equal(modals.length, 1)
  const markup = readText('pages/family/member.wxml')
  assert.match(markup, /disabled="\{\{!!removingOpenId \|\| !!updatingOpenId \|\| !!pendingRemovalOpenId\}\}"/)
  assert.match(markup, /removingOpenId === item\.openId \? '处理中'/)
  assert.match(markup, /pendingRemovalOpenId === item\.openId \? '确认状态' : '移出家庭'/)
  pendingRemovals[0]()
  await Promise.all([firstRemoval, repeatedRemoval])

  delete global.wx
  assert.equal(page.data.removingOpenId, '')
})

test('member page ignores role updates while a removal is pending', async () => {
  let finishRemoval
  const calls = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [{ openId: 'member-a', nickname: '爸爸', role: 'member' }]
    }),
    removeMember: async (input) => {
      calls.push({ action: 'removeMember', input })
      await new Promise((resolve) => { finishRemoval = resolve })
    },
    updateMemberRole: async (input) => {
      calls.push({ action: 'updateMemberRole', input })
    }
  }))
  global.wx = {
    showToast() {},
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  const removal = page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })
  await Promise.resolve()
  page.updateRole({ currentTarget: { dataset: { openid: 'member-a', role: 'admin' } } })
  await Promise.resolve()

  assert.deepEqual(calls, [
    { action: 'removeMember', input: { openId: 'member-a' } }
  ])
  finishRemoval()
  await removal

  delete global.wx
})

test('member page serializes role updates with every member write action', async () => {
  let finishUpdate
  const calls = []
  const modals = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => ({
      membership: { role: 'owner' },
      members: [{ openId: 'member-a', nickname: '爸爸', role: 'member' }]
    }),
    updateMemberRole: async (input) => {
      calls.push({ action: 'updateMemberRole', input })
      await new Promise((resolve) => { finishUpdate = resolve })
    },
    removeMember: async (input) => {
      calls.push({ action: 'removeMember', input })
    }
  }))
  global.wx = {
    showToast() {},
    showModal(input) {
      modals.push(input)
      input.success({ confirm: true, cancel: false })
    }
  }
  await page.onShow()

  const update = page.updateRole({ currentTarget: { dataset: { openid: 'member-a', role: 'admin' } } })
  await Promise.resolve()
  const repeatedUpdate = page.updateRole({ currentTarget: { dataset: { openid: 'member-a', role: 'admin' } } })
  await page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })

  assert.equal(page.data.updatingOpenId, 'member-a')
  assert.deepEqual(calls, [
    { action: 'updateMemberRole', input: { openId: 'member-a', role: 'admin' } }
  ])
  assert.equal(modals.length, 1)
  finishUpdate()
  await Promise.all([update, repeatedUpdate])

  delete global.wx
  assert.equal(page.data.updatingOpenId, '')
})

test('member page keeps local role update and only shows success when refresh fails', async () => {
  let loads = 0
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) throw new Error('refresh failed')
      return {
        membership: { role: 'owner' },
        members: [
          {
            openId: 'member-a',
            nickname: '爸爸',
            avatarUrl: '/dad.jpg',
            role: 'member'
          }
        ]
      }
    },
    updateMemberRole: async () => {}
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  await page.updateRole({ currentTarget: { dataset: { openid: 'member-a', role: 'admin' } } })

  delete global.wx
  assert.equal(loads, 2)
  assert.deepEqual(page.data.members, [{
    openId: 'member-a',
    nickname: '爸爸',
    avatarUrl: '/dad.jpg',
    role: 'admin',
    roleText: '管理员',
    isOwner: false
  }])
  assert.deepEqual(toasts.map((item) => item.title), ['已更新'])
})

test('member page disables every member action while any write is pending', () => {
  const markup = readText('pages/family/member.wxml')
  const roleDisabledState = /disabled="\{\{!!removingOpenId \|\| !!updatingOpenId \|\| !!pendingRemovalOpenId\}\}"/g

  assert.equal(markup.match(roleDisabledState)?.length, 2)
  assert.match(markup, /disabled="\{\{!!removingOpenId \|\| !!updatingOpenId \|\| \(!!pendingRemovalOpenId && pendingRemovalOpenId !== item\.openId\)\}\}"/)
  assert.match(markup, /pendingRemovalOpenId === item\.openId \? '确认状态' : '移出家庭'/)
})

test('member page locks other writes while an uncertain removal remains confirmable', async () => {
  let loads = 0
  const calls = []
  const modals = []
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads === 2) throw new Error('network unavailable')
      return {
        family: { familyId: 'family-a' },
        membership: { familyId: 'family-a', role: 'owner' },
        members: loads === 1
          ? [
              { openId: 'member-a', nickname: '爸爸', role: 'member' },
              { openId: 'member-b', nickname: '外婆', role: 'member' }
            ]
          : [{ openId: 'member-b', nickname: '外婆', role: 'member' }]
      }
    },
    removeMember: async (input) => {
      calls.push({ action: 'removeMember', input })
      throw new Error('request timed out')
    },
    updateMemberRole: async (input) => {
      calls.push({ action: 'updateMemberRole', input })
    }
  }))
  global.wx = {
    showToast() {},
    showModal(input) {
      modals.push(input)
      input.success({ confirm: true, cancel: false })
    }
  }
  await page.loadMembers()
  await page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })

  await page.updateRole({ currentTarget: { dataset: { openid: 'member-b', role: 'admin' } } })
  await page.removeMember({ currentTarget: { dataset: { openid: 'member-b' } } })

  assert.equal(page.data.pendingRemovalOpenId, 'member-a')
  assert.deepEqual(calls, [
    { action: 'removeMember', input: { openId: 'member-a' } }
  ])
  assert.equal(modals.length, 1)

  await page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })

  delete global.wx
  assert.equal(loads, 4)
  assert.equal(page.data.pendingRemovalOpenId, '')
  assert.deepEqual(page.data.members.map((item) => item.openId), ['member-b'])
  assert.deepEqual(calls, [
    { action: 'removeMember', input: { openId: 'member-a' } }
  ])
})

test('member page keeps local removal and only shows success when refresh fails', async () => {
  let loads = 0
  const page = createPageInstance(loadPage('pages/family/member', {
    getMyFamily: async () => {
      loads += 1
      if (loads > 1) throw new Error('refresh failed')
      return {
        membership: { role: 'owner' },
        members: [
          { openId: 'member-a', nickname: '爸爸', role: 'member' },
          { openId: 'member-b', nickname: '外婆', role: 'member' }
        ]
      }
    },
    removeMember: async () => {}
  }))
  const toasts = []
  global.wx = {
    showToast: (input) => toasts.push(input),
    showModal: (input) => input.success({ confirm: true, cancel: false })
  }
  await page.onShow()

  await page.removeMember({ currentTarget: { dataset: { openid: 'member-a' } } })

  delete global.wx
  assert.equal(loads, 2)
  assert.deepEqual(page.data.members.map((item) => item.openId), ['member-b'])
  assert.deepEqual(toasts.map((item) => item.title), ['已移出家庭'])
})

test('member page explains all family role permissions in a modal', () => {
  const page = createPageInstance(loadPage('pages/family/member', {}))
  const modals = []
  global.wx = { showModal: (input) => modals.push(input) }

  assert.equal(typeof page.showRolePermissions, 'function')
  page.showRolePermissions()

  delete global.wx
  const markup = readText('pages/family/member.wxml')
  assert.match(markup, /bindtap="showRolePermissions"/)
  assert.equal(modals[0].title, '身份权限说明')
  assert.equal(modals[0].showCancel, false)
  assert.equal(modals[0].confirmText, '我知道了')
  assert.match(modals[0].content, /创建者：.*管理成员.*修改宝宝资料.*邀请家人/)
  assert.match(modals[0].content, /管理员：.*邀请家人.*不能调整成员或宝宝资料/)
  assert.match(modals[0].content, /成员：.*管理食材和采购计划.*不能邀请或管理成员/)
})
