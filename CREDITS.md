# 致谢与素材许可

本仓库代码采用 MIT 许可证发布（见 `LICENSE`）。以下第三方素材分别遵循各自的许可证。

## 音频：`public/audio/`

共 42 段来自 [Freesound](https://freesound.org) 的环境录音，全部采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布。CC0 不要求署名，但每个文件的作者和来源链接仍列于 [`public/audio/CREDITS.md`](public/audio/CREDITS.md)。

录音作者：YevgVerh、straget、Alex_hears_things、chris_dagorne、bruno.auzet、felix.blume、hdfreema、richardemoore、KaleidacousticsAudio、AugustSandberg、kyles、Pfannkuchn、200221-WeanBekker、florianreichelt、Nox_Sound、ryansitz、SilentStrikeZ、SecureSubset、tbsounddesigns、qubodup、blaukreuz、wormer2、roboroo、squashy555、Soojay、coalcon、dubminister、nathankwright、SorenF109、LaScienceMusicale、KEVOY、mikewest、tosha73、paulprit、Mrthenoronha、mwchristian95、MrFossy、BranndyBottle、JoelMcDaniel、khenshom、ramattahatta、RatBird 和 Anthousai。

## 沙滩杂物扫描模型：`public/models/debris/`

来自 [Poly Haven](https://polyhaven.com) 的摄影测量模型，采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布：

- Dead Quiver Trunk
- Dead Quiver Branch 01
- Dead Quiver Branch 02
- Lambis Shell

模型网格经过简化，以生成不同细节层级；纹理保持原样。详见 [`public/models/debris/CREDITS.md`](public/models/debris/CREDITS.md)。

## 商贩摊位：`public/models/props/`

乔（Joe）的鱼摊和玛尔塔（Marta）的船具店使用了 [Poly Haven](https://polyhaven.com) 的纹理和模型，均采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布：

- 纹理：Weathered Brown Planks、Weathered Planks、Worn Corrugated Iron、Weathered Peeling Timber
- 模型：Wooden Crate 01 and 02、Wooden Bucket 01、Fish Knife、Wooden Cutting Board、Lifebuoy、Wooden Lantern 01、Fisherman's Hat、Wooden Table 03、Metal Jerrycan (green)、Plastic Jerrycan、Life Jacket、Metal Toolbox、Wooden Display Shelves 01

模型通过 `tools/props/` 简化，纹理也经过缩小。原版招牌使用了 [Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker)（Apache 2.0）、[Cabin Sketch](https://fonts.google.com/specimen/Cabin+Sketch)（SIL OFL 1.1）及 [Oswald](https://fonts.google.com/specimen/Oswald)（SIL OFL 1.1）字体；字体文件及其许可证位于 `tools/props/fonts/`。本地中文版招牌图集由 `tools/props/build-signs-zh.ps1` 使用系统中文字体重绘。详见 [`public/models/props/CREDITS.md`](public/models/props/CREDITS.md)。

中文版加载背景 `public/ui/keyart-zh.png` 使用图像生成工具参照原版截图制作，去除了画面中的英文招牌字样；原版截图仍保留在 `public/ui/`。

## 鱼类近景模型：`public/models/fish-realistic/`

本批三种鱼模型使用 Lux3D 的 **Lux G1** 分别独立生成，再通过 **Blender 5.2.2** 处理、导出为游戏使用的 GLB。原始生成任务记录如下：

| 资源 | 物种 | Lux3D 原始 taskId |
|---|---|---|
| `grunt.glb` | 蓝纹石鲈（*Haemulon sciurus*） | `3796961` |
| `yellowtail.glb` | 黄尾笛鲷（*Ocyurus chrysurus*） | `3796966` |
| `tuna.glb` | 黑鳍金枪鱼（*Thunnus atlanticus*） | `3797040` |

这三种近景模型只在对应鱼种的渔获卡片中按需加载；图鉴缩略图、水下鱼群和鱼摊继续使用原有轻量程序化模型。加载期间或加载失败时，渔获卡片使用程序化模型显示。18 种鱼共用的材质降低了鳞片与鳃盖的过强凹凸；近景摄影场景改在坐标原点渲染，消除高坐标精度不足导致的砂粒噪点，并保留完整鳍膜与透光效果。

外形和配色核对参考 Florida Museum of Natural History 的物种资料：

- [Bluestriped Grunt — 蓝纹石鲈](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/bluestriped-grunt/)：水平蓝纹、黄色棘背鳍、深色软背鳍与尾鳍，以及浅色胸鳍和腹鳍。
- [Yellowtail Snapper — 黄尾笛鲷](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/yellowtail-snapper/)：向尾部加宽的黄色侧条纹、黄色深叉尾和背部黄斑。
- [Blackfin Tuna — 黑鳍金枪鱼](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/blackfin-tuna/)：暗色背部、暗铜色且带浅色边缘的背部小离鳍，以及灰色腹部小离鳍。

本节登记生成素材的来源与加工过程，不为其额外声明第三方素材许可证。原项目的 `LICENSE`、程序化模型代码及既有第三方素材许可和署名保持原样。

## 座头鲸：`public/models/whale/`

这是原项目作者用自编脚本生成的原创程序化模型。模型比例参考已发表的座头鲸解剖资料，侧面轮廓描摹自 NOAA Fisheries 的插图；该插图是属于公共领域的美国政府作品。建模时参考的照片未包含在本仓库中。

## 角色：`public/models/characters/`

商贩（`joe.glb`、`marta.glb`）使用了 [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) 中的 `Wood_Male_01` 和 `Female_Adult_04` 角色，以及待机、交谈、挥手和耸肩动画（© Microsoft Corporation，MIT 许可证，许可证文件为 `LICENSE-Rocketbox.md`）。素材通过 `tools/characters/` 转换，包括缩小纹理、重定向动画和烘焙动画。相关论文：M. Gonzalez-Franco 等，*The Rocketbox Library and the Utility of Freely Available Rigged Avatars*，Frontiers in Virtual Reality，2020。

## 字体

[Inter](https://rsms.me/inter/) 和 [JetBrains Mono](https://www.jetbrains.com/lp/mono/) 均采用 SIL Open Font License 1.1。运行时会从 Google Fonts 加载，这些字体文件不包含在本仓库中。

## 库

SMAA 区域纹理和搜索纹理（`public/textures/smaa/`）来自 three.js（MIT）；three.js 收录的这些纹理源于 J. Jimenez 等人的 SMAA 参考实现（MIT）。

[Vite](https://vite.dev)（MIT）是 npm 依赖，本仓库未包含其源码副本。

## 技术与参考资料

以下是已发表的技术；本仓库未收录论文中的代码。

| 技术 | 来源 |
|---|---|
| FFT 海洋频谱 | J. Tessendorf，*Simulating Ocean Water* |
| 大气渲染 | S. Hillaire，*A Scalable and Production Ready Sky and Atmosphere Rendering Technique*（2020） |
| 体积云建模 | A. Schneider（Guerrilla Games）的 *Nubis* 系列演讲 |
| 运动模糊 | M. McGuire 等，*A Reconstruction Filter for Plausible Motion Blur*（2012）；J. Jimenez，*Next Generation Post Processing in Call of Duty: Advanced Warfare*（2014） |
| 泛光 | J. Jimenez（2014） |
| 锐化（RCAS） | AMD FidelityFX Super Resolution 1 |
| SMAA／FXAA | J. Jimenez 等，*SMAA: Enhanced Subpixel Morphological Antialiasing*（2012）；T. Lottes，*FXAA*（2009）；从 three.js 的 SMAANode／FXAANode（MIT）移植 |
| 栅格化焦散 | Evan Wallace 的 *WebGL Water* 方法 |
| 碎浪 | Guerrilla Games 的 *Horizon Forbidden West* 水体技术（SIGGRAPH 2022） |

云层噪声、光照和采样方案（`src/sky/Clouds.js`）改编自 DRG Software Solutions 自有的 *Sky Pro WebGPU*。该部分由版权所有者按本仓库的 MIT 许可证发布。
