# 家长登录与家庭邀请可靠性优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让家长账号快速完成登录并在后台可靠同步，同时支持微信分享邀请，并从服务端保证一个账号只能属于一个正式家庭。

**架构：** 保留现有 `accountService`、`familyService` 和云函数边界，新增统一云端问题分类与待处理邀请上下文。登录只等待身份和账号资料写入，头像、家庭初始化和食材合并由可恢复的后台任务完成；家庭云函数持久化 `personal/formal` 状态，并由分享 token 和同一加入接口处理微信分享及邀请码。

**技术栈：** 微信小程序原生 JavaScript/WXML/WXSS、微信云开发、`wx-server-sdk`、Node.js `node:test`。

---

## 文件结构

### 新建文件

- `utils/cloudIssue.js`：把云函数、环境、权限和网络错误归一为稳定原因码及用户文案。
- `utils/inviteContext.js`：保存、读取和清理待处理的微信家庭邀请标识。
- `tests/cloudIssue.test.js`：验证原因码和用户文案映射。
- `tests/inviteContext.test.js`：验证邀请上下文只保存有效 token，并能在登录后恢复。

### 修改文件

- `utils/foodService.js`：解包云函数失败时保留服务端 `code`。
- `utils/accountService.js`：登录后立即保存会话，调度可去重、可重试的后台同步。
- `utils/familyService.js`：增加邀请预览接口，保留邀请码与分享邀请共用的加入接口。
- `cloudfunctions/accountApi/core.js`：保存昵称时允许头像缺省，避免本机临时头像阻塞登录。
- `cloudfunctions/accountApi/index.js`：初始化失败返回结构化原因码。
- `cloudfunctions/familyApi/core.js`：持久化家庭类型、正式化原因、邀请预览及正式家庭加入限制。
- `cloudfunctions/familyApi/cloudStore.js`：增加按字段批量更新，支持个人家庭数据迁移。
- `cloudfunctions/familyApi/index.js`：初始化失败返回结构化原因码，并包含 `recognition_logs`、`purchase_plans` 集合。
- `pages/settings/account.js`：处理昵称三个事件、登录阶段和邀请登录返回。
- `pages/settings/account.wxml`：修正微信昵称控件文案与同步状态。
- `pages/settings/account.wxss`：覆盖原生按钮样式，确保头像严格为正方形。
- `pages/family/index.js`：生成分享邀请、返回分享卡片、恢复分享入口和确认加入。
- `pages/family/index.wxml`：以微信分享为主入口，把邀请码折叠到备用区域。
- `pages/family/index.wxss`：增加邀请确认、分享按钮和备用入口样式。
- `pages/mine/index.js`：页面显示时自动恢复一次后台同步。
- `pages/mine/index.wxml`：使用真实同步状态文案，不再推断为网络问题。
- `docs/cloud-setup.md`：补充环境 ID 位置、集合清单、部署顺序和双账号验收。
- `tests/accountApiCore.test.js`：覆盖缺省头像保存。
- `tests/accountService.test.js`：覆盖快速返回、后台任务、去重和失败恢复。
- `tests/accountSettingsPage.test.js`：覆盖昵称事件、方形头像和登录返回。
- `tests/familyApiCore.test.js`：覆盖家庭状态、一次性邀请、加入限制和迁移。
- `tests/cloudStore.test.js`：覆盖家庭数据批量更新。
- `tests/familyService.test.js`：覆盖邀请预览调用。
- `tests/familyPage.test.js`：覆盖原生分享、邀请确认、登录恢复和备用邀请码。
- `tests/minePage.test.js`：覆盖后台同步自动恢复和用户文案。

## 实现约束

- 不修改当前工作区中与本计划无关的食材建议、首页或图标改动。
- 每个任务只暂存该任务列出的文件。
- 微信原生 `onShareAppMessage` 必须同步返回分享配置，因此先调用云函数生成邀请，再显示 `open-type="share"` 按钮。
- 分享链接只携带不可读的 `inviteId`，不携带 OpenID、家庭名称或宝宝资料。
- 正式家庭限制必须由 `familyApi` 执行；页面只负责展示结果。

### 任务 1：统一云端错误原因码

**文件：**
- 创建：`utils/cloudIssue.js`
- 测试：`tests/cloudIssue.test.js`
- 修改：`utils/foodService.js:22-27`
- 修改：`cloudfunctions/accountApi/index.js:14-34`
- 修改：`cloudfunctions/familyApi/index.js:18-38`

- [ ] **步骤 1：编写失败的原因码测试**

```js
// tests/cloudIssue.test.js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/cloudIssue.test.js`

预期：FAIL，报错 `Cannot find module '../utils/cloudIssue'`。

- [ ] **步骤 3：实现客户端问题分类和错误码透传**

```js
// utils/cloudIssue.js
const patterns = [
  ['COLLECTION_MISSING', /collection not exists|collection.*not.*exist|集合.*不存在/i],
  ['FUNCTION_NOT_DEPLOYED', /function not found|函数.*不存在/i],
  ['ENV_MISMATCH', /env.*not found|environment.*not found|云环境.*不存在/i],
  ['PERMISSION_DENIED', /permission denied|没有权限|权限不足/i],
  ['NETWORK_ERROR', /request:fail|timeout|timed out|network/i]
]

function classifyCloudIssue(error, fallbackCode = 'UNKNOWN_ERROR') {
  if (error && error.code) return { code: error.code, message: error.message || '' }
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

module.exports = { classifyCloudIssue, syncIssueText }
```

