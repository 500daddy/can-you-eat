# 宝宝食材小管家

原生微信小程序 MVP。当前阶段先完成“养娃新手村 / 食材小管家”像素风静态 UI 骨架，业务数据使用 `utils/mockData.js`。

## 当前已完成

- 根级小程序入口：`app.js`、`app.json`、`app.wxss`
- 页面：首页、食材搜索、添加食材、拍照识别、食材详情、编辑食材、提醒中心、我的、宝宝模式设置、提醒设置
- 公共组件：状态标签、食材卡片、空状态
- 像素素材：引用 `/assets/sprites/` 下的原创 sprite 切图
- 云函数占位：`login`、`mockRecognize`

## 开发者工具打开方式

1. 用微信开发者工具打开本目录。
2. AppID 可先使用测试号或游客模式。
3. 如果要启用云开发，将 `app.js` 中的 `cloud1-please-replace` 替换为你的云环境 ID。

## 下一步

- 接入 `food_base`、`user_food_records`、`user_settings` 云数据库。
- 将 `utils/mockData.js` 替换为云函数调用。
- 完成添加、搜索、状态计算、提醒列表的真实数据闭环。
