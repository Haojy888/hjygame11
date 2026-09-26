# 音频致谢

本目录中的所有声音均为来自 [Freesound](https://freesound.org) 的真实录音，采用 **Creative Commons Zero（CC0 1.0）** 许可（公共领域贡献，无须署名；此处仍列出来源）。没有合成音。每段音效都取自 Freesound 提供的高质量试听音频。

处理流程（临时构建脚本）：截取片段、对部分音频进行高通滤波、修剪、淡入淡出、在循环接缝处进行等功率交叉淡化，以及响度标准化（循环音效的综合响度约为 −23 LUFS；单次触发的片段以 −1 dBFS 为峰值进行标准化），最后编码为 Ogg 容器中的 Opus（64 kb/s）。海浪片段依据检测到的起浪、波峰或波谷切分。单次触发音效文件包含多个片段；片段索引表位于 `src/audio/soundBank.js`。

| 文件 | 用途 | 来源 | 作者 | 许可 |
|---|---|---|---|---|
| `surf_crash.ogg` | 7 段碎浪声（浪花撞击／低沉拍岸声），用于沙滩和崎岖海岸；在每道浪破碎的位置播放 | [Ocean_coast_04_092025_0659AM](https://freesound.org/people/YevgVerh/sounds/827530/), [Big waves hit land.wav](https://freesound.org/people/straget/sounds/412308/) | YevgVerh, straget | CC0 1.0, CC0 1.0 |
| `surf_wash.ogg` | 6 段涨浪冲上沙滩的近距离录音 | [Gentle small waves lapping on shore.wav](https://freesound.org/people/Alex_hears_things/sounds/352356/) | Alex_hears_things | CC0 1.0 |
| `surf_backwash.ogg` | 6 段退浪排水声（沙粒中的细碎气泡声），近距离录音 | [Gentle small waves lapping on shore.wav](https://freesound.org/people/Alex_hears_things/sounds/352356/) | Alex_hears_things | CC0 1.0 |
| `surf_far.ogg` | 从悬崖顶听到的远处海浪轰鸣；循环播放 | [11ft waves breaking on sandy beach in the distance from the top of the cliff](https://freesound.org/people/chris_dagorne/sounds/426074/) | chris_dagorne | CC0 1.0 |
| `wind.ogg` | 海岸灌木间的风声；循环播放，并随阵风变化 | [strong wind on coastal path.wav](https://freesound.org/people/bruno.auzet/sounds/706471/) | bruno.auzet | CC0 1.0 |
| `palms.ogg` | 棕榈树中的风声（夹有白天的虫鸣）；循环播放，并随阵风变化 | [Wind through the palm trees and some crickets chirping in the day (Gran Sabana, Venezuela)](https://freesound.org/people/felix.blume/sounds/384550/) | felix.blume | CC0 1.0 |
| `crickets.ogg` | 夜间蟋蟀声；循环播放 | [Night Crickets Back Porch.aiff](https://freesound.org/people/hdfreema/sounds/333221/) | hdfreema | CC0 1.0 |
| `pier_lap.ogg` | 水拍打码头的声音；循环播放 | [WavesOnTheShore.wav](https://freesound.org/people/richardemoore/sounds/260263/) | richardemoore | CC0 1.0 |
| `under_reef.ogg` | 海湾水听器录音：鼓虾的爆裂声和低沉轰鸣；循环播放 | [Underwater crackling sounds_Hydrophone.wav](https://freesound.org/people/KaleidacousticsAudio/sounds/630436/) | KaleidacousticsAudio | CC0 1.0 |
| `boat_engine.ogg` | Volvo Penta MD22 船用柴油发动机；循环播放，音调随转速变化 | [Marine diesel engine](https://freesound.org/people/AugustSandberg/sounds/264864/) | AugustSandberg | CC0 1.0 |
| `boat_lap.ogg` | 水拍打玻璃纤维船体的声音；循环播放 | [boat knocks fiberglass water laps on hull.flac](https://freesound.org/people/kyles/sounds/637206/) | kyles | CC0 1.0 |
| `hull_slap.ogg` | 5 段水拍击船体的声音 | [boat knocks fiberglass water laps on hull.flac](https://freesound.org/people/kyles/sounds/637206/) | kyles | CC0 1.0 |
| `boat_rush.ogg` | 船首波浪／水流掠过船体的声音；循环播放 | [Sailing boat, bow wave (close perspective)](https://freesound.org/people/Pfannkuchn/sounds/360631/) | Pfannkuchn | CC0 1.0 |
| `step_sand.ogg` | 5 段踩踏松软干沙的脚步声（拟音，无海浪声） | [Soft sand steps.wav](https://freesound.org/people/200221-WeanBekker/sounds/543714/) | 200221-WeanBekker | CC0 1.0 |
| `step_wetsand.ogg` | 5 段踩踏粗颗粒湿沙的脚步声（近距离） | [footsteps in wet coarse sand.wav](https://freesound.org/people/bruno.auzet/sounds/539175/) | bruno.auzet | CC0 1.0 |
| `step_wood.ogg` | 5 段踩踏空心木板的脚步声 | [Footsteps on hollow wood](https://freesound.org/people/florianreichelt/sounds/459970/) | florianreichelt | CC0 1.0 |
| `step_water.ogg` | 5 段涉水脚步声（选取起音最慢的片段） | [Footsteps_Walk.wav](https://freesound.org/people/Nox_Sound/sounds/490951/), [Wading in Shallow Water.wav](https://freesound.org/people/ryansitz/sounds/342932/) | Nox_Sound, ryansitz | CC0 1.0, CC0 1.0 |
| `step_grass.ogg` | 5 段草地脚步声 | [Footsteps_Grass_1.wav](https://freesound.org/people/SilentStrikeZ/sounds/389625/) | SilentStrikeZ | CC0 1.0 |
| `step_rock.ogg` | 5 段石地脚步声 | [Footsteps - Stone, Rock, Concrete, Cement](https://freesound.org/people/SecureSubset/sounds/813622/) | SecureSubset | CC0 1.0 |
| `swim.ogg` | 4 段水面游泳划水声 | [POOL SWIMMING R-L](https://freesound.org/people/tbsounddesigns/sounds/530158/) | tbsounddesigns | CC0 1.0 |
| `uw_swim.ogg` | 4 段水下手臂动作声（水听器录音） | [Underwater recording of aquatic movement, bubbles and drops.](https://freesound.org/people/felix.blume/sounds/384218/) | felix.blume | CC0 1.0 |
| `submerge.ogg` | 2 段短促的水下水流声（水听器录音） | [Underwater recording of aquatic movement, bubbles and drops.](https://freesound.org/people/felix.blume/sounds/384218/) | felix.blume | CC0 1.0 |
| `emerge.ogg` | 水面恢复平静及滴水声（短片段） | [Water Splash](https://freesound.org/people/felix.blume/sounds/434978/) | felix.blume | CC0 1.0 |
| `splash.ogg` | 4 段身体入水的水花声 | [SPLASH (by blaukreuz)](https://freesound.org/people/qubodup/sounds/212143/), [Foley_Natural_Water_Jump_Mono.wav](https://freesound.org/people/Nox_Sound/sounds/585744/) | qubodup, Nox_Sound | CC0 1.0, CC0 1.0 |
| `gull.ogg` | 6 段海鸥叫声 | [Seagull on beach](https://freesound.org/people/squashy555/sounds/353416/), [Seagulls / gaviotas clean wildtrack.WAV](https://freesound.org/people/Soojay/sounds/462462/) | squashy555, Soojay | CC0 1.0, CC0 1.0 |
| `bird_forest.ogg` | 13 段鸣禽叫声／短鸣唱（1.1 kHz 高通滤波）；模拟鸟停在树上分段鸣叫 | [Birds in Rainforest - Volcanoes National Park (Hawaii) 2](https://freesound.org/people/coalcon/sounds/636071/), [Birds in Rainforest - Volcanoes National Park (Hawaii) 1](https://freesound.org/people/coalcon/sounds/636072/), [Tropical Birds.wav](https://freesound.org/people/dubminister/sounds/214676/) | coalcon, coalcon, dubminister | CC0 1.0, CC0 1.0, CC0 1.0 |
| `bird_dove.ogg` | 5 段鸽子的咕咕叫声 | [mourning_dove _2017-06-06.wav](https://freesound.org/people/nathankwright/sounds/456930/) | nathankwright | CC0 1.0 |
| `birds_dawn.ogg` | 清晨鸟鸣合唱（夏威夷 Waikoloa 的早晨）；循环播放 | [Birds at Dusk on Hawaii.wav](https://freesound.org/people/SorenF109/sounds/678859/) | SorenF109 | CC0 1.0 |
| `tern.ogg` | 6 段普通燕鸥叫声（2 kHz 高通滤波） | [LAC_DES_CHANTERAINES_Sternespierregarin_m32bitsfloat_192kHz.wav](https://freesound.org/people/LaScienceMusicale/sounds/648386/) | LaScienceMusicale | CC0 1.0 |
| `whale_song.ogg` | 潜水时在法属波利尼西亚录得的座头鲸歌声；经 2.6 kHz 低通滤波，以削弱潜水员呼吸调节器的嘶声；循环播放 | [Diving with whales.wav](https://freesound.org/people/KEVOY/sounds/82325/) | KEVOY | CC0 1.0 |
| `whale_blow.ogg` | 3 段鲸类呼吸声（用力呼气和吸气）；降调后用作座头鲸喷气声 | [ORCA.wav](https://freesound.org/people/mikewest/sounds/198937/) | mikewest | CC0 1.0 |
| `big_splash.ogg` | 2 段大型水花声（座头鲸跃出、重新入水或扬尾时使用，并降低音调） | [Big Water Splash](https://freesound.org/people/qubodup/sounds/442773/), [Large Splash](https://freesound.org/people/roboroo/sounds/436792/) | qubodup, roboroo | CC0 1.0, CC0 1.0 |
| `reel_wind.ogg` | 匀速摇动纺车轮的声音（齿轮滴答声）；循环播放，播放速度随摇柄变化 | [Spinning reel.wav](https://freesound.org/people/tosha73/sounds/509902/) | tosha73 | CC0 1.0 |
| `reel_drag.ogg` | 鱼拉出鱼线时渔轮泄力棘轮的尖锐声；循环播放 | [Angel Fly Fish Reel Fast Pull_1.wav](https://freesound.org/people/paulprit/sounds/507070/) | paulprit | CC0 1.0 |
| `line_strain.ogg` | 尼龙线受力时的声音（接近断裂时的吱嘎声）；循环播放 | [nylon rope string fishing line handling tying tie tense friction](https://freesound.org/people/kyles/sounds/450849/) | kyles | CC0 1.0 |
| `rod_swish.ogg` | 5 段钓竿挥动声（抛竿） | [Fishing Rod Swish Swoosh.wav](https://freesound.org/people/Mrthenoronha/sounds/371313/), [Fishing Rod Cast - Swoosh](https://freesound.org/people/mwchristian95/sounds/725426/) | Mrthenoronha, mwchristian95 | CC0 1.0, CC0 1.0 |
| `bail_click.ogg` | 4 段轻微的弹簧金属咔嗒声（挡线环打开／扣合） | [Foley_TapeMeasure_ClickLock.wav](https://freesound.org/people/MrFossy/sounds/523282/) | MrFossy | CC0 1.0 |
| `line_out.ogg` | 抛竿时鱼线从渔轮放出的声音 | [fishingreel_throw.wav](https://freesound.org/people/BranndyBottle/sounds/464697/) | BranndyBottle | CC0 1.0 |
| `plop.ogg` | 2 段浮漂／铅坠落水声 | [Fishing Lure-Sinker Hitting water](https://freesound.org/people/JoelMcDaniel/sounds/849752/), [fishingreel_throw.wav](https://freesound.org/people/BranndyBottle/sounds/464697/) | JoelMcDaniel, BranndyBottle | CC0 1.0, CC0 1.0 |
| `line_snap.ogg` | 4 段弦线受力断裂声，用作鱼线断裂音效 | [Guitar string snap or breaks - various sounds](https://freesound.org/people/khenshom/sounds/537084/) | khenshom | CC0 1.0 |
| `fish_splash.ogg` | 5 段鱼在水面溅水和挣扎的声音 | [Fish Splashing Release 1.wav](https://freesound.org/people/paulprit/sounds/507094/), [Fish Splashing Release 2.wav](https://freesound.org/people/paulprit/sounds/507093/) | paulprit | CC0 1.0 |
| `fish_flop.ogg` | 上岸的鱼拍打和扑腾的声音 | [FishFlappingTail.wav](https://freesound.org/people/ramattahatta/sounds/649003/), [Fish Flopping.wav](https://freesound.org/people/RatBird/sounds/570208/) | ramattahatta, RatBird | CC0 1.0, CC0 1.0 |
| `coins.ogg` | 硬币落入碗中的声音，用于卖鱼 | [coins - in paper bowl 05.wav](https://freesound.org/people/Anthousai/sounds/336585/) | Anthousai | CC0 1.0 |

说明：`under_reef.ogg` 使用了 630436 试听音频开头约 200 秒的内容，并对其中约 1.7 kHz 的狭窄音调做了陷波处理。

说明：`splash.ogg` 的第 1 个片段是 qubodup 对 blaukreuz 的“130723_Brela_HarborJump_F_4824.wav”所做的清理版本（同样采用 CC0）。

说明：`big_splash.ogg` 的第 1 个片段是 qubodup 混合的 CC0 音效，包含 wormer2 的 415669／415670、roboroo 的 436792 等素材，均为 CC0。

钓鱼音效可使用 `tools/audio/` 重新构建（参见该目录的 README）。