将 `utils/foodService.js` 的失败分支改为：

```js
if (payload && payload.ok === false) {
  const error = new Error(payload.error || 'cloud api failed')
  if (payload.code) error.code = payload.code
  throw error
}
```

在两个云函数入口各加入同名的本地函数，并在初始化失败返回值中写入 `code`：

```js
function initializationErrorCode(error) {
  const message = String((error && error.message) || error || '')
  if (/collection not exists|collection.*not.*exist|集合.*不存在/i.test(message)) return 'COLLECTION_MISSING'
  if (/permission denied|没有权限|权限不足/i.test(message)) return 'PERMISSION_DENIED'
  return 'UNKNOWN_ERROR'
}

return {
  ok: false,
  code: initializationErrorCode(error),
  error: `服务初始化失败：${error && error.message ? error.message : String(error)}`
}
```

- [ ] **步骤 4：运行原因码和现有云存储测试**

运行：`node --test tests/cloudIssue.test.js tests/accountCloudStore.test.js tests/cloudStore.test.js`

预期：全部 PASS。

- [ ] **步骤 5：提交原因码基础设施**

```bash
git add utils/cloudIssue.js utils/foodService.js cloudfunctions/accountApi/index.js cloudfunctions/familyApi/index.js tests/cloudIssue.test.js
git commit -m "feat: classify cloud sync failures"
```

### 任务 2：允许账号先保存昵称再后台上传头像

**文件：**
- 修改：`cloudfunctions/accountApi/core.js:41-96`
- 测试：`tests/accountApiCore.test.js`

- [ ] **步骤 1：编写失败的缺省头像测试**

```js
test('saving a nickname without avatar keeps the existing remote avatar', async () => {
  const createAccountApi = loadCreateAccountApi()
  const store = createMemoryStore()
  const oldApi = createAccountApi({ store, userId: 'parent-1', today: '2026-07-13T08:00:00.000Z' })
  await oldApi.handle({ action: 'saveMyProfile', nickname: '旧昵称', avatarUrl: 'cloud://old.jpg' })

  const api = createAccountApi({ store, userId: 'parent-1', today: '2026-07-14T08:00:00.000Z' })
  const result = await api.handle({ action: 'saveMyProfile', nickname: '新昵称' })

  assert.equal(result.ok, true)
  assert.equal(result.data.nickname, '新昵称')
  assert.equal(result.data.avatarUrl, 'cloud://old.jpg')
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="without avatar" tests/accountApiCore.test.js`

预期：FAIL，实际头像为空字符串。

- [ ] **步骤 3：实现头像字段缺省语义**

将 `saveMyProfile` 中资料组装改为：

```js
const existing = await getProfile(store, userId)
const hasAvatar = event.avatarUrl !== undefined && event.avatarUrl !== null
const avatarUrl = hasAvatar
  ? String(event.avatarUrl).trim()
  : String((existing && existing.avatarUrl) || '')
const profilePatch = {
  nickname,
  ...(hasAvatar ? { avatarUrl } : {}),
  profileUpdatedAt: today,
  updatedAt: today
}
const profile = {
  id: `profile_${userId}`,
  openId: userId,
  nickname,
  avatarUrl,
  profileUpdatedAt: today,
  createdAt: existing && existing.createdAt ? existing.createdAt : today,
  updatedAt: today
}
const memberPatch = {
  nickname,
  ...(hasAvatar ? { avatarUrl } : {}),
  updatedAt: today
}
```

- [ ] **步骤 4：运行账号 API 测试**

运行：`node --test tests/accountApiCore.test.js`

预期：全部 PASS。

- [ ] **步骤 5：提交账号资料兼容改动**

```bash
git add cloudfunctions/accountApi/core.js tests/accountApiCore.test.js
git commit -m "fix: preserve avatar during quick account login"
```

### 任务 3：把登录后的慢操作移入可恢复后台同步

**文件：**
- 修改：`utils/accountService.js:3-284`
- 测试：`tests/accountService.test.js`

- [ ] **步骤 1：编写快速返回和后台执行测试**

```js
test('login returns before avatar family and food background work finishes', async () => {
  const storage = createStorage()
  const scheduled = []
  const events = []
  const service = createAccountService({
    storage,
    schedule: (task) => scheduled.push(task),
    callLogin: async () => ({ openId: 'user-a' }),
    callAccount: async (input) => {
      events.push(input)
      return { openId: 'user-a', nickname: input.nickname, avatarUrl: input.avatarUrl || '' }
    },
    uploadAvatar: async () => 'cloud://avatar-a.jpg',
    getFamily: async () => ({ family: { familyId: 'family-a' }, membership: { role: 'owner' }, members: [] }),
    getLocalRecords: () => [{ id: 'record-a' }],
    mergeLocalRecords: async () => ({ added: 1 }),
    setCloudSession: () => {}
  })

  const session = await service.login({ nickname: '小满妈妈', avatarUrl: '/tmp/a.jpg' })

  assert.equal(session.loggedIn, true)
  assert.equal(session.syncStatus, 'pending')
  assert.equal(scheduled.length, 1)
  assert.equal(events.length, 1)
  await scheduled[0]()
  assert.equal(service.getSession().syncStatus, 'synced')
  assert.equal(events.length, 2)
})

test('concurrent sync resumes share one in-flight request', async () => {
  let releaseMerge
  const mergeGate = new Promise((resolve) => { releaseMerge = resolve })
  let mergeCalls = 0
  const storage = createStorage({
    [ACCOUNT_SESSION_KEY]: createLoggedInSession({ syncStatus: 'pending' }),
    [PENDING_SYNC_KEY]: {
      openId: 'user-a',
      nickname: '小满妈妈',
      avatarUrl: '',
      records: [{ id: 'record-a' }],
      stages: { avatar: false, family: false, food: true }
    }
  })
  const service = createAccountService({
    storage,
    mergeLocalRecords: async () => {
      mergeCalls += 1
      await mergeGate
    }
  })

  const first = service.resumePendingSync()
  const second = service.resumePendingSync()
  await new Promise((resolve) => setImmediate(resolve))
  releaseMerge()
  await Promise.all([first, second])

  assert.equal(mergeCalls, 1)
  assert.equal(service.getSession().syncStatus, 'synced')
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="background|concurrent sync" tests/accountService.test.js`

