# 全页面分享能力实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 `app.json` 注册的每个页面都能安全转发给微信好友，并只在可独立打开的浏览页开放朋友圈分享。

**架构：** 新增 `utils/share.js` 作为唯一分享策略入口，以路由白名单决定“当前页或首页”目标，并对白名单查询字段编码。每个页面显式展开共享处理器；家庭共享页保留现有 `onShareAppMessage` 作为专用覆盖。

**技术栈：** 微信小程序原生 JavaScript、CommonJS、Node.js `node:test`

---

## 文件结构

- 创建 `utils/share.js`：分享标题、路由策略、查询白名单、通用页面处理器。
- 创建 `tests/share.test.js`：分享策略纯函数测试和所有注册页面的接入完整性测试。
- 修改以下安全浏览页：接入好友转发和朋友圈分享。
  - `pages/index/index.js`
  - `pages/food/search.js`
  - `pages/food/name-search.js`
  - `pages/purchase-plan/index.js`
  - `pages/quick-process/index.js`
  - `pages/recognize/index.js`
  - `pages/reminder/index.js`
  - `pages/mine/index.js`
  - `pages/feedback/index.js`
  - `pages/about/index.js`
- 修改以下私有或操作页：接入好友转发，分享目标统一回退首页，不开放朋友圈。
  - `pages/recognition-log/index.js`
  - `pages/food/detail.js`
  - `pages/food/add.js`
  - `pages/food/edit.js`
  - `pages/settings/account.js`
  - `pages/settings/baby.js`
  - `pages/avatar-crop/index.js`
  - `pages/settings/reminder.js`
  - `pages/family/member.js`
- 修改 `pages/family/index.js`：接入通用回退处理器，但由现有邀请分享方法覆盖好友转发，不开放朋友圈。

工作区已有多处未提交修改。实现时只编辑上述分享相关行；每次提交前使用 `git diff --cached --name-only` 核对暂存范围，不把已有业务改动带入提交。若重叠文件无法只暂存分享补丁，则保留为未提交改动并在交付说明中列明。

### 任务 1：用测试定义分享路径和隐私规则

**文件：**

- 创建：`tests/share.test.js`
- 测试：`tests/share.test.js`

- [ ] **步骤 1：编写失败的策略测试**

创建 `tests/share.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('safe browsing routes share the current page with whitelisted query only', () => {
  const { buildSharePath } = require('../utils/share')
  const path = buildSharePath({
    route: 'pages/food/search',
    options: { keyword: '三 文鱼', recordId: 'private-record' }
  })

  assert.equal(path, '/pages/food/search?keyword=%E4%B8%89%20%E6%96%87%E9%B1%BC')
})

test('private routes and invalid page contexts share the home page', () => {
  const { HOME_PATH, buildSharePath } = require('../utils/share')

  assert.equal(buildSharePath({
    route: 'pages/food/detail',
    options: { id: 'private-record' }
  }), HOME_PATH)
  assert.equal(buildSharePath({ route: 'pages/unknown', options: {} }), HOME_PATH)
  assert.equal(buildSharePath(null), HOME_PATH)
})

test('share handlers enable timeline only when requested', () => {
  const { createShareHandlers } = require('../utils/share')
  const friendOnly = createShareHandlers()
  const publicSharing = createShareHandlers({ timeline: true })

  assert.equal(typeof friendOnly.onShareAppMessage, 'function')
  assert.equal(friendOnly.onShareTimeline, undefined)
  assert.equal(typeof publicSharing.onShareAppMessage, 'function')
  assert.equal(typeof publicSharing.onShareTimeline, 'function')

  const friendCard = publicSharing.onShareAppMessage.call({
    route: 'pages/food/name-search',
    options: { keyword: '蓝莓', id: 'private-record' }
  })
  const timelineCard = publicSharing.onShareTimeline.call({
    route: 'pages/food/name-search',
    options: { keyword: '蓝莓', id: 'private-record' }
  })

  assert.equal(friendCard.path, '/pages/food/name-search?keyword=%E8%93%9D%E8%8E%93')
  assert.equal(timelineCard.query, 'keyword=%E8%93%9D%E8%8E%93')
})
```

- [ ] **步骤 2：运行测试验证正确失败**

运行：

```bash
node --test tests/share.test.js
```

预期：FAIL，错误包含 `Cannot find module '../utils/share'`。

- [ ] **步骤 3：Commit 红灯测试**

```bash
git add tests/share.test.js
git diff --cached --name-only
git commit -m "test: define mini program sharing policy"
```

预期暂存文件只有 `tests/share.test.js`。

### 任务 2：实现共享策略工具

**文件：**

- 创建：`utils/share.js`
- 测试：`tests/share.test.js`

- [ ] **步骤 1：编写最少实现**

创建 `utils/share.js`：

