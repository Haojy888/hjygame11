# 近景鱼模型复现

使用 Blender 5.2.2 LTS 的后台模式运行 `tools/prepare-fish.py`。源文件保存在交付目录 `../fish-realism/lux3d-source/`，不会被脚本修改；可先将下面的 `--mode prepare` 换成 `--mode inspect` 查看原网格面数、长轴、纹理及六向轮廓图。

从仓库根目录运行以下 PowerShell 命令；将 `<blender.exe>` 替换为本机 Blender 可执行文件的绝对路径：

```powershell
$blenderExe = '<blender.exe>'
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism/lux3d-source/grunt_glb.glb --name grunt --mode prepare --work ../../work/fish-realism --forward=0.633,-0.768,-0.092 --up +Z --width-scale 0.9 --height-scale 0.86 --preserve-source-seams --out-glb public/models/fish-realistic/grunt.glb --out-blend ../fish-realism/blender/grunt.blend
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism/lux3d-source/yellowtail_glb.glb --name yellowtail --mode prepare --work ../../work/fish-realism --forward=-0.001,-0.9995,-0.03165 --up +Z --preserve-source-seams --out-glb public/models/fish-realistic/yellowtail.glb --out-blend ../fish-realism/blender/yellowtail.blend
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism/lux3d-source/tuna_glb.glb --name tuna --mode prepare --work ../../work/fish-realism --forward=-0.72381,-0.68777,-0.0554 --up +Z --mirror-clean-side --out-glb public/models/fish-realistic/tuna.glb --out-blend ../fish-realism/blender/tuna.blend
```

三鱼均按实际源网格检查后设定鼻朝 `+Z`、背朝 `+Y`，总长归一为 1，减至约 1.4 万三角，附单网格尾骨和约 2 秒的 `idle` 尾摆。蓝纹石鲈与黄尾笛鲷保留源 UV 岛；金枪鱼将干净的左半身镜像到右半身以去除源模型胸鳍下的多余片状几何。GLB 内嵌两张真实 2048×2048 PNG（底色、粗糙度/金属度），不含源文件没有的法线图。

`../fish-realism/blender/*.blend` 是可编辑的 Blender 工程，`public/models/fish-realistic/*.glb` 是游戏运行资源。导出后应以实际游戏渲染检查两侧轮廓、贴图、尾摆和钓获卡边界；仅有 Blender 导出成功不代表视觉验收通过。
