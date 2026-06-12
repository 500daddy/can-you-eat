# 宝宝食材小管家 Sprite Assets

切图来源：`assets/sprites/source/sprite_sheet_original.png`。

目录：

- `mascot/` 宝宝角色、头像、小鸡、空状态插画
- `food/` 食材图标
- `status/` 状态标签与保存方式
- `nav/` 底部导航图标
- `actions/` 操作图标与按钮
- `ui/` 卡片、气泡、进度条、装饰、分割线和村庄 banner

说明：

- 食材图标已居中输出为 `128x128` 透明 PNG。
- 导航图标已居中输出为 `64x64` 透明 PNG。
- 部分按钮、状态标签和 UI 背景保留原始比例。
- 状态标签正式开发时仍建议优先用 WXSS 组件重绘，PNG 可作为视觉参考。
- 如果后续需要更精细切图，可根据 `asset_manifest.json` 中的 bbox 调整。
