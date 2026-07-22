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
3. 进入云开发控制台，创建或选择自己的云开发环境。
4. 复制 [utils/cloudConfig.example.js](../utils/cloudConfig.example.js) 为 `utils/cloudConfig.local.js`。
5. 在 `utils/cloudConfig.local.js` 中填入自己的环境 ID，并将 `useCloudFoodApi` 设置为 `true`。

```js
module.exports = {
  cloudEnvId: 'cloud1-your-env-id',
  useCloudFoodApi: true
}
```

`utils/cloudConfig.local.js` 已加入 `.gitignore`，不会进入开源仓库。如果后续要临时回到本地模式，可以把 `useCloudFoodApi` 改成 `false`。如果 `cloudEnvId` 保持 `cloud1-please-replace`，小程序会跳过 `wx.cloud.init`，这是为了避免开发者工具一直提示云环境占位错误。

### 在哪里找环境 ID

在微信开发者工具打开“云开发”，先看左上角的环境选择器是否选中当前小程序环境，再进入“设置 > 环境设置”复制环境 ID。它通常形如 `cloud1-xxxx`，填到 `utils/cloudConfig.local.js` 的 `cloudEnvId`。环境选择器、云函数、数据库必须处在同一个环境；否则会出现“已部署但页面没变化”或“集合不存在”。

## 需要创建的数据库集合

在云开发控制台的数据库里创建以下集合：

- `food_base`：食材基础库。
- `user_profiles`：家长账号昵称和头像。
- `families`：家庭共享组。
- `family_members`：家庭成员、身份和资料快照。
- `family_invites`：家庭邀请码。
- `family_audit_logs`：家庭成员的编辑记录。
- `family_settings`：家庭共用的宝宝资料和提醒设置。
- `user_food_records`：家庭共用的食材记录。
- `feedback`：意见反馈。
- `recognition_logs`：拍照识别选择记录。
- `purchase_plans`：家庭共用的采购计划。

开发联调阶段可以先用“仅创建者可读写”权限。后续如果要开放多人测试，再按实际登录态和云函数访问方式调整规则。

`accountApi` 和 `familyApi` 会尝试自动创建所需集合。如果日志提示自动创建不可用或初始化失败，请先在云控制台手动创建缺少的集合；家长登录至少需要 `user_profiles` 和 `family_members`。

### 食材知识库阶段 A / 集合

阶段 A 规划使用以下 7 个集合，职责彼此分开：

- `foods`：保存食材身份，包括稳定 ID、标准名称和分类，不承载用户库存记录。
- `food_search_terms`：保存标准名、别名和归一化后的搜索名，并指向对应食材身份。
- `storage_rules`：保存由食材状态、保存方式、温度、人群等条件共同决定的规则，并在规则自身记录 `evidenceLevel`（证据等级）。
- `evidence_sources`：只保存来源元数据、适用范围、定位和状态等可追溯信息。
- `knowledge_releases`：保存不可变的发布版本及其 `checksum`；`checksum` 是 SHA-256 digest 的小写 hex 文本，长度恰为 64 个字符，不带算法前缀，用于确认一组知识数据没有被改写。
- `food_search_docs`：由发布流程生成、供运行时读取的搜索快照；它不是编辑源，禁止人工编辑。
- `search_events`：最小化记录零结果查询和用户选择反馈，用于后续补充搜索名，不保存无关的客户端数据。

知识集合的编辑与发布只允许管理端或云函数执行。小程序只读正式运行快照，不能直接写入上述知识集合；`search_events` 也只能由云函数在字段白名单校验和限流后写入，不能由客户端任意直写。

阶段 A 当前仅生成本地候选数据和迁移报告，不创建线上正式版本，也不切换当前搜索。CloudBase 上传以及活动版本切换留给后续的运行快照计划；这里描述的是集合与权限设计，不表示已经部署。

## 家长账号与家庭共享部署顺序

账号、家庭和食材云函数存在依赖关系，首次部署或更新这套功能时按以下顺序操作：

1. 创建或确认上面的数据库集合，尤其是 `user_profiles`、`family_members` 和 `families`。
2. 上传并部署 `cloudfunctions/login`。
3. 上传并部署 `cloudfunctions/accountApi`，选择“云端安装依赖”。
4. 重新上传并部署 `cloudfunctions/familyApi` 和 `cloudfunctions/foodApi`，同样选择“云端安装依赖”。
5. 在 `utils/cloudConfig.local.js` 中填入当前环境 ID，并将 `useCloudFoodApi` 设置为 `true`。
6. 先用一个新微信账号登录，确认自动生成 1 人家庭；再用第二个账号验证邀请、加入、共同编辑和本机食材同步。

### 家庭微信分享验收

家庭分享需要用两个不同的微信账号做真机验收，开发者工具中单账号无法完整验证：

1. 账号 A 登录后进入“家庭共享”，点击“邀请家人”并通过微信分享。这会把 A 的个人家庭升级为正式家庭。
2. 账号 B 从微信分享卡片打开小程序，先登录，再在邀请预览中确认加入。
3. A 和 B 分别添加或处理一条食材，确认另一方能看到共用食材库和编辑记录。
4. 再用其他正式家庭邀请 A，确认系统拒绝加入；一个账号同一时间只能属于一个正式家庭。

