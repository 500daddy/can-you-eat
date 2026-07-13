# 家长账号、家庭共享与宝宝档案重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将“我的”页顶部从宝宝资料改为家长微信账号，并把家庭共享、宝宝档案、食材同步和退出登录拆分为职责清晰且可恢复的流程。

**架构：** 新增独立 `accountApi` 和客户端 `accountService` 管理家长资料与本机会话；家庭成员继续由 `familyApi` 管理，宝宝档案继续保存在 `family_settings`。食材服务新增幂等的 `mergeLocalRecords` 动作，在账号登录完成后将本机记录合并到当前家庭，并用审计日志记录同步操作。

**技术栈：** 微信小程序原生 WXML/WXSS/JavaScript、微信云开发、`wx-server-sdk`、Node.js `node:test`。

---

## 文件结构

### 新建文件

- `cloudfunctions/accountApi/core.js`：家长账号资料的读取、保存和家庭成员快照同步。
- `cloudfunctions/accountApi/index.js`：取得当前 OpenID，确保 `user_profiles` 集合存在并调用账号核心逻辑。
- `cloudfunctions/accountApi/cloudStore.js`：账号云函数自包含的数据库适配器，避免跨云函数目录依赖。
- `cloudfunctions/accountApi/package.json`：账号云函数部署依赖。
- `utils/accountService.js`：客户端账号会话、微信云函数调用、本机记录快照和同步状态编排。
- `pages/settings/account.js`：家长账号资料确认、保存、同步重试和退出逻辑。
- `pages/settings/account.wxml`：家长头像昵称、家庭摘要、同步状态和退出入口。
- `pages/settings/account.wxss`：账号设置页样式。
- `pages/settings/account.json`：账号设置页配置。
- `tests/accountApiCore.test.js`：账号资料与成员快照同步测试。
- `tests/accountService.test.js`：登录、待同步、重试和退出会话测试。
- `tests/accountSettingsPage.test.js`：账号设置页交互测试。

### 修改文件

- `cloudfunctions/foodApi/core.js`：新增本机食材幂等合并和同步审计。
- `utils/foodService.js`：暴露本机记录快照、云端合并和精确登录状态切换。
- `utils/assets.js`：提供与宝宝吉祥物区分开的家长默认头像资源。
- `app.js`：根据账号会话初始化云端食材模式。
- `app.json`：注册账号设置页。
- `pages/mine/index.js`：组合账号、家庭、同步状态和统计数据。
- `pages/mine/index.wxml`：顶部改成家长账号卡片，家庭摘要移入卡片。
- `pages/mine/index.wxss`：适配账号卡片的两层布局和异常状态。
- `pages/settings/baby.js`：删除登录标记和退出逻辑。
- `pages/settings/baby.wxml`：删除账号与数据区域。
- `pages/settings/baby.wxss`：删除退出区域样式。
- `pages/family/index.js`：创建默认家庭或加入家庭时携带家长资料快照。
- `tests/foodApiCore.test.js`：覆盖合并规则、幂等性和同步审计。
- `tests/foodService.test.js`：覆盖显式账号会话下的云端开关和本机快照。
- `tests/minePage.test.js`：覆盖未登录、已登录、待同步和家庭加载失败状态。
- `tests/babySettingsPage.test.js`：确认宝宝设置不再负责登录或退出。
- `tests/familyPage.test.js`：确认家庭调用携带家长昵称头像。
- `tests/appConfig.test.js`：确认应用启动时按账号会话决定云端模式。
- `tests/cloudStore.test.js`：确认账号云函数不依赖其他云函数目录，并兼容集合已存在错误。
- `docs/cloud-setup.md`：补充 `accountApi`、`user_profiles` 和部署顺序。

## 任务 1：实现家长账号云端资料

**文件：**
- 创建：`cloudfunctions/accountApi/core.js`
- 创建：`cloudfunctions/accountApi/index.js`
- 创建：`cloudfunctions/accountApi/cloudStore.js`
- 创建：`cloudfunctions/accountApi/package.json`
- 测试：`tests/accountApiCore.test.js`

- [ ] **步骤 1：编写失败的账号核心测试**

