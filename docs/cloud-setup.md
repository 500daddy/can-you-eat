# 云开发联调指南

这份文档用于把当前小程序从本地模拟数据切到微信云开发。UI 和业务流程可以先在本地模式跑通，准备做真机/多人数据联调时再打开云开发。

## 什么时候需要打开云开发

导入微信开发者工具时可以先选择“不使用云服务”。如果只是看 UI、调页面跳转、验证本地添加和编辑食材，不需要开云开发。

建议在这些场景打开云开发：

- 需要真机保存食材记录，并在重新打开小程序后保留云端数据。
- 需要测试反馈、识别记录、用户设置的云端写入。
- 需要后续接入真实图片识别或订阅消息。
- 准备让其他测试用户一起试用。

## 开启步骤

1. 在微信开发者工具导入本项目。
2. 后端服务选择“微信云开发”。
3. 进入云开发控制台，选择当前开发环境 `cloud1`。
4. 当前 [app.js](/Users/a500/Documents/宝宝食材小管家/app.js:6) 已配置环境 ID `cloud1-d2g659tkmf84d1d07`。
5. 当前 [app.js](/Users/a500/Documents/宝宝食材小管家/app.js:7) 已将 `useCloudFoodApi` 设置为 `true`。

```js
globalData: {
  cloudEnvId: 'cloud1-d2g659tkmf84d1d07',
  useCloudFoodApi: true
}
```

如果后续要临时回到本地模式，可以把 `useCloudFoodApi` 改成 `false`。如果 `cloudEnvId` 被改回 `cloud1-please-replace`，小程序会跳过 `wx.cloud.init`，这是为了避免开发者工具一直提示云环境占位错误。

## 需要创建的数据库集合

在云开发控制台的数据库里创建以下集合：

- `food_base`：食材基础库。
- `user_food_records`：用户添加的食材记录。
- `user_settings`：宝宝信息、提醒设置、宝宝模式。
- `feedback`：意见反馈。
- `recognition_logs`：拍照识别选择记录。

开发联调阶段可以先用“仅创建者可读写”权限。后续如果要开放多人测试，再按实际登录态和云函数访问方式调整规则。

## 部署云函数

在开发者工具里依次右键上传并部署：

- `cloudfunctions/login`
- `cloudfunctions/mockRecognize`
- `cloudfunctions/foodApi`

`foodApi` 是当前主要业务入口，页面会通过 `action` 参数调用不同能力，例如搜索食材、添加记录、获取详情、更新设置、写入反馈和识别日志。

## 初始化食材基础库

部署 `foodApi` 后，打开小程序：

1. 进入“我的”。
2. 打开“提醒设置”。
3. 找到“开发联调 / 初始化食材库”。
4. 点击后会把内置食材种子数据写入 `food_base`。

也可以在控制台直接调用：

```js
wx.cloud.callFunction({
  name: 'foodApi',
  data: {
    action: 'initFoodBase'
  }
})
```

初始化后再进入“添加 / 搜索食材”，如果能搜到西兰花、胡萝卜、蓝莓等食材，就说明云端基础库已经可用。

## 订阅消息模板

订阅消息模板默认使用占位值，真实模板 ID 不写入仓库：

```js
const TEMPLATE_ID_FOOD_EXPIRE = '请替换为实际订阅消息模板ID'
```

正式接入时需要在微信公众平台配置订阅消息模板，然后：

1. 复制 [utils/subscribeConfig.example.js](/Users/a500/Documents/宝宝食材小管家/utils/subscribeConfig.example.js) 为 `utils/subscribeConfig.local.js`。
2. 把真实模板 ID 写入 `subscribeConfig.local.js`。
3. 如果使用云函数发送订阅消息，也复制 [cloudfunctions/sendFoodReminder/subscribeConfig.example.js](/Users/a500/Documents/宝宝食材小管家/cloudfunctions/sendFoodReminder/subscribeConfig.example.js) 为同目录下的 `subscribeConfig.local.js`。
4. 上传部署 `sendFoodReminder` 云函数。

这些 `*.local.js` 文件已加入 `.gitignore`，不会进入开源仓库。未配置前，提醒页会提示“订阅模板未配置”，这不是代码错误。

## 拍照识别

当前 `mockRecognize` 已保留原函数名，方便前端调用链稳定：

- 上传图片。
- 如果云函数配置了 `OPENAI_API_KEY`，会调用视觉模型识别图片里的多种食材。
- 如果没有配置密钥、图片无法访问或模型调用失败，会自动回退到模拟候选食材。
- 用户选择识别结果。
- 进入添加食材页。
- 写入识别记录。

真实识别的配置方式：

1. 在云开发控制台打开 `mockRecognize` 云函数。
2. 添加环境变量 `OPENAI_API_KEY`，值为你的 OpenAI API Key。
3. 可选添加 `OPENAI_VISION_MODEL`，默认使用 `gpt-4.1-mini`。
4. 可选添加 `OPENAI_BASE_URL`，默认使用 `https://api.openai.com`。
5. 重新上传并部署 `cloudfunctions/mockRecognize`。

不要把 API Key 写入代码或提交到 GitHub。仓库已忽略 `.env` 和 `.env.*`，但微信云函数推荐直接在云开发控制台配置环境变量。

云函数会把微信云存储的 `cloud://` 图片转换成临时 HTTPS URL，再交给视觉模型。返回结构保持不变，页面代码不需要大改：

```js
{
  name: '西兰花',
  confidence: 0.92,
  foodBaseId: 'broccoli'
}
```

为了避免误导用户，识别结果只作为“可能是这些食材”的候选，不直接给出宝宝食用判断。用户仍需点“添加”后确认保存日期和方式。

## 常见问题

### 导入时要不要开云开发

只看 UI 或本地试流程，可以不打开。要测试云数据、多人试用、真实识别、订阅消息，再打开。

### 开发者工具出现红色叹号

先看控制台错误文本：

- 云环境不存在：确认 [app.js](/Users/a500/Documents/宝宝食材小管家/app.js:6) 中的 `cloudEnvId` 是否仍是 `cloud1-d2g659tkmf84d1d07`，并确认开发者工具登录的是同一个 AppID。
- `collection not exists`：说明数据库集合还没创建。
- `function not found`：说明对应云函数还没上传部署。
- `permission denied`：说明集合权限或云函数调用权限需要调整。
- 订阅模板未配置：这是模板 ID 占位提示，不影响其他功能。

### 打开云模式后页面仍然有数据

这是正常的。`utils/foodService.js` 会在云函数失败时回退到本地 repository，避免调试时整个页面空掉。联调云端时可以同时看开发者工具控制台和云数据库集合，确认数据是否真的写到了云端。

## 上线前检查

- `cloudEnvId` 已替换真实环境 ID。
- `useCloudFoodApi` 已按上线目标设置。
- 三个云函数已部署。
- 五个集合已创建。
- 已执行 `initFoodBase`。
- 订阅消息模板 ID 已替换，或者明确暂不上线订阅能力。
- 真机测试过添加、编辑、完成食材、提醒列表、反馈、识别记录。
