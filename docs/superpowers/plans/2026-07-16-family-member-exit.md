# 家庭成员退出与移出实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让家庭创建者可以移出非创建者成员，并让管理员和普通成员可以主动退出家庭，同时保留历史数据和审计记录。

**架构：** 在现有 `familyApi` 中实现 `removeMember` 与 `leaveFamily`，统一以失效成员关系完成软退出并写入 `family_audit_logs`。页面继续通过已有 `familyService` 调用云函数：成员管理页负责创建者移出操作，家庭共享页负责当前成员主动退出并在成功后重新加载个人家庭。

**技术栈：** 微信小程序 WXML/WXSS/JavaScript、微信云函数、Node.js `node:test`

---

## 文件结构

- 修改 `cloudfunctions/familyApi/core.js`：校验退出权限、失效成员关系并写成员审计日志。
- 修改 `tests/familyApiCore.test.js`：覆盖移出、退出、禁止创建者退出和历史数据保留。
- 修改 `pages/family/member.js`：处理创建者移出成员的确认、调用与刷新。
- 修改 `pages/family/member.wxml`：为非创建者成员展示“移出家庭”。
- 修改 `pages/family/member.wxss`：保持身份按钮与危险操作分组清晰。
- 修改 `pages/family/index.js`：根据身份计算 `canLeaveFamily` 并处理主动退出。
- 修改 `pages/family/index.wxml`：在家庭共享页底部展示退出入口。
- 修改 `pages/family/index.wxss`：使用克制的次级危险按钮样式。
- 修改 `tests/familyPage.test.js`：覆盖入口可见性、取消、成功和失败流程。

### 任务 1：实现后端软退出与成员审计

**文件：**
- 修改：`tests/familyApiCore.test.js`
- 修改：`cloudfunctions/familyApi/core.js`

- [ ] **步骤 1：编写创建者移出成员的失败测试**

在 `tests/familyApiCore.test.js` 添加测试，创建家庭、邀请成员加入、添加一条家庭食材记录，然后调用：

```js
const removed = await owner.handle({ action: 'removeMember', openId: 'member-a' })
const membership = await store.get('family_members', (item) => item.openId === 'member-a')
const records = await store.list('user_food_records', (item) => item.familyId === familyId)
const logs = await store.list('family_audit_logs', (item) => item.action === 'member_removed')

assert.equal(removed.ok, true)
assert.equal(membership.status, 'inactive')
assert.equal(records.length, 1)
assert.equal(logs[0].actorOpenId, 'owner')
assert.equal(logs[0].targetId, 'member-a')
```

- [ ] **步骤 2：编写退出权限的失败测试**

添加独立测试验证：管理员和普通成员调用 `leaveFamily` 成功；创建者调用失败；管理员调用 `removeMember` 失败；创建者不能移出自己。成功退出后再次调用 `getMyFamily`，断言返回新的 `personal` 家庭且旧家庭记录仍存在。

```js
const left = await member.handle({ action: 'leaveFamily' })
const personal = await member.handle({ action: 'getMyFamily' })
const ownerRejected = await owner.handle({ action: 'leaveFamily' })

assert.equal(left.ok, true)
assert.notEqual(personal.data.family.familyId, familyId)
assert.equal(personal.data.family.kind, 'personal')
assert.equal(ownerRejected.ok, false)
assert.match(ownerRejected.error, /创建者不能退出/)
```

- [ ] **步骤 3：运行后端测试验证正确失败**

运行：

```bash
node --test --test-name-pattern="移出|退出" tests/familyApiCore.test.js
```

预期：FAIL，`removeMember` 和 `leaveFamily` 返回 `Unknown action`，成员状态仍为 `active`。

- [ ] **步骤 4：实现成员审计辅助函数**

在 `createFamilyApi` 内新增小型辅助函数，复用 `addItem`：

```js
async function writeMemberAudit({ familyId, actor, target, action, summary }) {
  return addItem(store, 'family_audit_logs', {
    id: makeId('audit'),
    familyId,
    actorOpenId: userId,
    actorName: actor.nickname || '家庭成员',
    actorAvatar: actor.avatarUrl || '',
    action,
    targetType: 'family_member',
    targetId: target.openId,
    summary,
    before: { role: target.role, status: target.status },
    after: { role: target.role, status: 'inactive' },
    createdAt: today
  })
}
```