```js
test('saves parent profile and refreshes active family member snapshots', async () => {
  const store = createMemoryStore()
  await store.add('family_members', {
    id: 'member-owner',
    familyId: 'family-a',
    openId: 'user-a',
    nickname: '',
    avatarUrl: '',
    role: 'owner',
    status: 'active'
  })
  const api = createAccountApi({ store, userId: 'user-a', today: '2026-07-13' })

  const saved = await api.handle({
    action: 'saveMyProfile',
    nickname: '小满妈妈',
    avatarUrl: 'cloud://avatar-a.jpg'
  })
  const member = await store.get('family_members', (item) => item.openId === 'user-a')

  assert.equal(saved.ok, true)
  assert.equal(saved.data.openId, 'user-a')
  assert.equal(member.nickname, '小满妈妈')
  assert.equal(member.avatarUrl, 'cloud://avatar-a.jpg')
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test tests/accountApiCore.test.js`

预期：FAIL，报错 `Cannot find module '../cloudfunctions/accountApi/core'`。

- [ ] **步骤 3：实现账号核心动作**

在 `cloudfunctions/accountApi/core.js` 中实现 `getMyProfile` 和 `saveMyProfile`：

```js
function createAccountApi({ store, userId, today }) {
  return {
    async handle(event = {}) {
      if (event.action === 'getMyProfile') {
        const profile = await store.get('user_profiles', (item) => item.openId === userId)
        return { ok: true, data: profile }
      }

      if (event.action === 'saveMyProfile') {
        const nickname = String(event.nickname || '').trim()
        if (!nickname) return { ok: false, error: '请输入家长昵称' }
        const avatarUrl = String(event.avatarUrl || '').trim()
        const existing = await store.get('user_profiles', (item) => item.openId === userId)
        const patch = { nickname, avatarUrl, profileUpdatedAt: today, updatedAt: today }
        const profile = existing
          ? await store.update('user_profiles', (item) => item.openId === userId, patch)
          : await store.add('user_profiles', {
            id: `profile_${userId}`,
            openId: userId,
            ...patch,
            createdAt: today
          })
        const memberships = await store.list(
          'family_members',
          (item) => item.openId === userId && item.status === 'active'
        )
        for (const membership of memberships) {
          await store.update(
            'family_members',
            (item) => item._id === membership._id || item.id === membership.id,
            { nickname, avatarUrl, updatedAt: today }
          )
        }
        return { ok: true, data: profile }
      }

      return { ok: false, error: `Unknown action: ${event.action || 'empty'}` }
    }
  }
}

module.exports = { createAccountApi }
```

`cloudfunctions/accountApi/index.js` 使用 `cloud.getWXContext().OPENID`，并在调用核心逻辑前确保 `user_profiles` 和 `family_members` 集合可访问。`cloudStore.js` 复制 `familyApi/cloudStore.js` 的自包含接口与“集合已存在”兼容判断，不能引用兄弟云函数目录。

- [ ] **步骤 4：运行账号核心和云存储测试**

运行：`node --test tests/accountApiCore.test.js tests/cloudStore.test.js`

预期：PASS，且账号云函数目录不存在 `require('../familyApi/...')` 或 `require('../foodApi/...')`。

- [ ] **步骤 5：提交账号云端资料**

```bash
git add cloudfunctions/accountApi tests/accountApiCore.test.js tests/cloudStore.test.js
git commit -m "feat: add parent account profile api"
```

## 任务 2：实现客户端账号会话服务

**文件：**
- 创建：`utils/accountService.js`
- 测试：`tests/accountService.test.js`
- 修改：`utils/foodService.js`
- 测试：`tests/foodService.test.js`

- [ ] **步骤 1：编写失败的账号服务测试**

```js
test('logs in, creates family context, and keeps failed local sync pending', async () => {
  const storage = createStorage()
  const service = createAccountService({
    storage,
    callLogin: async () => ({ openid: 'user-a' }),
    uploadAvatar: async () => 'cloud://account-avatars/user-a/a.jpg',
    callAccount: async () => ({ openId: 'user-a', nickname: '小满妈妈', avatarUrl: 'cloud://account-avatars/user-a/a.jpg' }),
    getFamily: async () => ({ family: { familyId: 'family-a' }, membership: { role: 'owner' }, members: [] }),
    getLocalRecords: () => [{ id: 'record-local', updatedAt: '2026-07-13' }],
    mergeLocalRecords: async () => { throw new Error('network failed') },
    setCloudSession: () => {}
  })

  const result = await service.login({ nickname: '小满妈妈', avatarUrl: '/a.jpg' })

  assert.equal(result.loggedIn, true)
  assert.equal(result.syncStatus, 'pending')
  assert.equal(service.getSession().openId, 'user-a')
  assert.equal(storage.get(PENDING_SYNC_KEY).records[0].id, 'record-local')
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test tests/accountService.test.js tests/foodService.test.js`

