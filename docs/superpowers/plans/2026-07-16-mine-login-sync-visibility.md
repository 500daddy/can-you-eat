# “我的”页登录卡与同步提示实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将未登录账号卡改为 A1 单登录入口，并从用户界面移除长期未同步和手动重试提示。

**架构：** 后台同步仍由 `accountService.resumePendingSync()` 管理，页面只移除非必要的同步状态渲染与手动重试方法。未登录时不渲染头像节点，账号主行作为唯一登录入口，家庭组行降级为非交互的功能预告。

**技术栈：** 微信小程序 WXML/WXSS/CommonJS，Node.js `node:test`。

---

## 文件结构

- 修改 `pages/mine/index.wxml`：A1 未登录卡片结构，移除同步状态条。
- 修改 `pages/mine/index.wxss`：无头像的未登录排版与“登录后可用”弱状态。
- 修改 `pages/mine/index.js`：保留后台同步恢复，删除页面同步文案与手动重试状态。
- 修改 `pages/settings/account.wxml`：移除长期未同步卡片。
- 修改 `pages/settings/account.wxss`：删除已失效的同步卡片样式。
- 修改 `pages/settings/account.js`：删除仅供页面手动重试的状态与方法。
- 修改 `tests/minePage.test.js`：覆盖 A1 布局、单一登录动作和静默后台同步。
- 修改 `tests/accountSettingsPage.test.js`：覆盖账号页不显示同步卡且登录流程不受影响。

### 任务 1：实现 A1 未登录卡与静默后台同步

**文件：**
- 修改：`tests/minePage.test.js:81-282`
- 修改：`pages/mine/index.wxml:1-42`
- 修改：`pages/mine/index.wxss:8-128`
- 修改：`pages/mine/index.js:1-139`

- [ ] **步骤 1：编写失败的 A1 结构测试**

在 `tests/minePage.test.js` 的账号卡测试中加入以下断言，并删除对默认头像必须始终渲染的断言：

```js
assert.match(markup, /<image wx:if="\{\{account\.loggedIn\}\}" class="account-avatar"/)
assert.match(markup, /class="login-family-hint"/)
assert.doesNotMatch(markup, /class="login-family-hint" bindtap="goAccount"/)
assert.match(markup, />登录后可用<\/view>/)
assert.doesNotMatch(markup, />去登录 ›<\/view>/)
assert.doesNotMatch(markup, /sync-status|bindtap="retrySync"/)
```

将原“区分正在同步与同步失败”测试替换为静默后台同步测试：

```js
test('mine page resumes pending sync without exposing persistent sync controls', async () => {
  let resumeCalls = 0
  const pending = {
    loggedIn: true,
    syncStatus: 'pending',
    syncIssue: { code: 'NETWORK_ERROR' },
    profile: { nickname: '小满妈妈' },
    family: {}
  }
  const page = createPageInstance(loadMinePage({
    accountService: {
      getSession: () => pending,
      refresh: async () => pending,
      resumePendingSync: async () => {
        resumeCalls += 1
        return pending
      }
    },
    foodService: createMineFoodService()
  }))

  await page.onShow()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(resumeCalls, 1)
  assert.doesNotMatch(readText('pages/mine/index.wxml'), /sync-status|retrySync/)
  assert.equal(typeof page.retrySync, 'undefined')
})
```

- [ ] **步骤 2：运行定向测试并确认失败**

运行：

```bash
node --test --test-name-pattern="parent account|resumes pending sync" tests/minePage.test.js
```

预期：FAIL，因为未登录头像仍被渲染，家庭组行仍可点击，同步状态条与 `retrySync` 仍存在。

- [ ] **步骤 3：实现最小 A1 结构**

在 `pages/mine/index.wxml` 中使头像仅在已登录时渲染，并使家庭组预告不可点击：

```xml
<view class="account-profile {{account.loggedIn ? '' : 'is-logged-out'}}" bindtap="goAccount">
  <image wx:if="{{account.loggedIn}}" class="account-avatar" src="{{account.profile.avatarUrl || defaultAccountAvatar}}" mode="aspectFit" />
  <view class="account-main">
    <view wx:if="{{account.loggedIn}}" class="account-name">{{account.profile.nickname || '微信用户'}}</view>
    <view wx:else class="account-name">微信登录</view>
    <view wx:if="{{account.loggedIn}}" class="account-subtitle">微信账号 · 账号设置</view>
    <view wx:else class="account-subtitle">登录后可跨设备保存记录</view>
  </view>
  <view class="account-action">{{account.loggedIn ? '设置' : '登录'}} ›</view>
</view>

<view wx:if="{{!account.loggedIn}}" class="login-family-hint">
  <view class="login-family-copy">
    <view class="login-family-title">创建家庭组</view>
    <view class="login-family-meta">登录后可邀请成员共同管理食材</view>
  </view>
  <view class="login-family-status">登录后可用</view>
</view>
```

删除 `pages/mine/index.wxml` 的 `.sync-status` 节点。在 `pages/mine/index.wxss` 中删除 `.sync-status`/`.sync-action`，并加入：

