# 家庭身份权限弹窗实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在成员管理页提供身份权限说明弹窗，让用户理解创建者、管理员和成员的权限差异。

**架构：** 页面脚本保存与后端 `rolePermissions` 对齐的静态说明文案，并通过 `wx.showModal` 展示。页面模板只增加一个说明入口，不修改成员身份数据流或云函数权限校验。

**技术栈：** 微信小程序 WXML/WXSS/JavaScript、Node.js `node:test`

---

## 文件结构

- 修改 `pages/family/member.js`：定义权限说明文案和弹窗处理方法。
- 修改 `pages/family/member.wxml`：在标题区域增加“身份权限说明”入口。
- 修改 `pages/family/member.wxss`：为标题行和说明入口增加轻量样式。
- 修改 `tests/familyPage.test.js`：验证入口绑定和弹窗内容。

### 任务 1：增加身份权限说明弹窗

**文件：**
- 修改：`pages/family/member.js`
- 修改：`pages/family/member.wxml`
- 修改：`pages/family/member.wxss`
- 测试：`tests/familyPage.test.js`

- [ ] **步骤 1：编写失败的页面测试**

在 `tests/familyPage.test.js` 增加测试，加载成员管理页后调用 `showRolePermissions`，验证模板入口和原生弹窗参数：

```js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
node --test tests/familyPage.test.js
```

预期：FAIL，`typeof page.showRolePermissions` 实际为 `undefined`。

- [ ] **步骤 3：编写最少实现代码**

在 `pages/family/member.js` 中增加静态文案和页面方法：

```js
const rolePermissionHelp = [
  '创建者：管理成员、修改宝宝资料、邀请家人、管理食材和采购计划。',
  '管理员：邀请家人、管理食材和采购计划，不能调整成员或宝宝资料。',
  '成员：管理食材和采购计划，不能邀请或管理成员。'
].join('\n')

showRolePermissions() {
  wx.showModal({
    title: '身份权限说明',
    content: rolePermissionHelp,
    showCancel: false,
    confirmText: '我知道了'
  })
},
```

在 `pages/family/member.wxml` 中把标题改为带入口的标题行：

```xml
<view class="member-page-head">
  <view class="page-title">成员管理</view>
  <button class="role-help-btn" bindtap="showRolePermissions">身份权限说明</button>
</view>
```

在 `pages/family/member.wxss` 中增加轻量样式：

```css
.member-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.role-help-btn {
  margin: 0;
  padding: 8rpx 12rpx;
  border: 0;
  background: transparent;
  color: var(--green-800);
  font-size: 22rpx;
  text-decoration: underline;
}

.role-help-btn::after {
  border: 0;
}
```

- [ ] **步骤 4：运行定向及完整测试**

运行：

```bash
node --test tests/familyPage.test.js
node --test --test-reporter=dot tests/*.test.js
git diff --check
```

预期：全部命令退出码为 0。

- [ ] **步骤 5：提交实现**

只暂存本任务文件：

```bash
git add pages/family/member.js pages/family/member.wxml pages/family/member.wxss tests/familyPage.test.js
git commit -m "feat: explain family role permissions"
```