预期：FAIL，报错 `Cannot find module '../utils/accountService'`。

- [ ] **步骤 3：实现会话、登录和待同步状态**

`utils/accountService.js` 定义并导出以下稳定接口：

```js
const ACCOUNT_SESSION_KEY = 'baby_food_account_session_v1'
const PENDING_SYNC_KEY = 'baby_food_pending_sync_v1'

function createAccountService(options = {}) {
  const storage = options.storage || createWxStorage()
  const callLogin = options.callLogin || defaultCallLogin
  const callAccount = options.callAccount || defaultCallAccount
  const uploadAvatar = options.uploadAvatar || defaultUploadAvatar
  const getFamily = options.getFamily || ((input) => getFamilyService().getMyFamily(input))
  const getLocalRecords = options.getLocalRecords || (() => getFoodService().getLocalRecordsSnapshot())
  const mergeLocalRecords = options.mergeLocalRecords || ((records) => getFoodService().mergeLocalRecords(records))
  const setCloudSession = options.setCloudSession || setDefaultCloudSession

  function getSession() {
    return storage.get(ACCOUNT_SESSION_KEY) || { loggedIn: false, syncStatus: 'idle' }
  }

  async function login(profileInput) {
    const identity = await callLogin()
    const avatarUrl = await uploadAvatar(identity.openid, profileInput.avatarUrl)
    const profile = await callAccount({
      action: 'saveMyProfile',
      nickname: profileInput.nickname,
      avatarUrl
    })
    const family = await getFamily({
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl
    })
    const records = getLocalRecords()
    storage.set(PENDING_SYNC_KEY, { openId: identity.openid, records })
    let syncStatus = 'synced'
    try {
      await mergeLocalRecords(records)
      storage.remove(PENDING_SYNC_KEY)
    } catch (error) {
      syncStatus = 'pending'
    }
    const session = {
      loggedIn: true,
      openId: identity.openid,
      profile,
      family,
      syncStatus
    }
    storage.set(ACCOUNT_SESSION_KEY, session)
    setCloudSession(true)
    return session
  }

  return { getSession, login }
}
```

默认适配器必须明确调用以下云函数：

```js
function defaultCallLogin() {
  return wx.cloud.callFunction({ name: 'login', data: {} }).then(unwrapCloudResult)
}

function defaultCallAccount(data) {
  return wx.cloud.callFunction({ name: 'accountApi', data }).then(unwrapCloudResult)
}

function defaultUploadAvatar(openId, avatarUrl) {
  if (!avatarUrl || /^(cloud:\/\/|https?:\/\/)/.test(avatarUrl)) return Promise.resolve(avatarUrl || '')
  const extension = String(avatarUrl).split('.').pop().toLowerCase()
  const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg'
  const cloudPath = `account-avatars/${openId}/${Date.now()}.${safeExtension}`
  return wx.cloud.uploadFile({ cloudPath, filePath: avatarUrl }).then((result) => result.fileID)
}

function setDefaultCloudSession(loggedIn) {
  if (loggedIn) {
    markLoggedIn()
    return
  }
  markLoggedOut()
  resetFoodService()
  resetFamilyService()
}
```

补充 `updateProfile()`、`retryPendingSync()`、`refresh()` 和 `logout()`：