预期：FAIL，`schedule` 和 `resumePendingSync` 尚未实现，且当前 `login` 会等待全部步骤。

- [ ] **步骤 3：实现待同步任务和单飞执行**

在 `createAccountService` 中加入调度器和单飞状态：

```js
const { classifyCloudIssue } = require('./cloudIssue')

const schedule = options.schedule || ((task) => Promise.resolve().then(task))
let syncPromise = null

function isRemoteAvatar(value) {
  return /^(cloud:\/\/|https?:\/\/)/i.test(String(value || '').trim())
}

function saveSession(patch) {
  const next = { ...getSession(), ...patch }
  storage.set(ACCOUNT_SESSION_KEY, next)
  return next
}
```

把 `login` 改为只等待身份和基础资料：

```js
async function login(profileInput = {}) {
  const identity = await callLogin()
  const openId = identity && (identity.openId || identity.openid || identity.userId)
  if (!openId) throw new Error('登录失败，未取得用户身份')

  const nickname = String(profileInput.nickname || '').trim()
  const localAvatarUrl = String(profileInput.avatarUrl || '').trim()
  const initialProfile = await callAccount({
    action: 'saveMyProfile',
    nickname,
    ...(isRemoteAvatar(localAvatarUrl) ? { avatarUrl: localAvatarUrl } : {})
  })
  const currentRecords = await Promise.resolve(getLocalRecords())
  const existingPending = storage.get(PENDING_SYNC_KEY)
  const records = existingPending && existingPending.openId === openId
    ? mergePendingRecords(existingPending.records, currentRecords)
    : (Array.isArray(currentRecords) ? currentRecords : [])
  storage.set(PENDING_SYNC_KEY, {
    openId,
    nickname,
    avatarUrl: localAvatarUrl,
    records,
    stages: {
      avatar: Boolean(localAvatarUrl && !isRemoteAvatar(localAvatarUrl)),
      family: true,
      food: records.length > 0
    }
  })
  const session = {
    loggedIn: true,
    openId,
    profile: { ...initialProfile, avatarUrl: localAvatarUrl || initialProfile.avatarUrl || '' },
    syncStatus: 'pending',
    syncIssue: null
  }
  storage.set(ACCOUNT_SESSION_KEY, session)
  await Promise.resolve(setCloudSession(true))
  Promise.resolve(schedule(() => resumePendingSync())).catch(() => {})
  return session
}
```

实现可恢复执行；每个成功阶段立即写回，失败保留剩余阶段：

```js
async function runPendingSync() {
  const session = getSession()
  const pending = storage.get(PENDING_SYNC_KEY)
  if (!session.loggedIn || !pending || pending.openId !== session.openId) return session
  const stages = { avatar: false, family: false, food: false, ...(pending.stages || {}) }
  let profile = session.profile || {}
  let family = session.family
  let firstError = null

  const avatarTask = stages.avatar
    ? uploadAvatar(session.openId, pending.avatarUrl)
    : Promise.resolve(isRemoteAvatar(profile.avatarUrl) ? profile.avatarUrl : '')
  const familyTask = stages.family
    ? getFamily({
      nickname: pending.nickname,
      avatarUrl: isRemoteAvatar(profile.avatarUrl) ? profile.avatarUrl : ''
    })
    : Promise.resolve(family)
  const [avatarResult, familyResult] = await Promise.allSettled([avatarTask, familyTask])

  if (familyResult.status === 'fulfilled') {
    family = familyResult.value || family
    stages.family = false
  } else {
    firstError = familyResult.reason
  }
  if (avatarResult.status === 'fulfilled' && stages.avatar) {
    try {
      profile = await callAccount({
        action: 'saveMyProfile',
        nickname: pending.nickname,
        avatarUrl: avatarResult.value
      })
      stages.avatar = false
    } catch (error) {
      firstError = firstError || error
    }
  } else if (avatarResult.status === 'rejected') {
    firstError = firstError || avatarResult.reason
  }
  if (stages.food && !stages.family) {
    try {
      await mergeLocalRecords(Array.isArray(pending.records) ? pending.records : [])
      stages.food = false
    } catch (error) {
      firstError = firstError || error
    }
  }

  const hasPending = Object.values(stages).some(Boolean)
  if (hasPending) {
    storage.set(PENDING_SYNC_KEY, { ...pending, stages })
  } else {
    storage.remove(PENDING_SYNC_KEY)
  }
  const issue = firstError ? classifyCloudIssue(firstError) : null
  return saveSession({
    profile,
    family,
    familyLoadError: Boolean(stages.family),
    syncStatus: hasPending ? 'pending' : 'synced',
    syncIssue: issue
  })
}

function resumePendingSync() {
  if (syncPromise) return syncPromise
  syncPromise = runPendingSync().finally(() => { syncPromise = null })
  return syncPromise
}
```

