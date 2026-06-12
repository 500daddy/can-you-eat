# Sprite Assets v1

This folder contains the first generated pixel sprite sheet for 宝宝食材小管家.

## Files

- `baby-food-sprite-sheet-v1.png`  
  Original generated image on a flat magenta chroma-key background.
- `baby-food-sprite-sheet-v1-transparent.png`  
  Chroma-key processed transparent PNG.
- `individual-v1/`  
  24 cropped transparent PNG sprites from the sheet.

## Grid

- Source size: `1536x1024`
- Layout: `6 columns x 4 rows`
- Cell size: `256x256`

## Sprite Order

1. `baby-head`
2. `baby-helper`
3. `broccoli`
4. `carrot`
5. `blueberry`
6. `pumpkin`
7. `apple`
8. `egg`
9. `avocado`
10. `banana`
11. `tomato`
12. `potato`
13. `bell`
14. `heart`
15. `status-baby-ok`
16. `status-adult-reference`
17. `status-warning`
18. `status-finished`
19. `wooden-sign`
20. `village-house`
21. `tree`
22. `fence`
23. `camera`
24. `fridge`

## Generation Prompt

Create an original pixel art sprite sheet for a Chinese baby food keeper mini app, cozy "new parent village" game UI style. Create a clean `6 columns x 4 rows` grid with 24 separate sprites. Use cute refined pixel art, crisp square pixels, dark warm brown outlines, soft cream highlights, forest green primary palette, warm wood browns, and gentle orange/yellow accents. Avoid emoji style, 3D rendering, vector smoothness, and photorealism.

Sprites: baby mascot head, full baby helper mascot with tiny apron, broccoli, carrot, blueberry cluster, pumpkin, apple, egg, avocado, banana, tomato, potato, reminder bell, pink heart, safe-for-baby status badge icon, adult-reference status badge icon, not-recommended warning status icon, finished/checked status icon, wooden signboard, small village house, round tree, fence segment, camera icon, storage fridge icon.

Background requested as flat `#ff00ff` chroma key for local transparency removal.

## Notes

- This is a v1 generated asset pack. It is good enough for UI direction and first implementation.
- Before final app release, manually inspect and normalize sizes in Aseprite/Piskel.
- Recommended production exports:
  - Food icons: `48x48`, `@2x`, `@3x`
  - Small status icons: `32x32`, `@2x`, `@3x`
  - Mascot / empty-state assets: `96x96`, `@2x`, `@3x`
