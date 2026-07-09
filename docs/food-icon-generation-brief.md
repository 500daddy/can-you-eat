# 食材 Icon 切图生成需求

请为「宝宝食材小管家」生成一批食材 icon。应用当前是温暖、像素风、亲子食材管理工具，所以 icon 需要统一、准确、可读。

## 统一风格

- 像素风食材 icon，适合微信小程序 UI。
- 透明背景 PNG。
- 单个食材主体居中，不要文字、标签、盘子、桌面、阴影背景。
- 画面干净，轮廓清晰，小尺寸下能辨认。
- 风格接近现有食材 icon：圆润、轻微高光、低复杂度、儿童友好。
- 不要生成写实照片，不要 3D 渲染，不要卡通表情。
- 每张图保持同一视角和同一大小比例，主体不要被裁切。
- 文件入库尺寸：64x64 PNG，透明背景；如果先生成高分辨率源图，最终交付前必须缩放到 64x64。
- 主体最长边建议控制在 48-50px，四周保留约 7px 以上透明安全边距，和现有老 icon 的视觉大小保持一致。

## 准确性要求

- 每个 icon 必须准确对应食材名称。
- 如果某个食材和相似食材容易混淆，请优先表现它最有辨识度的外观。
- 不要用相似食材代替。例如：
  - 梨不能画成苹果。
  - 山药不能画成莲藕。
  - 芋头不能画成土豆。
  - 葡萄不能画成蓝莓。
  - 柚子不能画成橙子。
  - 猪里脊不能画成牛肉或鸡肉。
- 如果一个食材更适合表现为切面，可以使用「完整主体 + 少量切面」组合，但仍然只画这个食材。

## 命名规则

请严格按下面的文件名输出。不要改名，不要加前缀或序号。

## 第一批优先生成

优先生成这些高频食材：

| 文件名 | 食材 |
| --- | --- |
| food_pear.png | 梨 |
| food_yam.png | 山药 |
| food_taro.png | 芋头 |
| food_radish.png | 白萝卜 |
| food_cauliflower.png | 花菜 |
| food_bok_choy.png | 上海青 |
| food_napa_cabbage.png | 大白菜 |
| food_grape.png | 葡萄 |
| food_watermelon.png | 西瓜 |
| food_peach.png | 桃子 |
| food_pork.png | 猪里脊 |
| food_salmon.png | 三文鱼 |
| food_yogurt.png | 酸奶 |
| food_millet.png | 小米 |
| food_rice_noodle.png | 米粉 |

## 完整缺失清单

### 蔬菜

| 文件名 | 食材 | 备注/别名 |
| --- | --- | --- |
| food_bok_choy.png | 上海青 | 青菜、小油菜、小白菜 |
| food_lettuce.png | 生菜 | 叶用莴苣 |
| food_napa_cabbage.png | 大白菜 | 白菜 |
| food_cabbage_head.png | 卷心菜 | 圆白菜、包菜 |
| food_celery.png | 芹菜 | 西芹 |
| food_cauliflower.png | 花菜 | 菜花 |
| food_asparagus.png | 芦笋 |  |
| food_amaranth.png | 苋菜 | 红苋菜 |
| food_pea_shoots.png | 豌豆苗 | 豆苗 |
| food_yam.png | 山药 | 淮山 |
| food_taro.png | 芋头 | 芋艿 |
| food_radish.png | 白萝卜 | 萝卜 |
| food_bamboo_shoot.png | 竹笋 | 笋 |
| food_zucchini.png | 西葫芦 | 角瓜 |
| food_wax_gourd.png | 冬瓜 |  |
| food_bitter_melon.png | 苦瓜 | 凉瓜 |
| food_loofah.png | 丝瓜 |  |
| food_pea.png | 豌豆 | 青豆 |
| food_green_bean.png | 四季豆 | 豆角 |
| food_shiitake.png | 香菇 | 冬菇 |
| food_enoki.png | 金针菇 |  |
| food_oyster_mushroom.png | 平菇 |  |
| food_kelp.png | 海带 | 昆布 |
| food_laver.png | 紫菜 | 海苔 |

### 水果

| 文件名 | 食材 | 备注/别名 |
| --- | --- | --- |
| food_pear.png | 梨 | 雪梨 |
| food_peach.png | 桃子 | 水蜜桃 |
| food_grape.png | 葡萄 | 提子 |
| food_watermelon.png | 西瓜 |  |
| food_cantaloupe.png | 哈密瓜 | 甜瓜 |
| food_mango.png | 芒果 |  |
| food_papaya.png | 木瓜 |  |
| food_dragon_fruit.png | 火龙果 |  |
| food_cherry.png | 樱桃 | 车厘子 |
| food_plum.png | 李子 |  |
| food_grapefruit.png | 柚子 | 西柚 |
| food_pineapple.png | 菠萝 | 凤梨 |
| food_pomegranate.png | 石榴 |  |
| food_raspberry.png | 树莓 | 覆盆子 |

### 肉禽水产

| 文件名 | 食材 | 备注/别名 |
| --- | --- | --- |
| food_pork.png | 猪里脊 | 猪肉、瘦猪肉 |
| food_lamb.png | 羊肉 | 羊腿肉 |
| food_duck.png | 鸭肉 |  |
| food_turkey.png | 火鸡肉 |  |
| food_salmon.png | 三文鱼 | 鲑鱼 |
| food_bass.png | 鲈鱼 |  |
| food_hairtail.png | 带鱼 |  |
| food_scallop.png | 扇贝 | 贝柱 |
| food_clam.png | 蛤蜊 | 花甲 |

### 蛋奶豆制品

| 文件名 | 食材 | 备注/别名 |
| --- | --- | --- |
| food_quail_egg.png | 鹌鹑蛋 |  |
| food_yogurt.png | 酸奶 | 原味酸奶 |
| food_soy_milk.png | 豆浆 |  |
| food_dried_tofu.png | 豆干 | 豆腐干 |
| food_edamame.png | 毛豆 |  |

### 主食辅食

| 文件名 | 食材 | 备注/别名 |
| --- | --- | --- |
| food_millet.png | 小米 |  |
| food_oat.png | 燕麦 | 燕麦片 |
| food_black_rice.png | 黑米 |  |
| food_quinoa.png | 藜麦 |  |
| food_buckwheat.png | 荞麦 |  |
| food_wheat_flour.png | 面粉 | 小麦粉 |
| food_rice_noodle.png | 米粉 | 婴儿米粉 |
| food_steamed_bun.png | 馒头 |  |
| food_dumpling.png | 饺子 | 馄饨 |
| food_egg_custard.png | 蒸蛋羹 | 蛋羹 |
| food_meat_puree.png | 肉泥 | 自制肉泥 |

## 交付方式

- 请按文件名分别输出 PNG。
- 每个文件透明背景。
- 如果一次无法生成全部，请先生成「第一批优先生成」。
- 生成后请不要把多个 icon 合成一张图。