```js
const DEFAULT_SHARE_TITLE = '这还能吃吗｜宝宝食材小管家'
const HOME_PATH = '/pages/index/index'

const shareableRouteQueryKeys = Object.freeze({
  'pages/index/index': [],
  'pages/food/search': ['keyword'],
  'pages/food/name-search': ['keyword'],
  'pages/purchase-plan/index': [],
  'pages/quick-process/index': [],
  'pages/recognize/index': [],
  'pages/reminder/index': [],
  'pages/mine/index': [],
  'pages/feedback/index': [],
  'pages/about/index': []
})

function normalizeRoute(route) {
  return String(route || '').replace(/^\/+/, '')
}

function encodeQuery(options, allowedKeys) {
  const source = options && typeof options === 'object' ? options : {}
  return allowedKeys.reduce((parts, key) => {
    const value = source[key]
    if (value === undefined || value === null || value === '') return parts
    if (!['string', 'number', 'boolean'].includes(typeof value)) return parts
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    return parts
  }, []).join('&')
}

function readPageContext(page) {
  if (page && page.route) {
    return { route: page.route, options: page.options || {} }
  }
  try {
    if (typeof getCurrentPages !== 'function') return {}
    const pages = getCurrentPages()
    const current = pages && pages[pages.length - 1]
    return current
      ? { route: current.route || '', options: current.options || {} }
      : {}
  } catch (error) {
    return {}
  }
}

function buildShareQuery(context) {
  const route = normalizeRoute(context && context.route)
  const allowedKeys = shareableRouteQueryKeys[route]
  if (!allowedKeys) return ''
  return encodeQuery(context && context.options, allowedKeys)
}

function buildSharePath(context) {
  const route = normalizeRoute(context && context.route)
  const allowedKeys = shareableRouteQueryKeys[route]
  if (!allowedKeys) return HOME_PATH
  const query = encodeQuery(context && context.options, allowedKeys)
  return `/${route}${query ? `?${query}` : ''}`
}

function createShareHandlers(options = {}) {
  const title = options.title || DEFAULT_SHARE_TITLE
  const handlers = {
    onShareAppMessage() {
      return {
        title,
        path: buildSharePath(readPageContext(this))
      }
    }
  }
  if (options.timeline === true) {
    handlers.onShareTimeline = function onShareTimeline() {
      return {
        title,
        query: buildShareQuery(readPageContext(this))
      }
    }
  }
  return handlers
}

module.exports = {
  DEFAULT_SHARE_TITLE,
  HOME_PATH,
  shareableRouteQueryKeys,
  encodeQuery,
  readPageContext,
  buildShareQuery,
  buildSharePath,
  createShareHandlers
}
```

- [ ] **步骤 2：运行策略测试验证通过**

运行：

```bash
node --test tests/share.test.js
```

预期：3 个测试全部 PASS，0 个 FAIL。

- [ ] **步骤 3：Commit 工具实现**

```bash
git add utils/share.js
git diff --cached --name-only
git commit -m "feat: add safe page sharing policy"
```

预期暂存文件只有 `utils/share.js`。

### 任务 3：用失败测试锁定所有页面接入范围

**文件：**

- 修改：`tests/share.test.js`
- 测试：`tests/share.test.js`

- [ ] **步骤 1：增加注册页面完整性测试**

在 `tests/share.test.js` 顶部增加：

```js
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const timelineRoutes = new Set([
  'pages/index/index',
  'pages/food/search',
  'pages/food/name-search',
  'pages/purchase-plan/index',
  'pages/quick-process/index',
  'pages/recognize/index',
  'pages/reminder/index',
  'pages/mine/index',
  'pages/feedback/index',
  'pages/about/index'
])
```

在文件末尾增加：

```js
test('every registered page explicitly installs friend sharing', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  appConfig.pages.forEach((route) => {
    const source = fs.readFileSync(path.join(root, `${route}.js`), 'utf8')
    assert.match(source, /\.\.\.createShareHandlers\(/, `${route} must install friend sharing`)
  })
})

test('timeline sharing is installed on safe browsing pages only', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

  appConfig.pages.forEach((route) => {
    const source = fs.readFileSync(path.join(root, `${route}.js`), 'utf8')
    if (timelineRoutes.has(route)) {
      assert.match(source, /\.\.\.createShareHandlers\(\{ timeline: true \}\)/,
        `${route} must install timeline sharing`)
    } else {
      assert.doesNotMatch(source, /createShareHandlers\(\{ timeline: true \}\)/,
        `${route} must not expose timeline sharing`)
    }
  })
})
```

- [ ] **步骤 2：运行测试验证正确失败**

运行：

```bash
node --test tests/share.test.js
```

预期：前 3 个策略测试 PASS；“every registered page explicitly installs friend sharing” FAIL，首个缺失页面为 `pages/index/index`。

### 任务 4：接入安全浏览页的好友和朋友圈分享

**文件：**