```js
async function updateProfile(profileInput) {
  const session = getSession()
  if (!session.loggedIn) throw new Error('请先登录')
  const avatarUrl = await uploadAvatar(session.openId, profileInput.avatarUrl)
  const profile = await callAccount({
    action: 'saveMyProfile',
    nickname: profileInput.nickname,
    avatarUrl
  })
  const next = { ...session, profile }
  storage.set(ACCOUNT_SESSION_KEY, next)
  return next
}

async function retryPendingSync() {
  const session = getSession()
  const pending = storage.get(PENDING_SYNC_KEY)
  if (!session.loggedIn || !pending || pending.openId !== session.openId) return session
  await mergeLocalRecords(pending.records)
  storage.remove(PENDING_SYNC_KEY)
  const next = { ...session, syncStatus: 'synced' }
  storage.set(ACCOUNT_SESSION_KEY, next)
  return next
}

async function refresh() {
  const session = getSession()
  if (!session.loggedIn) return session
  let profile = session.profile
  try {
    profile = await callAccount({ action: 'getMyProfile' }) || profile
  } catch (error) {
    profile = session.profile
  }
  try {
    const family = await getFamily({ nickname: profile.nickname, avatarUrl: profile.avatarUrl })
    const next = { ...session, profile, family, familyLoadError: false }
    storage.set(ACCOUNT_SESSION_KEY, next)
    return next
  } catch (error) {
    const next = { ...session, profile, familyLoadError: true }
    storage.set(ACCOUNT_SESSION_KEY, next)
    return next
  }
}

function logout() {
  storage.remove(ACCOUNT_SESSION_KEY)
  setCloudSession(false)
  return { loggedIn: false, syncStatus: 'idle' }
}
```

`retryPendingSync()` 只同步 `openId` 与当前会话一致的待同步记录。`logout()` 保留按 OpenID 归属的 `PENDING_SYNC_KEY`，但清除页面可读取的家庭缓存。最终导出 `ACCOUNT_SESSION_KEY`、`PENDING_SYNC_KEY`、`createAccountService`、`getAccountService` 和 `resetAccountService`。

在 `utils/foodService.js` 增加：

```js
getLocalRecordsSnapshot() {
  return repo.getAllRawRecords()
},

async mergeLocalRecords(records) {
  return callCloud({ action: 'mergeLocalRecords', records })
}
```

- [ ] **步骤 4：运行账号服务测试**

运行：`node --test tests/accountService.test.js tests/foodService.test.js`

预期：PASS，覆盖登录成功、同步失败、重试成功、不同 OpenID 不误同步和退出不调用云端删除。

- [ ] **步骤 5：提交客户端账号服务**

```bash
git add utils/accountService.js utils/foodService.js tests/accountService.test.js tests/foodService.test.js
git commit -m "feat: add parent account session service"
```

## 任务 3：实现本机食材幂等合并

**文件：**
- 修改：`cloudfunctions/foodApi/core.js`
- 测试：`tests/foodApiCore.test.js`

- [ ] **步骤 1：编写失败的合并测试**

```js
test('merges local records idempotently and keeps the newest duplicate', async () => {
  const store = createMemoryStore()
  const api = createFoodApi({ store, userId: 'owner', today: '2026-07-13' })
  await api.handle({ action: 'getFoodRecords' })
  const family = await store.get('family_members', (item) => item.openId === 'owner')
  await store.add('user_food_records', {
    id: 'record-shared',
    familyId: family.familyId,
    userId: 'owner',
    foodBaseId: 'carrot',
    note: '云端新备注',
    updatedAt: '2026-07-13'
  })

  const input = [
    { id: 'record-shared', foodBaseId: 'carrot', note: '本机旧备注', updatedAt: '2026-07-12' },
    { id: 'record-local', foodBaseId: 'egg', purchaseDate: '2026-07-13', updatedAt: '2026-07-13' }
  ]
  const first = await api.handle({ action: 'mergeLocalRecords', records: input })
  const second = await api.handle({ action: 'mergeLocalRecords', records: input })
  const records = await store.list('user_food_records', (item) => item.familyId === family.familyId)

  assert.deepEqual(first.data, { added: 1, updated: 0, skipped: 1 })
  assert.deepEqual(second.data, { added: 0, updated: 0, skipped: 2 })
  assert.equal(records.length, 2)
  assert.equal(records.find((item) => item.id === 'record-shared').note, '云端新备注')
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test --test-name-pattern="merges local records" tests/foodApiCore.test.js`

预期：FAIL，返回 `Unknown action: mergeLocalRecords`。

- [ ] **步骤 3：实现净化、时间比较和幂等写入**