```css
.account-profile.is-logged-out {
  min-height: 92rpx;
  padding: 18rpx 22rpx;
}

.login-family-status {
  flex: 0 0 auto;
  padding: 8rpx 12rpx;
  border-radius: 10rpx;
  background: #f0edda;
  color: #8a806d;
  font-size: 20rpx;
  font-weight: 800;
  white-space: nowrap;
}
```

在 `pages/mine/index.js` 中：

```js
// 删除 syncIssueText 导入。
// decorateAccount 仅保留 profile/family 展示派生字段。
// data 删除 syncing。
// 整体删除 retrySync()。
// onShow() 中 resumePendingSync() 的静默后台逻辑保留。
```

- [ ] **步骤 4：运行“我的”页测试并确认通过**

运行：

```bash
node --test tests/minePage.test.js
```

预期：所有“我的”页测试 PASS，后台同步恢复调用仍为 1 次。

- [ ] **步骤 5：提交 A1 账号卡**

```bash
git add pages/mine/index.js pages/mine/index.wxml pages/mine/index.wxss tests/minePage.test.js
git commit -m "fix: simplify logged out account card"
```

### 任务 2：移除账号设置页长期同步卡片

**文件：**
- 修改：`tests/accountSettingsPage.test.js:47-293`
- 修改：`pages/settings/account.wxml:25-31`
- 修改：`pages/settings/account.wxss:78-112`
- 修改：`pages/settings/account.js:28-43,68-80,173-190`

- [ ] **步骤 1：编写失败的账号页静默同步测试**

在首个账号页结构测试中加入：

```js
assert.doesNotMatch(markup, /本机食材还未同步完成/)
assert.doesNotMatch(markup, /重新同步/)
assert.doesNotMatch(markup, /sync-card|retrySync/)
```

将原 `account settings retries pending food sync` 测试替换为：

```js
test('account settings keeps pending sync internal instead of exposing manual retry', async () => {
  const page = createPageInstance(loadAccountPage({
    getSession: () => ({ loggedIn: true, profile: {}, syncStatus: 'pending' }),
    refresh: async () => ({ loggedIn: true, profile: {}, syncStatus: 'pending' })
  }))

  await page.onLoad()

  assert.equal(page.data.loggedIn, true)
  assert.equal(typeof page.retrySync, 'undefined')
  assert.doesNotMatch(readText('pages/settings/account.wxml'), /sync-card|retrySync/)
})
```

- [ ] **步骤 2：运行定向测试并确认失败**

运行：

```bash
node --test --test-name-pattern="uses WeChat|keeps pending sync internal" tests/accountSettingsPage.test.js
```

预期：FAIL，因为账号页仍渲染 `.sync-card` 并定义 `retrySync()`。

- [ ] **步骤 3：移除账号页手动同步 UI**

删除 `pages/settings/account.wxml` 中以下区块：

```xml
<view wx:if="{{loggedIn && syncStatus === 'pending'}}" class="sync-card">
  <!-- 整个同步卡片删除 -->
</view>
```

在 `pages/settings/account.js` 中删除 `sessionView()` 返回值中的 `syncStatus`、`data.syncStatus`/`data.syncing` 和完整 `retrySync()` 方法。在 `pages/settings/account.wxss` 中将：

```css
.family-card,
.sync-card {
```

改为：

```css
.family-card {
```

并删除 `.sync-card`/`.sync-title`/`.compact-action` 样式块。

- [ ] **步骤 4：运行账号页测试并确认通过**

运行：

```bash
node --test tests/accountSettingsPage.test.js
```

预期：账号页测试全部 PASS，登录、保存、退出与家庭入口行为不变。

- [ ] **步骤 5：提交账号页清理**

```bash
git add pages/settings/account.js pages/settings/account.wxml pages/settings/account.wxss tests/accountSettingsPage.test.js
git commit -m "fix: hide persistent account sync warnings"
```

### 任务 3：回归验证与差异审查

**文件：**
- 验证：`pages/mine/*`
- 验证：`pages/settings/account.*`
- 验证：`tests/*.test.js`

- [ ] **步骤 1：运行账号、家庭与分享回归**

```bash
node --test tests/accountService.test.js tests/accountSettingsPage.test.js tests/minePage.test.js tests/familyPage.test.js tests/sharePolicy.test.js
```

预期：所有定向测试 PASS。

- [ ] **步骤 2：运行全量测试**

```bash
node --test --test-reporter=dot tests/*.test.js
```

预期：命令退出码为 0，无失败测试。

- [ ] **步骤 3：检查补丁与工作区边界**

```bash
git diff --check
git diff -- pages/mine/index.js pages/mine/index.wxml pages/mine/index.wxss pages/settings/account.js pages/settings/account.wxml pages/settings/account.wxss tests/minePage.test.js tests/accountSettingsPage.test.js
```

预期：无空白错误；差异仅包含 A1 卡片和同步提示可见性调整，不回退现有分享功能或其他未提交工作。

- [ ] **步骤 4：在微信开发者工具重新编译并手动核对**

检查：

```text
1. 未登录账号卡无头像框。
2. 只有主行“登录”可进入账号页。
3. “登录后可用”无按压反馈、无跳转。
4. 已登录头像、昵称和家庭管理入口正常。
5. “我的”页和账号页均不显示未同步黄条或重试卡片。
6. 登录或保存真正失败时仍显示失败 Toast。
```
