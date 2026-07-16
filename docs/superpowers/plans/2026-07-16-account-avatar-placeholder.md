# 账号头像相机占位实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 未上传账号头像时使用现有相机切图占位，移除像素人物默认头像，并在账号编辑页明确显示“添加”。

**架构：** 保留现有 `profile.avatarUrl` 数据流，只替换展示层的空值回退资源。账号编辑页与“我的”页共用 `assets.account.defaultAvatar`，该资源改为相机切图；两页根据 `avatarUrl` 切换照片填充样式与占位样式。

**技术栈：** 微信小程序 WXML/WXSS、CommonJS、Node.js `node:test`

---

## 文件结构

- 修改：`utils/assets.js`，将账号默认头像资源指向现有相机切图。
- 修改：`pages/settings/account.wxml`，根据 `avatarUrl` 切换图片样式、缩放模式和“添加/更换”文案。
- 修改：`pages/settings/account.wxss`，让相机占位居中并保留照片铺满效果。
- 修改：`tests/accountSettingsPage.test.js`，覆盖账号编辑页无头像与有头像两种展示契约。
- 修改：`pages/mine/index.wxml`，让登录后无头像账号使用相机占位。
- 修改：`pages/mine/index.wxss`，区分相机占位和用户照片的尺寸。
- 修改：`tests/minePage.test.js`，覆盖登录、未登录与无头像三种状态。

### 任务 1：账号编辑页相机占位

**文件：**
- 修改：`utils/assets.js`
- 修改：`pages/settings/account.wxml`
- 修改：`pages/settings/account.wxss`
- 测试：`tests/accountSettingsPage.test.js`

- [ ] **步骤 1：编写失败的账号编辑页测试**

把现有默认头像断言改成相机资源，并添加 WXML 状态断言：

```js
assert.match(assets.account.defaultAvatar, /actions\/action_camera\.png$/)
assert.match(markup, /avatar-preview \{\{avatarUrl \? 'has-avatar' : 'is-placeholder'\}\}/)
assert.match(markup, /mode="\{\{avatarUrl \? 'aspectFill' : 'aspectFit'\}\}"/)
assert.match(markup, /\{\{avatarUrl \? '更换' : '添加'\}\}/)
```

在样式测试中补充占位和照片样式断言：

```js
assert.match(stylesheet, /\.avatar-preview\.has-avatar/)
assert.match(stylesheet, /\.avatar-preview\.is-placeholder/)
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
node --test tests/accountSettingsPage.test.js
```

预期：FAIL，错误指出默认头像仍为 `nav_pixel_mine_active.png`，且 WXML 尚无 `is-placeholder`、动态 `mode` 和“添加”文案。

- [ ] **步骤 3：替换账号默认头像资源**

在 `utils/assets.js` 中保持现有字段名，避免扩大调用面：

```js
account: {
  defaultAvatar: `${sprite}actions/action_camera.png`
},
```

- [ ] **步骤 4：实现账号编辑页两种头像状态**

在 `pages/settings/account.wxml` 中替换头像图片和角标：

```xml
<image
  class="avatar-preview {{avatarUrl ? 'has-avatar' : 'is-placeholder'}}"
  src="{{avatarUrl || assets.account.defaultAvatar}}"
  mode="{{avatarUrl ? 'aspectFill' : 'aspectFit'}}"
/>
<view class="avatar-badge">{{avatarUrl ? '更换' : '添加'}}</view>
```

在 `pages/settings/account.wxss` 中保留照片铺满，并让相机图标居中留白：

```css
.avatar-preview.has-avatar {
  width: 100%;
  height: 100%;
}

.avatar-preview.is-placeholder {
  display: block;
  width: 56rpx;
  height: 56rpx;
  margin: 18rpx auto 0;
  opacity: 0.78;
}
```

- [ ] **步骤 5：运行账号编辑页测试并确认通过**

运行：

```bash
node --test tests/accountSettingsPage.test.js
```

预期：全部 PASS。

- [ ] **步骤 6：提交账号编辑页变更**

```bash
git add utils/assets.js pages/settings/account.wxml pages/settings/account.wxss tests/accountSettingsPage.test.js
git commit -m "fix: replace account fallback avatar"
```

### 任务 2：“我的”页登录账号占位

**文件：**
- 修改：`pages/mine/index.wxml`
- 修改：`pages/mine/index.wxss`
- 测试：`tests/minePage.test.js`

- [ ] **步骤 1：编写失败的“我的”页测试**

更新静态展示断言，要求登录后头像拥有状态类和动态缩放模式：

```js
assert.match(markup, /account-avatar \{\{account\.profile\.avatarUrl \? 'has-avatar' : 'is-placeholder'\}\}/)
assert.match(markup, /mode="\{\{account\.profile\.avatarUrl \? 'aspectFill' : 'aspectFit'\}\}"/)
assert.match(stylesheet, /\.account-avatar\.is-placeholder/)
```

把原默认头像测试改为相机资源，并继续验证未登录状态没有头像元素：

```js
assert.match(page.data.defaultAccountAvatar, /actions\/action_camera\.png$/)
assert.match(markup, /<image wx:if="\{\{account\.loggedIn\}\}"/)
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
node --test tests/minePage.test.js
```

预期：FAIL，错误指出头像尚无 `has-avatar/is-placeholder` 状态类，默认资源断言仍不匹配。

- [ ] **步骤 3：实现登录后相机占位样式**

在 `pages/mine/index.wxml` 中替换登录头像节点：

```xml
<image
  wx:if="{{account.loggedIn}}"
  class="account-avatar {{account.profile.avatarUrl ? 'has-avatar' : 'is-placeholder'}}"
  src="{{account.profile.avatarUrl || defaultAccountAvatar}}"
  mode="{{account.profile.avatarUrl ? 'aspectFill' : 'aspectFit'}}"
/>
```

在 `pages/mine/index.wxss` 中把边框盒模型保留在同一节点，并缩小占位图标：

```css
.account-avatar {
  box-sizing: border-box;
}

.account-avatar.is-placeholder {
  padding: 25rpx;
  opacity: 0.78;
}
```

照片状态不添加内边距，继续铺满当前 `104rpx` 头像框。

- [ ] **步骤 4：运行“我的”页测试并确认通过**

运行：

```bash
node --test tests/minePage.test.js
```

预期：全部 PASS。

- [ ] **步骤 5：提交“我的”页变更**

```bash
git add pages/mine/index.wxml pages/mine/index.wxss tests/minePage.test.js
git commit -m "fix: show neutral account avatar placeholder"
```

### 任务 3：回归验证

**文件：**
- 验证：`pages/settings/account.wxml`
- 验证：`pages/mine/index.wxml`
- 验证：`utils/assets.js`

- [ ] **步骤 1：运行聚焦测试**

```bash
node --test tests/accountSettingsPage.test.js tests/minePage.test.js
```

预期：全部 PASS。

- [ ] **步骤 2：运行完整测试套件**

```bash
node --test --test-reporter=dot tests/*.test.js
```

预期：退出码为 0，无失败测试。

- [ ] **步骤 3：检查补丁格式和范围**

```bash
git diff --check
git status --short
```

预期：`git diff --check` 无输出；工作区中原有的其他未提交修改仍然保留，头像任务文件不存在未提交改动。