- 修改：`pages/index/index.js`
- 修改：`pages/food/search.js`
- 修改：`pages/food/name-search.js`
- 修改：`pages/purchase-plan/index.js`
- 修改：`pages/quick-process/index.js`
- 修改：`pages/recognize/index.js`
- 修改：`pages/reminder/index.js`
- 修改：`pages/mine/index.js`
- 修改：`pages/feedback/index.js`
- 修改：`pages/about/index.js`
- 测试：`tests/share.test.js`

- [ ] **步骤 1：为每个安全浏览页引入工具**

在以上 10 个文件的 CommonJS 引入区加入同一条导入；这些页面均位于 `pages/<目录>/`，相对路径一致：

```js
const { createShareHandlers } = require('../../utils/share')
```

- [ ] **步骤 2：为每个安全浏览页安装两个分享处理器**

在以上 10 个文件的 `Page({` 后第一项加入：

```js
  ...createShareHandlers({ timeline: true }),
```

- [ ] **步骤 3：运行接入测试并确认仍处于预期红灯**

运行：

```bash
node --test tests/share.test.js
```

预期：朋友圈范围断言已满足；好友完整性测试仍 FAIL，首个未接入的私有页为 `pages/food/add` 或 `app.json` 中更早出现的私有页。

### 任务 5：接入私有页并保留家庭邀请覆盖

**文件：**

- 修改：`pages/recognition-log/index.js`
- 修改：`pages/food/detail.js`
- 修改：`pages/food/add.js`
- 修改：`pages/food/edit.js`
- 修改：`pages/settings/account.js`
- 修改：`pages/settings/baby.js`
- 修改：`pages/avatar-crop/index.js`
- 修改：`pages/settings/reminder.js`
- 修改：`pages/family/member.js`
- 修改：`pages/family/index.js`
- 测试：`tests/share.test.js`
- 既有回归测试：`tests/familyPage.test.js`

- [ ] **步骤 1：为私有页和家庭页引入工具**

在以上 10 个文件的 CommonJS 引入区加入：

```js
const { createShareHandlers } = require('../../utils/share')
```

- [ ] **步骤 2：安装仅好友转发的通用处理器**

在以上 10 个文件的 `Page({` 后第一项加入：

```js
  ...createShareHandlers(),
```

`pages/family/index.js` 中这行必须位于现有 `onShareAppMessage()` 之前，使对象后方的专用邀请方法覆盖通用回退方法。

- [ ] **步骤 3：运行分享和家庭邀请测试验证绿灯**

运行：

```bash
node --test tests/share.test.js tests/familyPage.test.js
```

预期：所有分享策略、页面完整性和家庭邀请测试 PASS，0 个 FAIL；家庭邀请路径仍为 `/pages/family/index?inviteId=invite-a`。

- [ ] **步骤 4：检查所有页面的静态接入数量**

运行：

```bash
rg -l '\.\.\.createShareHandlers\(' pages --glob '*.js' | sort
```

预期：输出 20 个页面脚本，与 `app.json.pages` 的 20 个路由一一对应。

- [ ] **步骤 5：提交页面接入改动**

先检查：

```bash
git diff -- pages utils/share.js tests/share.test.js
git diff --cached --name-only
```

只暂存本任务新增的分享行和 `tests/share.test.js`。若文件没有既有用户改动，使用显式路径 `git add`；有既有改动的文件不做整文件暂存。

提交信息：

```bash
git commit -m "feat: enable safe sharing on every page"
```

### 任务 6：完成前全量验证

**文件：**

- 验证：`app.json`
- 验证：`pages/**/*.js`
- 验证：`utils/share.js`
- 验证：`tests/*.test.js`

- [ ] **步骤 1：运行完整自动化测试**

运行：

```bash
node --test tests/*.test.js
```

预期：退出码 0，所有测试 PASS，0 个 FAIL。

- [ ] **步骤 2：检查语法**

运行：

```bash
node --check utils/share.js
```

然后对 20 个页面脚本逐个执行 `node --check`：

```bash
for file in $(node -e "const a=require('./app.json'); process.stdout.write(a.pages.map(p => p + '.js').join(' '))"); do node --check "$file" || exit 1; done
```

预期：退出码 0，无语法错误输出。

- [ ] **步骤 3：核对需求清单**

确认以下结果：

- `app.json` 的每个注册页面都安装了 `onShareAppMessage`。
- 安全浏览页安装 `onShareTimeline`，私有页不安装。
- 搜索关键词经过 URL 编码，额外参数被丢弃。
- 食材详情、编辑、账号、头像和家庭成员页分享目标为首页。
- 家庭邀请标题和带 `inviteId` 的路径保持原行为。
- 没有调用 `wx.hideShareMenu`，也没有新增云函数或用户数据写入。

- [ ] **步骤 4：检查最终差异与工作区保护**

运行：

```bash
git status --short
git diff --stat
git diff --check
```

预期：`git diff --check` 退出码 0；交付说明明确区分本次分享改动与用户原有未提交改动。
