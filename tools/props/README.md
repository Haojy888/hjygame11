# 商贩摊位素材构建

使用 Poly Haven 的 CC0 素材构建 `public/models/props/`，供 `src/game/StallKit.js` 中乔（Joe）的鱼摊和玛尔塔（Marta）的船具店使用。

原项目的构建命令如下。第二条命令使用 macOS 的 Blender 路径；在其他系统上请改成实际安装的 Blender 可执行文件路径。

```sh
python3 tools/props/fetch.py
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/props/decimate.py
node tools/props/build.mjs
```

`fetch.py` 将下载文件保存到被 Git 忽略的 `tools/props/.raw/`；`decimate.py` 在 `.raw/dec/` 中生成简化后的模型；`build.mjs` 需要 ImageMagick（`magick`）。后者会把模型打包到 `props.bin`／`props.json`（记录每个顶点的位置、法线、UV 和纹理层），生成 512 像素的道具纹理与 1K 的表面纹理，并绘制 `signs.png`。

**中文版招牌图集：** 当前仓库的 `public/models/props/signs.png` 由 `tools/props/build-signs-zh.ps1` 绘制，包含中文店招、收鱼价格黑板和秤盘。该脚本使用 Windows 的 .NET `System.Drawing` 与系统安装的“华文行楷”“微软雅黑”字体，字体文件未随仓库提供。它沿用原图集的尺寸与纹理坐标区域。运行 `build.mjs` 会重新生成原版英文 `signs.png`；完成模型和纹理构建后，请在仓库根目录的 Windows PowerShell 中运行以下命令，以重新生成中文图集：

```powershell
.\tools\props\build-signs-zh.ps1
```

原版图集使用的 Permanent Marker（Apache 2.0）、Cabin Sketch 和 Oswald（SIL OFL 1.1）字体文件及其许可证文本仍保留在本目录的 `fonts/`（即 `tools/props/fonts/`）；中文图集脚本不使用这些字体。

添加道具时，依次将其 Poly Haven ID 加入 `fetch.py` 的 `MOD`、`build.mjs` 的 `MODELS` 和 `decimate.py` 的 `BUDGET`；重新构建后，用 `KitBuilder.prop( name, matrix )` 在场景中放置。
