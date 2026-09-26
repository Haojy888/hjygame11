# 角色资源

商贩乔（Joe，鱼摊）和玛尔塔（Marta，船具店）的角色来自 [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) 角色库，采用 MIT 许可证（见 `public/models/characters/LICENSE-Rocketbox.md`）。离线转换后，每人各对应一个 GLB 文件（`public/models/characters/joe.glb`、`marta.glb`），内含网格（约 7,500 个三角形，80 根骨骼的 Bip01 骨架）、1024² 纹理和下列动画片段。

    tools/characters/build.sh [workdir]      # 下载 → 处理纹理 → Blender 转换 → public/models/characters/

- `fetch.sh`：从 Rocketbox 仓库获取角色文件，优先使用 Git LFS 媒体链接，失败时使用原始文件链接。
- `textures.sh`：将 2048² TGA 贴图转成 1024² JPEG／PNG。高光贴图转换为 ORM 纹理中的粗糙度通道（R = 1，G 通道粗糙度 = 0.92 − 0.6 × 高光值，B 通道金属度 = 0）；透明度贴图（头发、睫毛）保留 alpha。
- `convert.py`：使用 Blender 4.2 或更新版本（已在 5.2 测试），以后台模式导入角色，创建可导出为 glTF 的材质（`body`、`head`、`opacity`），逐个导入 FBX 动画，并按骨骼名称在世界空间中重定向。动画骨架的手臂自然下垂，而角色采用 T 字姿势，因此不能直接复制局部旋转：每根角色骨骼复制对应动画骨骼的世界空间旋转，骨盆还复制其位置。结果会烘焙为每个动画片段一条 NLA 轨道，并导出为 glTF 动画。

动画片段使用原地播放的 `motextr_static` 版本；`m_` 代表男性，`f_` 代表女性：`idle_neutral_01`、`idle_breathe_01`、`idle_look_around_01`、`gestic_talk_neutral_01`、`gestic_talk_relaxed_01`、`wave_01`、`gestic_shrug_01`。

运行时由 `engine/loaders/GLTF.js`（loadGLB）加载角色，并由 `engine/render/Skinning.js`（SkinnedModel）处理动画片段交叉淡化、GPU 蒙皮、运动矢量和阴影。`game/Vendor.js` 会在角色加载完成后，以正式角色替换临时占位人物。`test/character-smoke.mjs <glb> <out.png> [clip]` 可对指定角色进行无界面渲染。