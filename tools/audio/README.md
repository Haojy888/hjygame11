# 音频构建（钓鱼音效）

此工具根据 Freesound 上的 CC0 试听音频，重新生成 `public/audio/` 中的钓鱼音效。需要 Node.js 和带 libopus 支持的 ffmpeg。所有音效均来自真实录音，没有合成音；来源与许可见 `public/audio/CREDITS.md`。

```sh
cd tools/audio
node search.mjs "fishing reel"          # 仅搜索 CC0 的 Freesound 素材；输出 id、用户、时长、下载量和标题
node dl.mjs 509902:tosha73 507070:paulprit 450849:kyles 371313:Mrthenoronha 725426:mwchristian95 \
  523282:MrFossy 464697:BranndyBottle 849752:JoelMcDaniel 537084:khenshom 507094:paulprit \
  507093:paulprit 649003:ramattahatta 570208:RatBird 336585:Anthousai
                                         # 生成 raw/<id>.ogg 和 raw/<id>.json；会打印各素材许可，需核对 CC0
node build-fishing.mjs                   # 生成 out/*.ogg 和 fishing-bank.json
cp out/*.ogg ../../public/audio/         # 再把 fishing-bank.json 中的条目复制到 src/audio/soundBank.js
```

- 循环音效（`reel_wind`、`reel_drag`、`line_strain`）：截取片段，在循环接缝处进行等功率交叉淡化，并把综合响度标准化为 −23 LUFS；音效库中的 `lufs` 记录瞬时响度中位数。
- 音效片段集合（其他所有文件）：每个片段的峰值标准化为 −1 dBFS；`lufs` 记录该片段的最高瞬时响度。
- 混音器（`src/audio/SoundScape.js` 中的 `MIX`）使用这些测量值，把目标响度换算为增益。

`raw/`、`work/` 和 `out/` 是构建过程中的临时目录，不提交到仓库。