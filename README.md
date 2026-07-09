# 宝宝食材小管家

原生微信小程序，用来记录宝宝食材、保存方式和临期提醒，帮助家长更轻松地判断“今天先处理什么”。项目默认可用本地数据跑通流程，也支持接入微信云开发保存真实用户数据。

## 功能亮点

- 食材库存：记录购买日期、保存方式和处理状态。
- 今日处理：按宝宝建议期、成人参考期和过敏源信息排序提醒。
- 食材搜索：支持常见别名搜索、分类筛选和自定义食材兜底。
- 采购计划：先记录待买食材，买到后再转为库存提醒。
- 宝宝信息：根据生日自动计算月龄，可维护过敏源。
- 提醒中心：查看今日建议处理、即将过期和已过期食材。
- 像素风 UI：使用原创 sprite 切图，偏温暖厨房与食材小管家风格。
- 本地优先：不配置云开发也能在开发者工具里体验主要流程。

## 开发者工具打开方式

1. 用微信开发者工具打开本目录。
2. AppID 可先使用测试号或游客模式。
3. 如果只是查看 UI 或本地试流程，可以不打开云开发。
4. 如果要联调云开发，复制 `utils/cloudConfig.example.js` 为 `utils/cloudConfig.local.js`，填入自己的云环境 ID，并把 `useCloudFoodApi` 设为 `true`。

完整云开发联调步骤见 [docs/cloud-setup.md](docs/cloud-setup.md)。

## 云开发配置

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

第一次部署云端数据时，在开发者工具里上传并部署 `foodApi`，然后调用一次初始化：

```js
wx.cloud.callFunction({
  name: 'foodApi',
  data: {
    action: 'initFoodBase'
  }
})
```

当前页面通过 `utils/foodService.js` 访问数据。配置 `utils/cloudConfig.local.js` 并部署 `foodApi` 后，页面会优先调用云函数；如果云函数失败，会自动回退本地数据，方便调试不中断。拍照识别会优先上传到云存储并调用 `mockRecognize`，云函数配置 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY` 后会把图片交给 Qwen 视觉模型识别，未配置或调用失败时回退本地模拟识别。
反馈和识别日志也会在云模式下写入 `feedback`、`recognition_logs` 集合。
数据库集合、初始化入口、红色叹号排查和订阅模板配置都整理在 [docs/cloud-setup.md](docs/cloud-setup.md)。

订阅消息模板 ID 默认使用占位值，真实 ID 不写入仓库：

```js
const TEMPLATE_ID_FOOD_EXPIRE = '请替换为实际订阅消息模板ID'
```

在微信公众平台配置好模板后，复制 `utils/subscribeConfig.example.js` 为 `utils/subscribeConfig.local.js`，再把真实模板 ID 写入本地文件。`subscribeConfig.local.js` 已加入 `.gitignore`，适合未来开源。

如果使用 `sendFoodReminder` 云函数，也复制 `cloudfunctions/sendFoodReminder/subscribeConfig.example.js` 为同目录下的 `subscribeConfig.local.js`，再上传部署云函数。

## 本地验证

```bash
node --test tests/*.test.js
find app.js utils components pages cloudfunctions custom-tab-bar tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

## 项目结构

```text
.
├── app.js / app.json / app.wxss
├── pages/                  # 小程序页面
├── components/             # 公共组件
├── custom-tab-bar/         # 自定义底部导航
├── utils/                  # 业务规则、数据访问、配置示例
├── cloudfunctions/         # 微信云函数
├── assets/sprites/         # 原创像素素材切图
├── docs/                   # 云开发、审核、发布说明
└── tests/                  # Node.js 自动化测试
```

## 开源与私有配置

仓库不提交真实云环境 ID、订阅消息模板 ID 或模型 API Key：

- `utils/cloudConfig.local.js`：本地云环境配置，复制 `utils/cloudConfig.example.js` 创建。
- `utils/subscribeConfig.local.js`：小程序端订阅消息模板 ID。
- `cloudfunctions/sendFoodReminder/subscribeConfig.local.js`：云函数端订阅消息模板 ID。
- 模型 API Key 请配置在微信云函数环境变量中，不要写入代码。

这些 `*.local.js` 和 `.env*` 文件已加入 `.gitignore`。

## 部署前检查

- 已复制本地私有配置文件，且没有提交真实环境 ID、模板 ID 或 API Key。
- 已部署 `foodApi`，并调用过 `initFoodBase` 初始化食材基础库。
- 已按 [docs/cloud-setup.md](docs/cloud-setup.md) 检查数据库集合和权限。
- 已在微信开发者工具中完成预览、真机测试和代码上传。
- 已确认页面里没有“暂未开放”“即将上线”等审核容易误判的占位内容。

## 免责声明

本项目提供食材保存提醒和宝宝食用建议参考，不能替代食品安全、医疗或营养专业建议。新食材、易过敏食材和状态异常食材，请结合实际情况并咨询医生或专业人士。