让 `retryPendingSync` 委托 `resumePendingSync`，并把 `resumePendingSync` 加入服务返回对象。

- [ ] **步骤 4：运行账号服务测试**

运行：`node --test tests/accountService.test.js tests/foodService.test.js`

预期：全部 PASS；需要把旧测试中“登录立即同步完成”的断言改为先执行注入的调度任务，再断言 `synced`。

- [ ] **步骤 5：提交后台同步改动**

```bash
git add utils/accountService.js tests/accountService.test.js
git commit -m "feat: resume account sync in background"
```

### 任务 4：修正账号页头像、昵称和登录反馈

**文件：**
- 修改：`pages/settings/account.js:27-132`
- 修改：`pages/settings/account.wxml:1-40`
- 修改：`pages/settings/account.wxss:5-115`
- 测试：`tests/accountSettingsPage.test.js`

- [ ] **步骤 1：编写失败的页面交互测试**

```js
test('account page accepts nickname input change and blur events and keeps avatar square', () => {
  const markup = readText('pages/settings/account.wxml')
  const stylesheet = readText('pages/settings/account.wxss')
  const page = createPageInstance(loadAccountPage({ getSession: () => ({ loggedIn: false }) }))

  page.onNicknameChange({ detail: { value: '微信妈妈' } })
  assert.equal(page.data.nickname, '微信妈妈')
  page.onNicknameBlur({ detail: { value: '微信妈妈 ' } })
  assert.equal(page.data.nickname, '微信妈妈 ')
  assert.match(markup, /bindchange="onNicknameChange"/)
  assert.match(markup, /bindblur="onNicknameBlur"/)
  assert.match(markup, /可选择微信昵称，也可以自己填写/)
  assert.match(stylesheet, /min-width:\s*126rpx/)
  assert.match(stylesheet, /max-width:\s*126rpx/)
  assert.match(stylesheet, /padding:\s*0/)
  assert.match(stylesheet, /\.avatar-button::after/)
})

test('successful login navigates back without waiting for pending background sync', async () => {
  const navigations = []
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: false, syncStatus: 'idle' }),
    login: async () => ({
      loggedIn: true,
      syncStatus: 'pending',
      profile: { nickname: '小满妈妈', avatarUrl: '/tmp/avatar.jpg' }
    })
  }))
  global.wx = { showToast() {}, navigateBack: (input) => navigations.push(input) }
  page.setData({ nickname: '小满妈妈', avatarUrl: '/tmp/avatar.jpg' })

  await page.saveAccount()

  delete global.wx
  assert.deepEqual(navigations, [{ delta: 1 }])
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="nickname input|without waiting" tests/accountSettingsPage.test.js`

预期：FAIL，昵称事件和方形按钮覆盖尚未实现，`pending` 登录仍提前 `return`。

- [ ] **步骤 3：实现页面事件和样式**

在页面脚本中加入：

```js
onNicknameChange(event) {
  this.setData({ nickname: event.detail.value })
},

onNicknameBlur(event) {
  this.setData({ nickname: event.detail.value })
},
```

登录成功分支统一返回：

```js
this.applySession(session)
wx.showToast({ title: wasLoggedIn ? '已保存' : '登录成功', icon: 'success' })
if (wx.navigateBack) wx.navigateBack({ delta: 1 })
```

昵称输入框改为：

```xml
<input class="input nickname-input" type="nickname" value="{{nickname}}" bindinput="onNicknameInput" bindchange="onNicknameChange" bindblur="onNicknameBlur" placeholder="请输入你的昵称" />
<view class="nickname-help">可选择微信昵称，也可以自己填写</view>
```

头像按钮加入完整尺寸覆盖：

```css
.avatar-button {
  position: relative;
  display: block;
  box-sizing: border-box;
  flex: 0 0 126rpx;
  width: 126rpx;
  min-width: 126rpx;
  max-width: 126rpx;
  height: 126rpx;
  min-height: 126rpx;
  max-height: 126rpx;
  margin: 0;
  padding: 0;
  line-height: 1;
  overflow: hidden;
}

.avatar-button::after { border: 0; }
```

同步卡片副文案改为“本机数据仍然保留，可以重新同步”。

- [ ] **步骤 4：运行账号页面测试**

运行：`node --test tests/accountSettingsPage.test.js`

预期：全部 PASS。

- [ ] **步骤 5：提交账号页面修正**

```bash
git add pages/settings/account.js pages/settings/account.wxml pages/settings/account.wxss tests/accountSettingsPage.test.js
git commit -m "fix: improve parent account login feedback"
```

### 任务 5：持久化个人家庭和正式家庭状态

**文件：**
- 修改：`cloudfunctions/familyApi/core.js:1-239`
- 修改：`cloudfunctions/familyApi/cloudStore.js:61-107`
- 修改：`cloudfunctions/familyApi/index.js:5-12`
- 测试：`tests/familyApiCore.test.js`
- 测试：`tests/cloudStore.test.js`