- [ ] **步骤 5：实现 `removeMember` 和 `leaveFamily`**

在 `updateMemberRole` 分支后增加两个 action：

```js
if (event.action === 'removeMember') {
  const actor = await requirePermission(store, userId, 'manage_members')
  const target = await getItem(store, 'family_members', (item) => (
    item.familyId === actor.familyId && item.openId === event.openId && item.status === 'active'
  ))
  if (!target) return { ok: false, error: '成员不存在或已退出' }
  if (target.role === 'owner' || target.openId === userId) {
    return { ok: false, error: '创建者不能移出自己' }
  }
  const updated = await updateItem(store, 'family_members', (item) => item._id === target._id || item.id === target.id, {
    status: 'inactive',
    leftAt: today,
    updatedAt: today
  })
  await writeMemberAudit({
    familyId: actor.familyId,
    actor,
    target,
    action: 'member_removed',
    summary: `将${target.nickname || '一位成员'}移出家庭`
  })
  return { ok: true, data: updated }
}

if (event.action === 'leaveFamily') {
  const membership = await requireMembership(store, userId)
  if (membership.role === 'owner') return { ok: false, error: '家庭创建者不能退出家庭组' }
  const updated = await updateItem(store, 'family_members', (item) => item._id === membership._id || item.id === membership.id, {
    status: 'inactive',
    leftAt: today,
    updatedAt: today
  })
  await writeMemberAudit({
    familyId: membership.familyId,
    actor: membership,
    target: membership,
    action: 'member_left',
    summary: `${membership.nickname || '一位成员'}退出家庭`
  })
  return { ok: true, data: updated }
}
```

- [ ] **步骤 6：运行后端测试验证通过**

运行：

```bash
node --test tests/familyApiCore.test.js tests/familyService.test.js
```

预期：PASS，退出相关成员状态为 `inactive`，审计日志存在，历史食材记录未删除。

- [ ] **步骤 7：提交后端实现**

```bash
git add cloudfunctions/familyApi/core.js tests/familyApiCore.test.js
git commit -m "feat: support leaving and removing family members"
```

### 任务 2：在成员管理页增加移出操作

**文件：**
- 修改：`tests/familyPage.test.js`
- 修改：`pages/family/member.js`
- 修改：`pages/family/member.wxml`
- 修改：`pages/family/member.wxss`

- [ ] **步骤 1：编写成员管理页失败测试**

创建 owner 页面实例并模拟 `removeMember`，断言只有非创建者行包含移出按钮。触发 `removeMember` 后检查确认文案，分别覆盖取消不调用、确认后调用并重新加载、接口失败显示服务端错误。

```js
page.removeMember({ currentTarget: { dataset: { openid: 'member', nickname: '爸爸' } } })
assert.equal(modals[0].title, '移出家庭')
assert.match(modals[0].content, /无法继续查看和管理/)
await modals[0].success({ confirm: true })
assert.deepEqual(calls, [{ openId: 'member' }])
assert.match(readText('pages/family/member.wxml'), /bindtap="removeMember"/)
```

- [ ] **步骤 2：运行页面测试验证正确失败**

运行：

```bash
node --test --test-name-pattern="移出家庭" tests/familyPage.test.js
```

预期：FAIL，页面没有 `removeMember` 方法和对应 WXML 按钮。

- [ ] **步骤 3：实现页面行为与按钮**

在 `member.js` 增加防越权检查和二次确认；确认后调用 `familyService.removeMember({ openId })`、执行 `loadMembers()` 并提示“已移出家庭”。错误提示优先使用 `error.message`。

在非创建者成员的操作区增加：

```xml
<button
  wx:if="{{canManageMembers}}"
  class="remove-member-btn"
  data-openid="{{item.openId}}"
  data-nickname="{{item.nickname}}"
  bindtap="removeMember"
>移出家庭</button>
```