在 `cloudfunctions/foodApi/core.js` 增加固定白名单，不能把客户端传来的 `familyId`、`userId` 或 `_id` 写入云端：

```js
function sanitizeImportedRecord(input, familyId, userId, today) {
  return compactObject({
    id: String(input.id || makeId('record')),
    familyId,
    userId,
    foodBaseId: input.foodBaseId || 'custom',
    customFoodName: input.customFoodName || '',
    purchaseDate: input.purchaseDate || today,
    storageMethod: input.storageMethod || 'fridge',
    quantity: input.quantity || '',
    unit: input.unit || '',
    isBabyFood: input.isBabyFood !== false,
    note: input.note || '',
    status: input.status,
    createdAt: input.createdAt || today,
    updatedAt: input.updatedAt || input.createdAt || today
  })
}
```

`mergeLocalRecords` 最多接受 200 条记录：先取得当前家庭和编辑权限，再按 `id` 建立云端索引。仅本机存在时 `add`；双方都有 `updatedAt` 且本机较新时 `update`；缺少时间或云端较新时跳过。完成后写一条 `local_records_merged` 审计日志，摘要包含新增和更新数量。

- [ ] **步骤 4：运行食材和家庭回归测试**

运行：`node --test tests/foodApiCore.test.js tests/familyApiCore.test.js`

预期：PASS，现有新增、编辑、家庭共享和审计测试不回归。

- [ ] **步骤 5：提交本机食材合并**

```bash
git add cloudfunctions/foodApi/core.js tests/foodApiCore.test.js
git commit -m "feat: merge local foods into family library"
```

## 任务 4：按账号会话初始化和退出云端模式

**文件：**
- 修改：`app.js`
- 修改：`utils/foodService.js`
- 测试：`tests/appConfig.test.js`
- 测试：`tests/foodService.test.js`

- [ ] **步骤 1：编写失败的启动与退出测试**

```js
test('cloud food mode starts only for a saved parent session', () => {
  const appJs = readText('app.js')

  assert.match(appJs, /ACCOUNT_SESSION_KEY/)
  assert.match(appJs, /accountLoggedIn/)
  assert.match(appJs, /useCloudFoodApi:\s*cloudFoodApiConfigured\s*&&\s*accountLoggedIn/)
})

test('logout clears family-facing local data without using clearStorageSync', () => {
  const foodService = readText('utils/foodService.js')

  assert.doesNotMatch(foodService, /clearStorageSync/)
  assert.match(foodService, /babyName:\s*''/)
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test tests/appConfig.test.js tests/foodService.test.js`

预期：FAIL，应用仍只依据旧的 `loggedOut` 标记初始化。

- [ ] **步骤 3：实现显式账号会话启动**

`app.js` 保存云能力和当前会话两个独立状态：

```js
const ACCOUNT_SESSION_KEY = 'baby_food_account_session_v1'

onLaunch() {
  const session = wx.getStorageSync ? wx.getStorageSync(ACCOUNT_SESSION_KEY) : null
  const accountLoggedIn = Boolean(session && session.loggedIn)
  this.globalData.accountLoggedIn = accountLoggedIn
  this.globalData.loggedOut = !accountLoggedIn
  this.globalData.cloudFoodApiConfigured = cloudConfig.useCloudFoodApi === true
  this.globalData.useCloudFoodApi = this.globalData.cloudFoodApiConfigured && accountLoggedIn
}
```

调整 `markLoggedIn()`：只在 `cloudFoodApiConfigured === true` 时开启 `useCloudFoodApi`。调整 `markLoggedOut()`：清空食材、采购计划和宝宝设置缓存，但宝宝昵称使用空字符串，不再写入“未登录”。不能调用 `wx.clearStorageSync()`。

- [ ] **步骤 4：运行启动和服务测试**

运行：`node --test tests/appConfig.test.js tests/foodService.test.js tests/foodRepository.test.js`

预期：PASS，未登录用户仍能保存空白本机食材库，已登录用户才访问云端家庭数据。

- [ ] **步骤 5：提交会话启动逻辑**

```bash
git add app.js utils/foodService.js tests/appConfig.test.js tests/foodService.test.js tests/foodRepository.test.js
git commit -m "fix: scope cloud food mode to parent session"
```