如果 `accountApi` 日志提示 `user_profiles` 不存在，先手动创建该集合，再重新部署并调用。不要把 Qwen API Key、订阅消息密钥或其他服务端密钥写进 `utils/cloudConfig.local.js` 或任何小程序客户端文件；这些值应放在对应云函数的环境变量中。

## 部署云函数

在开发者工具里依次右键上传并部署：

- `cloudfunctions/login`
- `cloudfunctions/accountApi`
- `cloudfunctions/familyApi`
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

1. 复制 [utils/subscribeConfig.example.js](../utils/subscribeConfig.example.js) 为 `utils/subscribeConfig.local.js`。
2. 把真实模板 ID 写入 `subscribeConfig.local.js`。
3. 如果使用云函数发送订阅消息，也复制 [cloudfunctions/sendFoodReminder/subscribeConfig.example.js](../cloudfunctions/sendFoodReminder/subscribeConfig.example.js) 为同目录下的 `subscribeConfig.local.js`。
4. 上传部署 `sendFoodReminder` 云函数。

这些 `*.local.js` 文件已加入 `.gitignore`，不会进入开源仓库。未配置前，提醒页会提示“订阅模板未配置”，这不是代码错误。

## 拍照识别

当前 `mockRecognize` 已保留原函数名，方便前端调用链稳定：

- 上传图片。
- 如果云函数配置了 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY`，会优先调用 Qwen 视觉模型识别图片里的多种食材。
- 如果只保留旧的 `OPENAI_API_KEY`，仍会走 OpenAI 兼容兜底。
- 如果没有配置密钥，开发联调时会使用模拟候选食材；如果真实模型超时或调用失败，会返回空结果，让页面提示重试或搜索添加，避免把模拟食材误当成识别成功。
- 用户选择识别结果。
- 进入添加食材页。
- 写入识别记录。

真实识别的配置方式：

1. 在云开发控制台打开 `mockRecognize` 云函数。
2. 添加环境变量 `DASHSCOPE_API_KEY`，值为阿里云百炼 / DashScope API Key。也可以使用 `QWEN_API_KEY`。
3. 可选添加 `QWEN_VISION_MODEL` 或 `DASHSCOPE_VISION_MODEL`，默认使用 `qwen-vl-plus`。
4. 可选添加 `QWEN_BASE_URL` 或 `DASHSCOPE_BASE_URL`，默认使用 `https://dashscope.aliyuncs.com/compatible-mode`。
5. 建议把云函数“执行超时”调到 `30` 秒以上；真实视觉模型请求可能超过默认的 `3-15` 秒。
6. 可选添加 `DASHSCOPE_REQUEST_TIMEOUT_MS` 或 `QWEN_REQUEST_TIMEOUT_MS`，默认 `25000`。这个值要小于云函数执行超时，方便代码先捕获失败并回退。
7. 如果暂时只想用旧 OpenAI 配置，也可以保留 `OPENAI_API_KEY`、`OPENAI_VISION_MODEL`、`OPENAI_BASE_URL`，但优先级低于 Qwen 配置。
8. 重新上传并部署 `cloudfunctions/mockRecognize`。

如果日志里已经出现 `provider: 'qwen'`、`hasDashScopeKey: true`、`hasImageUrl: true`，但随后显示 `Invoking task timed out after 15 seconds`，说明配置已生效，问题是云函数执行超时太短。先把云函数执行超时改成 `30` 秒，并保留默认 `DASHSCOPE_REQUEST_TIMEOUT_MS=25000` 即可继续排查。

不要把 API Key 写入代码或提交到 GitHub。仓库已忽略 `.env` 和 `.env.*`，但微信云函数推荐直接在云开发控制台配置环境变量。

云函数会先把微信云存储的 `cloud://` 图片转换成临时 HTTPS URL，再下载为 `data:image/...;base64,...` 交给视觉模型，减少外部模型再次拉取微信临时 URL 的等待。返回结构保持不变，页面代码不需要大改：

```js
{
  foodName: '西兰花',
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

- 云环境不存在：确认 `utils/cloudConfig.local.js` 中的 `cloudEnvId` 是否是你自己的真实云环境 ID，并确认开发者工具登录的是同一个 AppID。
- `collection not exists`：说明数据库集合还没创建。
- `function not found`：说明对应云函数还没上传部署。
- `permission denied`：说明集合权限或云函数调用权限需要调整。
- 订阅模板未配置：这是模板 ID 占位提示，不影响其他功能。

### 打开云模式后页面仍然有数据

这是正常的。`utils/foodService.js` 会在云函数失败时回退到本地 repository，避免调试时整个页面空掉。联调云端时可以同时看开发者工具控制台和云数据库集合，确认数据是否真的写到了云端。

## 上线前检查

- `utils/cloudConfig.local.js` 已填入真实环境 ID。
- `useCloudFoodApi` 已按上线目标设置。
- `login`、`accountApi`、`familyApi`、`foodApi` 等所需云函数已部署。
- 家长账号、家庭共享、食材、反馈和识别所需集合已创建。
- 已执行 `initFoodBase`。
- 新账号登录后可创建 1 人家庭，并已验证邀请加入和共同编辑记录。
- 订阅消息模板 ID 已替换，或者明确暂不上线订阅能力。
- 真机测试过添加、编辑、完成食材、提醒列表、反馈、识别记录。
