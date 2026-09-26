# 商贩摊位素材：致谢与许可

纹理和模型来自 [Poly Haven](https://polyhaven.com)，采用 **CC0 1.0（公共领域）** 许可。CC0 不要求署名，此处仍列出来源，便于追溯。素材由 `tools/props/` 中的 `fetch.py`、`decimate.py` 和 `build.mjs` 构建，并由 `src/game/StallKit.js` 用于乔（Joe）的鱼摊和玛尔塔（Marta）的船具店。

| 文件 | Poly Haven 素材 | 许可 | 处理方式 |
|---|---|---|---|
| `s_weathered_brown_planks_{a,n,r}.jpg` | [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks) | CC0 | 1K，未修改 |
| `s_weathered_planks_{a,n,r}.jpg` | [Weathered Planks](https://polyhaven.com/a/weathered_planks) | CC0 | 1K，未修改 |
| `s_worn_corrugated_iron_{a,n,r}.jpg` | [Worn Corrugated Iron](https://polyhaven.com/a/worn_corrugated_iron) | CC0 | 1K，未修改 |
| `s_weathered_peeling_timber_{a,n,r}.jpg` | [Weathered Peeling Timber](https://polyhaven.com/a/weathered_peeling_timber) | CC0 | 1K，未修改 |
| `p_wooden_crate_02_*`（位于 `props.bin`） | [Wooden Crate 02](https://polyhaven.com/a/wooden_crate_02) | CC0 | Blender 简化至 3,497 个三角形；512 像素纹理 |
| `p_wooden_crate_01_*`（位于 `props.bin`） | [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01) | CC0 | Blender 简化至 3,497 个三角形；512 像素纹理 |
| `p_wooden_bucket_01_*`（位于 `props.bin`） | [Wooden Bucket 01](https://polyhaven.com/a/wooden_bucket_01) | CC0 | Blender 简化至 2,997 个三角形；512 像素纹理 |
| `p_fish_knife_*`（位于 `props.bin`） | [Fish Knife](https://polyhaven.com/a/fish_knife) | CC0 | Blender 简化至 1,498 个三角形；512 像素纹理 |
| `p_wooden_cutting_board_*`（位于 `props.bin`） | [Wooden Cutting Board](https://polyhaven.com/a/wooden_cutting_board) | CC0 | Blender 简化至 1,499 个三角形；512 像素纹理 |
| `p_lifebuoy_*`（位于 `props.bin`） | [Lifebuoy](https://polyhaven.com/a/lifebuoy) | CC0 | Blender 简化至 3,500 个三角形；512 像素纹理 |
| `p_wooden_lantern_01_*`（位于 `props.bin`） | [Wooden Lantern 01](https://polyhaven.com/a/wooden_lantern_01) | CC0 | Blender 简化至 3,998 个三角形；512 像素纹理 |
| `p_fishermans_hat_*`（位于 `props.bin`） | [Fisherman's Hat](https://polyhaven.com/a/fishermans_hat) | CC0 | Blender 简化至 3,000 个三角形；512 像素纹理 |
| `p_WoodenTable_03_*`（位于 `props.bin`） | [Wooden Table 03](https://polyhaven.com/a/WoodenTable_03) | CC0 | Blender 简化至 2,298 个三角形；512 像素纹理 |
| `p_metal_jerrycan_green_*`（位于 `props.bin`） | [Metal Jerrycan Green](https://polyhaven.com/a/metal_jerrycan_green) | CC0 | Blender 简化至 3,497 个三角形；512 像素纹理 |
| `p_plastic_jerrycan_*`（位于 `props.bin`） | [Plastic Jerrycan](https://polyhaven.com/a/plastic_jerrycan) | CC0 | Blender 简化至 3,000 个三角形；512 像素纹理 |
| `p_life_jacket_*`（位于 `props.bin`） | [Life Jacket](https://polyhaven.com/a/life_jacket) | CC0 | Blender 简化至 4,000 个三角形；512 像素纹理 |
| `p_metal_toolbox_*`（位于 `props.bin`） | [Metal Toolbox](https://polyhaven.com/a/metal_toolbox) | CC0 | Blender 简化至 4,495 个三角形；512 像素纹理 |
| `p_wooden_display_shelves_01_*`（位于 `props.bin`） | [Wooden Display Shelves 01](https://polyhaven.com/a/wooden_display_shelves_01) | CC0 | Blender 简化至 3,174 个三角形；512 像素纹理 |

当前的 `signs.png`（中文店招、收鱼价格黑板和秤盘）由 `tools/props/build-signs-zh.ps1` 使用 Windows .NET `System.Drawing` 和系统中文字体“华文行楷”“微软雅黑”重新绘制；字体文件没有打包进本仓库。它取代了 `tools/props/build.mjs` 使用 ImageMagick 绘制的原版英文图集。重新运行 `build.mjs` 后，还需运行中文脚本，才能恢复中文 `signs.png`。

原版英文图集使用 Permanent Marker（Apache 2.0）、Cabin Sketch 和 Oswald（SIL OFL 1.1）字体；这些字体文件及其许可证文本仍保留在 `tools/props/fonts/`。

纹理为 JPEG，包含反照率（sRGB）、OpenGL 法线和 ARM 贴图（R 通道为环境光遮蔽、G 为粗糙度、B 为金属度）。