## 任务 5：重构“我的”页账号卡片

**文件：**
- 修改：`pages/mine/index.js`
- 修改：`pages/mine/index.wxml`
- 修改：`pages/mine/index.wxss`
- 测试：`tests/minePage.test.js`

- [ ] **步骤 1：编写失败的页面状态测试**

```js
test('mine page shows parent account and nests family sharing in the profile card', async () => {
  const markup = readText('pages/mine/index.wxml')

  assert.match(markup, /account\.profile\.avatarUrl/)
  assert.match(markup, /微信登录/)
  assert.match(markup, /家庭共享/)
  assert.match(markup, /family-summary/)
  assert.doesNotMatch(markup, /settings\.babyAvatarImage/)
  assert.doesNotMatch(markup, /宝宝信息未设置/)
  assert.doesNotMatch(markup, /class="list-cell" bindtap="goFamily"/)
})

test('mine page retries pending sync from the account card', async () => {
  let retried = 0
  const page = createPageInstance(loadMinePage({
    accountService: {
      refresh: async () => ({ loggedIn: true, syncStatus: 'pending', profile: {}, family: {} }),
      retryPendingSync: async () => { retried += 1 }
    },
    foodService: createMineFoodService()
  }))

  await page.retrySync()

  assert.equal(retried, 1)
})
```

同时增加以下独立测试：

- 未登录点击“微信登录”跳转 `/pages/settings/account`。
- 已登录点击“账号设置”跳转同一页面。
- 家庭摘要点击进入 `/pages/family/index`。
- `syncStatus === 'pending'` 时显示“待同步”并调用 `retryPendingSync()`。
- 家庭加载失败显示“加载失败，点击重试”，不回退到默认家庭文案。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test tests/minePage.test.js`

预期：FAIL，顶部仍绑定宝宝资料。

- [ ] **步骤 3：实现账号与家庭组合状态**

`pages/mine/index.js` 的 `onShow()` 并行读取账号会话和食材统计：

```js
async onShow() {
  const [account, stats, settings] = await Promise.all([
    accountService.refresh(),
    foodService.getStats(),
    foodService.getSettings()
  ])
  this.setData({
    account,
    stats: decorateStats(stats),
    babySettingNote: settings.babyProfileConfigured
      ? settings.babyAgeText
      : '待设置'
  })
}
```

WXML 顶部使用单一卡片的上下两层：上层展示家长账号或登录按钮；下层仅在登录后展示家庭名称、身份和成员数。普通设置卡只保留宝宝模式与提醒设置。

- [ ] **步骤 4：运行“我的”页和查询回归测试**

运行：`node --test tests/minePage.test.js tests/pageQuery.test.js tests/homePage.test.js`

预期：PASS，四个统计卡原有跳转行为保持不变。

- [ ] **步骤 5：提交“我的”页重构**

```bash
git add pages/mine/index.js pages/mine/index.wxml pages/mine/index.wxss tests/minePage.test.js
git commit -m "feat: show parent account on mine page"
```

## 任务 6：新增账号设置页并清理宝宝设置职责

**文件：**
- 创建：`pages/settings/account.js`
- 创建：`pages/settings/account.wxml`
- 创建：`pages/settings/account.wxss`
- 创建：`pages/settings/account.json`
- 修改：`app.json`
- 修改：`utils/assets.js`
- 修改：`pages/settings/baby.js`
- 修改：`pages/settings/baby.wxml`
- 修改：`pages/settings/baby.wxss`
- 测试：`tests/accountSettingsPage.test.js`
- 测试：`tests/babySettingsPage.test.js`

- [ ] **步骤 1：编写失败的账号页和职责测试**

```js
test('account settings uses WeChat avatar and nickname controls', () => {
  const markup = readText('pages/settings/account.wxml')

  assert.match(markup, /open-type="chooseAvatar"/)
  assert.match(markup, /bindchooseavatar="onChooseAvatar"/)
  assert.match(markup, /type="nickname"/)
  assert.match(markup, /登录并同步|保存账号信息/)
  assert.match(markup, /退出登录/)
})