- [ ] **步骤 1：编写失败的家庭状态测试**

```js
test('default family is personal and becomes permanently formal after creating an invite', async () => {
  const store = createMemoryStore()
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const initial = await api.handle({ action: 'getMyFamily' })
  assert.equal(initial.data.family.kind, 'personal')

  await api.handle({ action: 'createInvite' })
  const family = await store.get('families', (item) => item.familyId === initial.data.family.familyId)
  assert.equal(family.kind, 'formal')
  assert.equal(family.formalizedReason, 'invite_created')
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

test('a formal family stays formal after its member count returns to one', async () => {
  const store = createMemoryStore()
  const api = createFamilyApi({ store, userId: 'owner', today: '2026-07-14' })
  const initial = await api.handle({ action: 'getMyFamily' })
  await api.handle({ action: 'createInvite' })
  const again = await api.handle({ action: 'getMyFamily' })
  assert.equal(again.data.family.kind, 'formal')
  assert.equal(again.data.family.familyId, initial.data.family.familyId)
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="personal|formal family" tests/familyApiCore.test.js`

预期：FAIL，当前家庭没有 `kind`，且正式单人家庭仍可被替换。

- [ ] **步骤 3：实现家庭类型归一和正式化**

默认家庭字段增加：

```js
kind: 'personal',
formalizedAt: null,
formalizedReason: null,
```

新增两个辅助函数：

```js
async function normalizeFamilyKind(store, family, membership, today) {
  if (!family || family.kind) return family
  const members = await listItems(store, 'family_members', (item) => item.familyId === family.familyId && item.status === 'active')
  const invites = await listItems(store, 'family_invites', (item) => item.familyId === family.familyId && ['active', 'used'].includes(item.status))
  const kind = members.length > 1 || invites.length > 0 || membership.role !== 'owner' ? 'formal' : 'personal'
  return updateItem(store, 'families', (item) => item.familyId === family.familyId, {
    kind,
    formalizedAt: kind === 'formal' ? today : null,
    formalizedReason: kind === 'formal' ? 'legacy_activity' : null,
    updatedAt: today
  })
}

async function formalizeFamily(store, familyId, today, reason) {
  const family = await getItem(store, 'families', (item) => item.familyId === familyId && item.status === 'active')
  if (!family || family.kind === 'formal') return family
  return updateItem(store, 'families', (item) => item.familyId === familyId, {
    kind: 'formal',
    formalizedAt: today,
    formalizedReason: reason,
    updatedAt: today
  })
}
```

在 `getMyFamily` 返回前调用 `normalizeFamilyKind`；在 `createInvite` 成功写入邀请后调用 `formalizeFamily(..., 'invite_created')`，正式化失败时立即把刚写入的邀请标记为 `revoked` 并返回失败。加入时先归一当前家庭，只有 `kind === 'personal'` 才允许迁移，否则返回：

```js
return {
  ok: false,
  code: 'ALREADY_IN_FORMAL_FAMILY',
  error: '你已经加入一个家庭，暂时无法加入其他家庭'
}
```

- [ ] **步骤 4：增加批量更新并扩展迁移集合**

在家庭云存储加入：

```js
async updateManyByFields(collection, fields, patch) {
  const removeValue = db.command && db.command.remove ? db.command.remove() : undefined
  const data = buildCloudUpdateData({}, patch, removeValue)
  return db.collection(collection).where(fields).update({ data })
}
```

将迁移函数改为迁移用户在个人家庭中的食材、采购计划和识别记录：

```js
async function moveUserFamilyData(store, userId, fromFamilyId, toFamilyId, today) {
  const collections = ['user_food_records', 'purchase_plans', 'recognition_logs']
  for (const collection of collections) {
    if (typeof store.updateManyByFields === 'function') {
      await store.updateManyByFields(collection, { familyId: fromFamilyId, userId }, { familyId: toFamilyId })
      continue
    }
    const records = await listItems(store, collection, (item) => item.familyId === fromFamilyId && item.userId === userId)
    for (const record of records) {
      await updateItem(store, collection, (item) => item._id === record._id || item.id === record.id, { familyId: toFamilyId })
    }
  }
  const sourceSettings = await getItem(store, 'family_settings', (item) => item.familyId === fromFamilyId)
  const targetSettings = await getItem(store, 'family_settings', (item) => item.familyId === toFamilyId)
  if (sourceSettings && !targetSettings) {
    await updateItem(
      store,
      'family_settings',
      (item) => item._id === sourceSettings._id || item.id === sourceSettings.id,
      { familyId: toFamilyId, updatedAt: today }
    )
  }
}
```

把加入流程中的调用同步改为 `moveUserFamilyData(store, userId, existing.familyId, invite.familyId, today)`。

把 `recognition_logs` 和 `purchase_plans` 加入 `familyCollections`。

- [ ] **步骤 5：运行家庭核心和云存储测试**

运行：`node --test tests/familyApiCore.test.js tests/cloudStore.test.js tests/foodApiCore.test.js`

预期：全部 PASS。

- [ ] **步骤 6：提交家庭状态模型**

```bash
git add cloudfunctions/familyApi/core.js cloudfunctions/familyApi/cloudStore.js cloudfunctions/familyApi/index.js tests/familyApiCore.test.js tests/cloudStore.test.js
git commit -m "feat: lock formal family membership"
```

