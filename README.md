# 宝宝食材小管家

原生微信小程序 MVP。当前阶段已从静态 UI 骨架进入业务闭环开发，页面默认使用本地 `utils/foodRepository.js` 保存记录，并预留 `foodApi` 云函数用于后续切换到云数据库。

## 当前已完成

- 根级小程序入口：`app.js`、`app.json`、`app.wxss`
- 页面：首页、食材搜索、添加食材、拍照识别、食材详情、编辑食材、提醒中心、我的、宝宝模式设置、提醒设置
- 公共组件：状态标签、食材卡片、空状态
- 像素素材：引用 `/assets/sprites/` 下的原创 sprite 切图
- 本地业务层：食材基础库、状态计算、添加/编辑/完成/提醒/统计
- 自动化测试：`tests/foodRules.test.js`、`tests/foodRepository.test.js`、`tests/foodApiCore.test.js`
- 云函数：`login`、`mockRecognize`、`foodApi`
- 数据访问层：`utils/foodService.js` 默认本地，云模式优先调用 `foodApi`
- 识别访问层：`utils/recognitionService.js` 默认本地模拟，云模式上传图片并调用 `mockRecognize`
- 反馈页：`pages/feedback/index`，通过 `foodService.submitFeedback` 写入本地/云端反馈
- 识别记录：选择识别结果时记录日志，“我的”页展示识别次数
- 识别记录页：`pages/recognition-log/index`，可查看历史识别选择并继续添加食材
- 关于页：`pages/about/index`，展示版本、能力说明、云模式和订阅模板状态
- 宝宝月龄：根据宝宝生日自动计算，本地和 `foodApi` 云端设置保持一致
- 提醒订阅：`utils/subscribeService.js` 封装微信订阅消息请求，未配置模板 ID 时给出明确提示

## 开发者工具打开方式

1. 用微信开发者工具打开本目录。
2. AppID 可先使用测试号或游客模式。
3. 如果要启用云开发，将 `app.js` 中的 `globalData.cloudEnvId` 替换为你的云环境 ID，并把 `globalData.useCloudFoodApi` 改为 `true`。

## 云函数 foodApi

`cloudfunctions/foodApi` 是单入口云函数，使用 `action` 参数分发：

- `initFoodBase`
- `searchFoods`
- `addFoodRecord`
- `getFoodRecords`
- `getFoodDetail`
- `updateFoodRecord`
- `finishFoodRecord`
- `getReminders`
- `updateUserSettings`
- `submitFeedback`
- `logRecognition`
- `getRecognitionLogs`

开发阶段建议先在开发者工具里上传并部署 `foodApi`，然后调用：

```js
wx.cloud.callFunction({
  name: 'foodApi',
  data: {
    action: 'initFoodBase'
  }
})
```

当前页面通过 `utils/foodService.js` 访问数据，默认仍使用本地 repository，方便无云环境时继续调 UI 和流程。
如果你已经在开发者工具里开通云开发、替换了 `app.js` 的云环境 ID，并部署了 `foodApi` 和 `mockRecognize`，可以把 `app.js` 中的 `globalData.useCloudFoodApi` 改为 `true`。
页面会优先调用云函数，失败时自动回退本地数据；拍照识别会优先上传到云存储并调用 `mockRecognize`，失败时回退本地模拟识别。
反馈和识别日志也会在云模式下写入 `feedback`、`recognition_logs` 集合。

订阅消息模板 ID 目前仍是占位值：

```js
const TEMPLATE_ID_FOOD_EXPIRE = '请替换为实际订阅消息模板ID'
```

在微信公众平台配置好模板后，替换 `utils/subscribeService.js` 里的模板 ID，即可在提醒中心和提醒设置页请求订阅授权。

## 本地验证

```bash
node --test tests/babyAge.test.js tests/subscribeService.test.js tests/recognitionService.test.js tests/foodService.test.js tests/foodApiCore.test.js tests/foodRepository.test.js tests/foodRules.test.js
find app.js utils components pages cloudfunctions custom-tab-bar tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

## 下一步

- 在开发者工具里创建并验证 `food_base`、`user_food_records`、`user_settings`、`feedback` 集合权限。
- 部署 `foodApi` 并打开 `globalData.useCloudFoodApi`，做真机/模拟器云数据联调。
- 将 `mockRecognize` 替换为真实识别服务，保留当前结果归一化结构。