test('account settings logs in only after a valid parent nickname', async () => {
  const calls = []
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: false }),
    login: async (input) => { calls.push(input); return { loggedIn: true } }
  }))
  page.setData({ nickname: '小满妈妈', avatarUrl: '/tmp/avatar.jpg' })

  await page.saveAccount()

  assert.deepEqual(calls, [{ nickname: '小满妈妈', avatarUrl: '/tmp/avatar.jpg' }])
})

test('baby settings no longer owns login or logout', () => {
  const script = readText('pages/settings/baby.js')
  const markup = readText('pages/settings/baby.wxml')

  assert.doesNotMatch(script, /markLoggedIn|markLoggedOut|logout\(\)/)
  assert.doesNotMatch(markup, /退出登录|账号与数据/)
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test tests/accountSettingsPage.test.js tests/babySettingsPage.test.js tests/appConfig.test.js`

预期：FAIL，账号设置页尚未注册，宝宝页仍包含退出逻辑。

- [ ] **步骤 3：实现账号设置交互**

WXML 使用微信当前支持的用户主动填写能力：

```xml
<button class="avatar-button" open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image class="account-avatar" src="{{avatarUrl || assets.account.defaultAvatar}}" mode="aspectFill" />
</button>
<input class="input" type="nickname" value="{{nickname}}" bindinput="onNicknameInput" placeholder="请输入家长昵称" />
<view class="button-primary" bindtap="saveAccount">
  {{loggedIn ? '保存账号信息' : '登录并同步'}}
</view>
```

在 `utils/assets.js` 增加 `account.defaultAvatar`，使用现有 `nav_pixel_mine_active.png`，不复用宝宝吉祥物作为家长头像。

`onChooseAvatar(e)` 只暂存 `e.detail.avatarUrl`；`accountService.login()` 或 `updateProfile()` 负责先上传云存储，再把长期有效的 `fileID` 写入 `user_profiles`。`saveAccount()` 在昵称为空时提示“请输入家长昵称”；首次保存调用 `accountService.login()`，已登录保存调用 `accountService.updateProfile()`。按钮处理期间禁用重复点击，并分别展示“正在登录”“正在同步”“已保存”。退出弹窗只说明“这台设备将退出家庭食材库，云端记录不会删除”。

从 `pages/settings/baby.js` 删除 `markLoggedIn()` 调用、退出确认、`clearStorageSync()` 和跳转逻辑；保存宝宝资料只调用 `foodService.updateSettings()`。

- [ ] **步骤 4：运行账号页和宝宝页测试**

运行：`node --test tests/accountSettingsPage.test.js tests/babySettingsPage.test.js tests/appConfig.test.js`

预期：PASS，宝宝资料保存不会改变账号登录状态，账号退出后返回“我的”页。

- [ ] **步骤 5：提交账号设置页**

```bash
git add app.json utils/assets.js pages/settings/account.js pages/settings/account.wxml pages/settings/account.wxss pages/settings/account.json pages/settings/baby.js pages/settings/baby.wxml pages/settings/baby.wxss tests/accountSettingsPage.test.js tests/babySettingsPage.test.js tests/appConfig.test.js
git commit -m "feat: add parent account settings page"
```

## 任务 7：贯通家庭成员身份和审计快照

**文件：**
- 修改：`pages/family/index.js`
- 修改：`cloudfunctions/foodApi/core.js`
- 测试：`tests/familyPage.test.js`
- 测试：`tests/foodApiCore.test.js`

- [ ] **步骤 1：编写失败的家庭身份测试**

```js
test('family entry sends the cached parent identity when creating or joining', async () => {
  const calls = []
  const page = createPageInstance(loadFamilyPage({
    accountService: {
      getSession: () => ({ profile: { nickname: '小满妈妈', avatarUrl: '/a.jpg' } })
    },
    familyService: {
      getMyFamily: async (input) => {
        calls.push(input)
        return { family: { familyId: 'family-a' }, membership: { role: 'owner' }, members: [] }
      }
    }
  }))

  await page.loadFamily()

  assert.deepEqual(calls[0], { nickname: '小满妈妈', avatarUrl: '/a.jpg' })
})
```

审计测试增加 `actorAvatar` 断言，并确认家长之后修改昵称不会改写已经生成的日志对象。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test --test-name-pattern="identity|audit" tests/familyPage.test.js tests/foodApiCore.test.js`

预期：FAIL，家庭页面没有账号服务依赖，审计日志没有 `actorAvatar`。

- [ ] **步骤 3：实现身份快照贯通**

家庭页面从 `accountService.getSession().profile` 读取昵称头像，并传给 `getMyFamily()` 和 `joinFamilyByInvite()`。食材审计统一从当前有效 `family_members` 读取快照：

```js
return store.add('family_audit_logs', {
  id: makeId('audit'),
  familyId,
  actorOpenId: userId,
  actorName: input.actorName || membership.nickname || '家庭成员',
  actorAvatar: membership.avatarUrl || '',
  action: input.action,
  targetType: input.targetType,
  targetId: input.targetId,
  summary: input.summary,
  before: input.before || null,
  after: input.after || null,
  createdAt: today
})
```

- [ ] **步骤 4：运行家庭与审计回归测试**

运行：`node --test tests/familyPage.test.js tests/familyApiCore.test.js tests/familyService.test.js tests/foodApiCore.test.js`

预期：PASS，成员权限、邀请加入和历史日志均保持正确。

- [ ] **步骤 5：提交身份快照贯通**

```bash
git add pages/family/index.js cloudfunctions/foodApi/core.js tests/familyPage.test.js tests/foodApiCore.test.js
git commit -m "feat: identify parents in family audit logs"
```

## 任务 8：部署文档与整体验证

**文件：**
- 修改：`docs/cloud-setup.md`
- 验证：`cloudfunctions/accountApi/index.js`
- 验证：`cloudfunctions/foodApi/index.js`
- 验证：`pages/mine/index.js`
- 验证：`pages/settings/account.js`

- [ ] **步骤 1：更新云开发部署说明**

在 `docs/cloud-setup.md` 增加明确顺序：

1. 创建或确认 `user_profiles` 集合。
2. 上传并部署 `accountApi`，选择“云端安装依赖”。
3. 重新上传 `familyApi` 和 `foodApi`。
4. 将 `utils/cloudConfig.local.js` 的 `useCloudFoodApi` 设为 `true`。
5. 先用新账号验证 1 人家庭，再验证邀请、加入和本机数据同步。

同时写明：`accountApi` 自动创建集合失败时，应在云控制台手动创建 `user_profiles`；不能把 API Key 或其他密钥写进小程序客户端。

- [ ] **步骤 2：运行完整自动化测试**

运行：`node --test tests/*.test.js`

预期：全部 PASS，无失败、取消或超时。

- [ ] **步骤 3：运行语法和差异检查**

运行：

```bash
node --check cloudfunctions/accountApi/core.js
node --check cloudfunctions/accountApi/index.js
node --check cloudfunctions/foodApi/core.js
node --check utils/accountService.js
node --check pages/mine/index.js
node --check pages/settings/account.js
git diff --check
```

预期：所有命令退出码为 0，`git diff --check` 无输出。

- [ ] **步骤 4：在微信开发者工具完成手工验收**

按以下固定场景检查：

1. 清除小程序数据后进入“我的”，顶部只显示家长登录入口。
2. 未登录添加一条食材，再进入账号设置确认头像昵称并登录。
3. 登录完成后家庭食材库包含刚才的本机记录，账号卡片显示 1 人家庭。
4. 断网后再制造一条待同步记录，恢复网络后点击“待同步”，确认只新增一次。
5. 创建邀请，让第二个微信账号加入，双方看到相同宝宝档案和食材库。
6. 第二个账号编辑食材，详情日志显示第二个家长昵称。
7. 退出登录，确认原家庭与宝宝资料不可见，本机食材库为空。
8. 重新登录，确认云端家庭资料恢复。

- [ ] **步骤 5：提交部署文档和最终修正**

```bash
git add docs/cloud-setup.md
git commit -m "docs: add parent account deployment steps"
```

## 完成标准

- “我的”页顶部不再展示宝宝资料。
- 微信头像昵称与宝宝头像昵称使用不同数据字段和页面。
- 家庭共享只在家长账号区域出现一次。
- 本机记录同步满足幂等、较新版本优先和失败不丢数据。
- 退出登录不会删除云端家庭数据，也不会向未登录状态暴露家庭缓存。
- 全部自动化测试、语法检查和八项手工验收通过。
