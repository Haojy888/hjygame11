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

## 第二批：拿骚石斑鱼、鬼头刀与鹦嘴鱼候选

第二批源文件位于 `../fish-realism-batch2/lux3d-source/`，Blender 工程位于 `../fish-realism-batch2/blender/`。从仓库根目录运行：

```powershell
$blenderExe = '<blender.exe>'
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism-batch2/lux3d-source/grouper_glb.glb --name grouper --mode prepare --work ../../work/fish-realism-batch2 --forward=0.0017,-0.9947,-0.1032 --up +Z --preserve-source-seams --repair-grouper --out-glb public/models/fish-realistic/grouper.glb --out-blend ../fish-realism-batch2/blender/grouper.blend
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism-batch2/lux3d-source/mahi_glb.glb --name mahi --mode prepare --work ../fish-realism-batch2/mahi-processing --forward=-Y --up +Z --preserve-source-seams --out-glb public/models/fish-realistic/mahi.glb --out-blend ../fish-realism-batch2/blender/mahi.blend
& $blenderExe --background --factory-startup --python-exit-code 1 --python tools/prepare-fish.py -- --source ../fish-realism-batch2/lux3d-source/parrot_glb.glb --name parrot --mode prepare --work ../../work/fish-realism-batch2 --forward=-0.9523568,0.037095,-0.3027219 --up +Z --preserve-source-seams --repair-parrot --out-glb ../fish-realism-batch2/game-candidates/parrot.glb --out-blend ../fish-realism-batch2/blender/parrot.blend
```

拿骚石斑鱼保留源 UV 岛，尾缘改为圆凸，鳃盖下缘局部平滑，再从焊接的高模副本传回连续法线。鬼头刀保留源 UV 岛及轮廓。两条已在游戏的原生渲染中检查正反两侧、尾摆及 1000×600 / 1200×500 钓获卡，作为运行资源启用。最终 GLB 均为约 1.4 万三角、单网格四骨 `idle`、两张内嵌 2048×2048 PNG。

鹦嘴鱼源模型的头部、胸鳍和喙形缺陷经本地修形后仍在近景明显，因此 `game-candidates/parrot.glb` **只是未上线候选**，游戏继续使用原有程序化外观。保留源 GLB、候选 GLB 和 `.blend`，供后续有更合适的源模型时继续处理。
