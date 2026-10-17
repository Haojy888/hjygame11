# 深海场景模型

三个独立模型通过用户授权的 Aholo Lux3D 国内 API 文本建模生成，经 Blender 整理后在游戏中复用12个实例。

| 文件 | 任务 ID | 内容 |
|---|---|---|
| vent.glb | 4168824 | 海底烟囱岩柱 |
| arch.glb | 4168829 | 可穿行的风化石拱门 |
| coral.glb | 4168834 | 海绵珊瑚岩簇 |

每个资源为单节点、单材质，底部原点、Y轴朝上、归一高度1米，嵌入PNG贴图。实际高度、位置、旋转由 `AbyssScene.modelPlacements` 定义；`AbyssAssets` 沿真实海床倾斜与落底，在远处不加载，失败保留程序化场景。生成材质和模型按 Aholo 服务条款使用，未导入第三方照片或网格。

处理脚本见 `tools/prepare-abyss-props.py`，场景和复现说明见 `docs/深海古神模型.md`。原始生成GLB、服务源包、Blender工程及预览保存在本机任务交付目录。