### 任务 6：增加一次性邀请预览和幂等加入

**文件：**
- 修改：`cloudfunctions/familyApi/core.js:142-228`
- 修改：`utils/familyService.js:13-48`
- 测试：`tests/familyApiCore.test.js`
- 测试：`tests/familyService.test.js`

- [ ] **步骤 1：编写失败的邀请生命周期测试**

```js
test('invite preview hides private ids and an accepted invite is idempotent for its recipient', async () => {
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="invite preview|already used" tests/familyApiCore.test.js`

预期：FAIL，`getInvitePreview` 尚不存在，已使用邀请只会返回过期文案。

- [ ] **步骤 3：实现邀请预览和幂等判断**

读取邀请时不预先限定 `active`，按状态分支：

```js
const invite = await getItem(store, 'family_invites', (item) => item.inviteId === event.inviteId)
if (!invite || invite.expiresAt < today || invite.status === 'expired' || invite.status === 'revoked') {
  return { ok: false, code: 'INVITE_EXPIRED', error: '邀请已过期，请让家人重新发送邀请' }
}
if (invite.status === 'used') {
  const current = await getActiveMembership(store, userId)
  if (invite.usedBy === userId && current && current.familyId === invite.familyId) {
    return { ok: true, data: current }
  }
  return { ok: false, code: 'INVITE_USED', error: '这条邀请已经被使用，请联系邀请人重新发送' }
}
```

新增 `getInvitePreview`：

```js
if (event.action === 'getInvitePreview') {
  const invite = await getItem(store, 'family_invites', (item) => item.inviteId === event.inviteId)
  if (!invite || invite.status !== 'active' || invite.expiresAt < today) {
    return { ok: false, code: 'INVITE_EXPIRED', error: '邀请已失效，请联系邀请人重新发送' }
  }
  const family = await getItem(store, 'families', (item) => item.familyId === invite.familyId && item.status === 'active')
  const inviter = await getItem(store, 'family_members', (item) => item.familyId === invite.familyId && item.openId === invite.createdBy)
  const members = await listItems(store, 'family_members', (item) => item.familyId === invite.familyId && item.status === 'active')
  return {
    ok: true,
    data: {
      familyName: (family && family.name) || '家庭食材库',
      inviterName: (inviter && inviter.nickname) || '家人',
      memberCount: members.length,
      expiresAt: invite.expiresAt,
      status: invite.status
    }
  }
}
```

在 `familyService` 暴露：

```js
getInvitePreview(input) {
  return request('getInvitePreview', input)
},
```

- [ ] **步骤 4：运行邀请核心和服务测试**

运行：`node --test tests/familyApiCore.test.js tests/familyService.test.js`

预期：全部 PASS。

- [ ] **步骤 5：提交邀请生命周期**

```bash
git add cloudfunctions/familyApi/core.js utils/familyService.js tests/familyApiCore.test.js tests/familyService.test.js
git commit -m "feat: preview and consume family invites"
```

### 任务 7：保存微信分享邀请上下文

**文件：**
- 创建：`utils/inviteContext.js`
- 测试：`tests/inviteContext.test.js`

- [ ] **步骤 1：编写失败的邀请上下文测试**

```js
// tests/inviteContext.test.js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/inviteContext.test.js`

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现邀请上下文**

```js
// utils/inviteContext.js
const PENDING_FAMILY_INVITE_KEY = 'baby_food_pending_family_invite_v1'

function createWxStorage() {
  return {
    get: (key) => (typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(key) : ''),
    set: (key, value) => { if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value) },
    remove: (key) => { if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key) }
  }
}

function createInviteContext(storage = createWxStorage()) {
  return {
    save(value) {
      const inviteId = String(value || '').trim()
      if (!inviteId) return ''
      storage.set(PENDING_FAMILY_INVITE_KEY, inviteId)
      return inviteId
    },
    peek() {
      return String(storage.get(PENDING_FAMILY_INVITE_KEY) || '').trim()
    },
    consume() {
      const inviteId = this.peek()
      storage.remove(PENDING_FAMILY_INVITE_KEY)
      return inviteId
    },
    clear() {
      storage.remove(PENDING_FAMILY_INVITE_KEY)
    }
  }
}

let singleton
function getInviteContext() {
  if (!singleton) singleton = createInviteContext()
  return singleton
}

module.exports = { PENDING_FAMILY_INVITE_KEY, createInviteContext, getInviteContext }
```

- [ ] **步骤 4：运行邀请上下文测试**

运行：`node --test tests/inviteContext.test.js`

预期：PASS。

- [ ] **步骤 5：提交邀请上下文**

```bash
git add utils/inviteContext.js tests/inviteContext.test.js
git commit -m "feat: persist pending family invites"
```

### 任务 8：把家庭页改为微信分享和直接确认加入

**文件：**
- 修改：`pages/family/index.js:1-155`
- 修改：`pages/family/index.wxml:1-49`
- 修改：`pages/family/index.wxss:1-123`
- 测试：`tests/familyPage.test.js`

- [ ] **步骤 1：编写失败的分享路径和登录恢复测试**