在 `member.wxss` 中让 `.role-actions` 保持身份切换为一组，并将 `.remove-member-btn` 设为浅底红字的次级按钮，不使用大面积红色。

- [ ] **步骤 4：运行成员管理页测试验证通过**

运行：

```bash
node --test tests/familyPage.test.js
```

预期：PASS，创建者可确认移出成员，非创建者仍只能查看。

- [ ] **步骤 5：提交成员管理页实现**

```bash
git add pages/family/member.js pages/family/member.wxml pages/family/member.wxss tests/familyPage.test.js
git commit -m "feat: let owners remove family members"
```

### 任务 3：在家庭共享页增加主动退出

**文件：**
- 修改：`tests/familyPage.test.js`
- 修改：`pages/family/index.js`
- 修改：`pages/family/index.wxml`
- 修改：`pages/family/index.wxss`

- [ ] **步骤 1：编写家庭共享页失败测试**

分别加载 owner、admin 和 member 身份，断言 `canLeaveFamily` 只在 admin/member 时为 true。调用 `leaveFamily` 时覆盖取消、确认成功后重新加载个人家庭、失败后不清空当前家庭。

```js
await page.onShow()
assert.equal(page.data.canLeaveFamily, true)
page.leaveFamily()
assert.equal(modals[0].title, '退出家庭组')
await modals[0].success({ confirm: true })
assert.equal(leaveCalls, 1)
assert.equal(page.data.family.kind, 'personal')
assert.match(readText('pages/family/index.wxml'), /wx:if="{{canLeaveFamily}}"[^>]*class="family-exit-card"/)
```

- [ ] **步骤 2：运行家庭页测试验证正确失败**

运行：

```bash
node --test --test-name-pattern="退出家庭组" tests/familyPage.test.js
```

预期：FAIL，`canLeaveFamily` 和 `leaveFamily` 尚未定义。

- [ ] **步骤 3：实现身份状态与退出流程**

在 `index.js` 的初始 data 增加 `canLeaveFamily: false`，在 `loadFamily()` 中设置：

```js
canLeaveFamily: ['admin', 'member'].includes(membership.role)
```

增加 `leaveFamily()`，先阻止重复提交，再显示二次确认；确认后调用 `familyService.leaveFamily()`，清理当前 invite 状态并执行 `loadFamily()`，成功提示“已退出家庭”。失败时调用 `userMessage(error, '退出失败，请重试')`，不覆盖当前家庭数据。

在 `index.wxml` 的正常家庭内容底部增加：

```xml
<view wx:if="{{canLeaveFamily}}" class="family-exit-card">
  <button class="family-exit-btn" bindtap="leaveFamily">退出家庭组</button>
</view>
```

在 `index.wxss` 中将退出入口与成员卡片拉开间距，按钮使用透明背景、细边框和低饱和红字，避免抢占邀请与管理主操作。

- [ ] **步骤 4：运行家庭页测试验证通过**

运行：

```bash
node --test tests/familyPage.test.js
```

预期：PASS，创建者无退出入口，管理员和成员可确认退出并看到新的个人家庭。

- [ ] **步骤 5：提交家庭页实现**

```bash
git add pages/family/index.js pages/family/index.wxml pages/family/index.wxss tests/familyPage.test.js
git commit -m "feat: let members leave shared families"
```

### 任务 4：完整验证与交付检查

**文件：**
- 验证：`cloudfunctions/familyApi/core.js`
- 验证：`pages/family/index.js`
- 验证：`pages/family/member.js`
- 验证：`tests/familyApiCore.test.js`
- 验证：`tests/familyPage.test.js`

- [ ] **步骤 1：运行聚焦测试**

```bash
node --test tests/familyApiCore.test.js tests/familyService.test.js tests/familyPage.test.js
```

预期：全部 PASS。

- [ ] **步骤 2：运行完整测试**

```bash
node --test --test-reporter=dot tests/*.test.js
```

预期：退出码 0，无失败测试。

- [ ] **步骤 3：检查代码与提交边界**

```bash
git diff --check
git status --short
git log --oneline -5
```

预期：无空白错误；只包含计划内文件；三个功能提交清晰可审查。