```js
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

test('opening a shared invite while logged out stores it and opens account login', async () => {
  const navigations = []
  const inviteContext = { saveCalls: [], save(value) { this.saveCalls.push(value) }, peek: () => 'invite-a' }
  const page = createPageInstance(loadPage(
    'pages/family/index',
    {},
    { getSession: () => ({ loggedIn: false }) },
    inviteContext
  ))
  global.wx = { navigateTo: (input) => navigations.push(input) }

  page.onLoad({ inviteId: 'invite-a' })
  await page.onShow()

  delete global.wx
  assert.deepEqual(inviteContext.saveCalls, ['invite-a'])
  assert.deepEqual(navigations, [{ url: '/pages/settings/account?fromInvite=1' }])
})
```

扩展测试加载器，允许注入 `inviteContext`，方式与现有 `familyService`、`accountService` 注入一致。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="native WeChat|shared invite" tests/familyPage.test.js`

预期：FAIL，`prepareInvite`、`onShareAppMessage` 和邀请上下文尚未接入页面。

- [ ] **步骤 3：实现分享准备和分享卡片**

页面数据增加：

```js
invitePreview: null,
incomingInviteId: '',
preparingInvite: false,
joining: false,
loginPrompted: false,
showInviteCode: false,
```

实现：

```js
async prepareInvite() {
  if (this.data.preparingInvite) return
  this.setData({ preparingInvite: true })
  try {
    const invite = await familyService.createInvite(parentIdentity())
    this.setData({ invite })
  } catch (error) {
    wx.showToast({ title: userMessage(error, '邀请创建失败'), icon: 'none' })
  } finally {
    this.setData({ preparingInvite: false })
  }
},

onShareAppMessage() {
  const invite = this.data.invite || {}
  const session = accountService.getSession() || {}
  const nickname = (session.profile && session.profile.nickname) || '家人'
  const familyName = this.data.family.name || '家庭食材库'
  return {
    title: `${nickname}邀请你加入${familyName}`,
    path: `/pages/family/index?inviteId=${encodeURIComponent(invite.inviteId || '')}`
  }
},
```

WXML 主入口改为两阶段按钮：

```xml
<button wx:if="{{!invite}}" class="pixel-btn" bindtap="prepareInvite">
  {{preparingInvite ? '正在准备…' : '邀请家人'}}
</button>
<button wx:else class="pixel-btn" open-type="share">发送给微信家人</button>
```

- [ ] **步骤 4：实现打开分享、预览和确认加入**

```js
onLoad(options = {}) {
  const inviteId = String(options.inviteId || '').trim()
  if (inviteId) {
    inviteContext.save(inviteId)
    this.setData({ incomingInviteId: inviteId })
  }
},

async loadIncomingInvite() {
  const inviteId = this.data.incomingInviteId || inviteContext.peek()
  if (!inviteId) return false
  const session = accountService.getSession() || {}
  if (!session.loggedIn) {
    if (!this.data.loginPrompted) {
      this.setData({ loginPrompted: true })
      wx.navigateTo({ url: '/pages/settings/account?fromInvite=1' })
    }
    return true
  }
  this.setData({ loginPrompted: false })
  const invitePreview = await familyService.getInvitePreview({ inviteId })
  this.setData({ incomingInviteId: inviteId, invitePreview })
  return true
},

async confirmJoinInvite() {
  if (this.data.joining) return
  this.setData({ joining: true })
  try {
    await familyService.joinFamilyByInvite({
      inviteId: this.data.incomingInviteId,
      ...parentIdentity()
    })
    inviteContext.clear()
    this.setData({ incomingInviteId: '', invitePreview: null })
    wx.showToast({ title: '已加入家庭', icon: 'success' })
    await this.loadFamily()
  } catch (error) {
    wx.showToast({ title: error.message || '加入失败', icon: 'none' })
  } finally {
    this.setData({ joining: false })
  }
},
```

`onShow` 先调用 `loadIncomingInvite()`；没有待处理邀请时再调用 `loadFamily()`。邀请确认卡展示家庭名称、邀请人、成员数和“确认加入”；用户取消登录返回时展示“登录后查看邀请”按钮，不重复自动跳转。邀请码输入区域放入点击展开的“其他加入方式”。

- [ ] **步骤 5：运行家庭页面测试**

运行：`node --test tests/familyPage.test.js tests/familyService.test.js tests/inviteContext.test.js`

预期：全部 PASS。

- [ ] **步骤 6：提交微信分享邀请页面**

```bash
git add pages/family/index.js pages/family/index.wxml pages/family/index.wxss tests/familyPage.test.js
git commit -m "feat: join families from WeChat shares"
```

### 任务 9：自动恢复同步并优化“我的”页状态文案

**文件：**
- 修改：`pages/mine/index.js:27-91`
- 修改：`pages/mine/index.wxml:14-32`
- 测试：`tests/minePage.test.js`

- [ ] **步骤 1：编写失败的自动恢复测试**

```js
test('mine page resumes pending work once and shows issue-specific copy', async () => {
  let resumeCalls = 0
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({
        loggedIn: true,
        syncStatus: 'pending',
        syncIssue: { code: 'COLLECTION_MISSING' },
        profile: {},
        family: {}
      }),
      resumePendingSync: async () => {
        resumeCalls += 1
        return {
          loggedIn: true,
          syncStatus: 'pending',
          syncIssue: { code: 'COLLECTION_MISSING' },
          profile: {},
          family: {}
        }
      }
    },
    foodService: createMineFoodService()
  }))

  await page.onShow()

  assert.equal(resumeCalls, 1)
  assert.equal(page.data.account.syncText, '家庭信息暂不可用')
  assert.match(readText('pages/mine/index.wxml'), /\{\{account\.syncText\}\}/)
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="resumes pending" tests/minePage.test.js`

预期：FAIL，页面没有 `resumePendingSync` 调用和 `syncText`。

- [ ] **步骤 3：实现同步文案和自动恢复**

在 `pages/mine/index.js` 顶部引入 `syncIssueText`，并在 `decorateAccount` 中加入：

```js
const { syncIssueText } = require('../../utils/cloudIssue')

syncText: syncIssueText(account.syncIssue),
```

在 `onShow` 取得初始账号后执行一次恢复：

```js
let account = await accountService.refresh()
if (account.loggedIn && account.syncStatus === 'pending' && typeof accountService.resumePendingSync === 'function') {
  account = await accountService.resumePendingSync()
}
```

WXML 改为：

```xml
<view wx:if="{{account.loggedIn && account.syncStatus === 'pending'}}" class="sync-status" catchtap="retrySync">
  <text>{{account.syncText}}</text>
  <text class="sync-action">{{syncing ? '同步中…' : '重试 ›'}}</text>
</view>
```

- [ ] **步骤 4：运行“我的”页和账号服务测试**

运行：`node --test tests/minePage.test.js tests/accountService.test.js`

预期：全部 PASS。

- [ ] **步骤 5：提交同步状态页面改动**

```bash
git add pages/mine/index.js pages/mine/index.wxml tests/minePage.test.js
git commit -m "fix: explain and resume pending account sync"
```

### 任务 10：补齐部署文档和全量验证

**文件：**
- 修改：`docs/cloud-setup.md`
- 测试：`tests/foodDataSources.test.js`

- [ ] **步骤 1：编写失败的部署文档检查**

```js
test('cloud setup documents account collections environment id and family share verification', () => {
  const guide = fs.readFileSync(path.resolve(__dirname, '../docs/cloud-setup.md'), 'utf8')
  assert.match(guide, /user_profiles/)
  assert.match(guide, /环境选择器|环境设置/)
  assert.match(guide, /utils\/cloudConfig\.local\.js/)
  assert.match(guide, /微信分享/)
  assert.match(guide, /正式家庭/)
  assert.match(guide, /两个.*微信账号|双账号/)
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test --test-name-pattern="cloud setup documents" tests/foodDataSources.test.js`

预期：FAIL，当前文档尚未覆盖分享邀请和正式家庭限制的完整验收步骤。

- [ ] **步骤 3：更新云开发联调指南**

在 `docs/cloud-setup.md` 中明确写入：

```markdown
### 在哪里找环境 ID

打开微信开发者工具的“云开发”，在左上角环境选择器查看当前环境；也可以进入“设置 / 环境设置”复制环境 ID。把它写入 `utils/cloudConfig.local.js` 的 `cloudEnvId`，并确认上传云函数时选择的是同一个环境。

### 家庭分享真机验收

1. 准备两个从未加入正式家庭的微信账号。
2. 账号 A 登录并创建微信邀请，家庭应从个人家庭升级为正式家庭。
3. 账号 B 从微信分享卡片进入，登录后确认加入。
4. 两个账号应看到同一套家庭食材和成员列表。
5. 再准备账号 C 创建邀请，账号 A 打开后必须看到“你已经加入一个家庭，暂时无法加入其他家庭”。
6. 删除 `user_profiles` 或切换错误环境只用于开发故障演练，完成后立即恢复正确集合和环境。
```

同时把必要集合清单补齐 `recognition_logs` 和 `purchase_plans`，并保持部署顺序为 `login`、`accountApi`、`familyApi`、`foodApi`。

- [ ] **步骤 4：运行文档与相关回归测试**

运行：

```bash
node --test tests/foodDataSources.test.js tests/accountApiCore.test.js tests/accountCloudStore.test.js tests/accountService.test.js tests/accountSettingsPage.test.js tests/cloudIssue.test.js tests/cloudStore.test.js tests/familyApiCore.test.js tests/familyPage.test.js tests/familyService.test.js tests/inviteContext.test.js tests/minePage.test.js
```

预期：全部 PASS。

- [ ] **步骤 5：运行全量测试**

运行：`node --test tests/*.test.js`

预期：全部 PASS，失败数为 0。

- [ ] **步骤 6：执行微信开发者工具人工检查**

检查：

1. 账号头像在开发者工具和真机上均为正方形裁剪。
2. 点击微信昵称建议后输入框立即更新。
3. 点击登录后先返回“我的”页，后台同步状态可见且可重试。
4. 分享卡片路径包含 `inviteId`，接收者无需输入邀请码。
5. 已在正式家庭的账号无法接受第二个家庭邀请。
6. 云函数日志能区分集合缺失、权限、环境和网络错误。

- [ ] **步骤 7：提交文档和验收测试**

```bash
git add docs/cloud-setup.md tests/foodDataSources.test.js
git commit -m "docs: add account and family deployment checks"
```

## 最终检查

- [ ] 对照设计文档逐项确认：快速登录、后台同步、头像昵称、错误原因、微信分享、一次性邀请、正式家庭锁定、旧数据兼容和部署说明均有对应任务。
- [ ] 人工检查所有步骤均给出具体文件、接口、测试命令、预期结果和提交边界，不保留占位描述。
- [ ] 运行 `git status --short`，确认没有把 `.superpowers/` 或任务外文件加入提交。
