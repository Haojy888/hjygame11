# Tidewater 从 three.js／TSL 移植到原生 WebGPU＋WGSL（历史开发记录）

以下记录对应原项目的 `webgpu-native` 分支。目标是让 `src/` 中不再导入 `three`，同时保持与 `main` 分支相同的画面和行为。

three.js 版本（位于 `main` 和 `../threejs-water-claude`）是移植参考：移植前先阅读原文件，保留其结构、名称、常量和注释，并忠实地把 TSL 转换为 WGSL。不要直接删减效果；无法逐项对应移植的部分，应在文件中说明原因。

## 引擎（src/engine）

CPU 侧兼容 three.js。可以暂时使用 `import * as THREE from '../engine/index.js'`，但优先使用具名导入。所需模块包括：数学类（Vector2/3/4、Matrix3/4、Quaternion、Euler、Color、Box3、Sphere、Plane、Frustum、Ray、Spherical、MathUtils、CatmullRomCurve3、ShapeUtils、Timer、DataUtils）；场景类（Object3D、Group、Scene、Mesh、InstancedMesh、PerspectiveCamera、OrthographicCamera、Layers）；几何体（BufferGeometry、所有属性类、Plane/Box/Sphere/Cylinder/Cone/Circle/Torus/Lathe/Icosahedron/Tube/RoundedBox 几何体，以及 mergeGeometries/mergeVertices）。相机使用反转 Z 的 WebGPU 投影：近处深度为 1，远处为 0。

GPU 侧位于 `src/engine/webgpu.js`：

| three／TSL | 引擎对应实现 |
|---|---|
| `renderer`, `renderer.backend.device` | `GPU` 单例：`GPU.device`、`GPU.queue`、`GPU.getEncoder()`、`GPU.submit()` |
| `uniform( v )`, `uniformArray` | `UniformBlock( 'StructName', { name: [ 'vec3f', value ], arr: [ 'vec4f[8]', [...] ] } )`；`block.fields.name.value` 是兼容 three.js 风格的 `{ value }` 句柄 |
| `G.*` (core/Globals.js) | `render/Frame.js` 中的 `G`，名称相同；WGSL 中使用 `frame.sunDir`、`frame.time` 等 |
| 相机节点（`cameraPosition`、`cameraProjectionMatrix` 等） | `frame.cameraPos`、`frame.view`、`frame.proj`、`frame.viewProj`（带抖动）、`frame.viewProjNoJitter`、`frame.prevViewProjNoJitter`、`frame.invViewProj`、`frame.near`、`frame.far`、`frame.resolution` |
| `instancedArray`, `StorageBufferAttribute` | `StorageBuffer( { count, type: 'vec4f' } )` |
| `DataTexture`, `StorageTexture`, `StorageArrayTexture`, `Data3DTexture`, `RenderTarget` | `Texture( { width, height, depth, dimension, format, mips, usage: [ 'sample', 'storage', 'render', 'copySrc', 'copyDst' ], data } )`、`RenderTarget( w, h, { colors, depth } )` |
| `Fn( … )().compute( n )`, `renderer.compute()` | `ComputeKernel( { modules, bindings, code, workgroupSize } )`、`kernel.dispatch( groups )`（将命令记录到当前帧的编码器） |
| 系统之间共用的 TSL 辅助函数 | `ShaderModule( { name, deps, code, bindings, uniforms } )`（见下文） |
| `NodeMaterial`／`MeshStandardNodeMaterial`／`SceneMaterial`／`MeshBasicNodeMaterial` | `Material( { vertex, surface, output, uniforms, textures, storage, varyings, attributes, … } )`；参见 `render/Material.js` 的文件开头 |
| `positionNode`（局部坐标） | `vertex` 代码段：`v.position`、`v.normal`、`v.worldOffset`，或 `v.useWorld = true; v.worldPos = …` |
| `colorNode`、`roughnessNode`、`normalNode`、`aoNode`、`emissiveNode`、`opacityNode`、`maskNode` | 在 `surface` 代码段中写入 `s.albedo`、`s.roughness`、`s.normal`（世界空间）、`s.ao`、`s.emissive`、`s.alpha`（以及 `alphaTest`） |
| `outputNode`, `mrtNode` | `output` 代码段：`r.color`、`r.velocity`、`r.mask` |
| `material.translucencyNode` | `s.translucency`（vec3，与光照颜色相乘） |
| `SceneLighting.directModulation` 等 | `SceneLighting.set( 'directModulation', module )`，并实现 `fn hookDirectModulation( P, N ) -> vec3f`；见 `render/wgsl/lighting.js` |
| `material.underwaterLighting`、`appliesHillShadow`、`localLightsCheap` | 保留相同的材质选项；钩子将它们作为 `UNDERWATER_LIGHTING`（0/1/2）、`HILL_SHADOW_SELF`、`LOCAL_LIGHTS_CHEAP` 定义读取 |
| `useStaticVelocity( obj )` | `obj.staticVelocity = true`（逐对象设置；上一帧的模型矩阵等于当前矩阵） |
| CSM／`SoftCSMShadowNode` | `SunShadows`（render/Shadows.js）；在 `shadeSurface` 中，接收阴影的对象会自动采样 `sunShadow( P, N, pixel )` |
| 后期处理通道（`rtt`、`pass`、QuadMesh） | `FullscreenPass( { code, bindings, colorFormats } )`，或计算内核 |
| `renderer.render( scene, camera )` 渲染到目标纹理 | `meshRenderer.render( scene, { camera, kind: 'color', colorViews, colorFormats, depthView, … } )` |
| `GLTFLoader`＋`SkinnedMesh`／`AnimationMixer` | `loadGLB( url )`（engine/loaders/GLTF.js）＋`SkinnedModel.create( gltf )`（engine/render/Skinning.js）：`model.group`、`model.play( clip, { fade, loop, speed } )`、`model.update( dt )`；材质顶点钩子负责 GPU 蒙皮（`skinIndex` vec4u 和 `skinWeight` vec4f 属性，关节存储在缓冲区中，并保留上一帧关节数据以计算运动矢量）；阴影也以相同方式蒙皮 |
| 异步回读（`getArrayBufferAsync`） | `Readback`（暂存缓冲区环）；单次回读可用 `readBuffer`／`readTexture` |
| `mx_noise_float`、`mx_fractal_noise_float`、`mx_worley_noise_vec2`、`mx_cell_noise_float`、`hash`、`interleavedGradientNoise`、`vogelDiskSample`、`luminance`、`perturbNormal` | `commonModule`（render/wgsl/common.js）：`mx_noise_float3/2`、`mx_fractal_noise_float3`、`mx_worley_noise_vec2_3/2`、`mx_cell_noise_float3/2`、`hash11/21/31/22/33`、`interleavedGradientNoise`、`vogelDiskSample`、`luminance`、`perturbNormalByHeight`、`perturbNormalByMap`，以及深度辅助函数 `viewDepth`、`worldFromDepth`、`projectToUv` |

绑定组：第 0 组为 `frame` 和共用采样器（`smpLinearRepeat`、`smpLinearClamp`、`smpLinearMirror`、`smpAnisoRepeat`、`smpAnisoClamp`、`smpNearestClamp`、`smpNearestRepeat`、`smpShadow`）；应使用这些采样器，避免为每张纹理分别创建采样器。第 1 组为模块和材质资源（自动组合）。第 2 组为单次绘制资源。

运动矢量约定（`sceneRT.textures[1]`）：xy 为 UV 空间中的位移，即当前帧减去上一帧（UV 的 y 轴向下）。

深度：使用反转 Z 和 `depth32float`，清除值为 0；天空像素的深度也为 0。线性距离通过 `viewDepth( d )` 取得。

## 系统间共用 WGSL：ShaderModule 命名规则

原先某个系统向其他系统提供 TSL 函数时（如 `terrainGPU.heightAt( xz )`、`clouds.shadow( xz )`、`shoreSim.sample( xz )` 等），现在由其实例暴露 `this.module`（一个 `ShaderModule`），WGSL 函数按下表加前缀并命名为 `<prefix><Method>`。结构体使用 `<Prefix><Name>`；绑定和 uniform 块也使用相应前缀，因为同一个着色器中的绑定共用命名空间。如果 TSL 返回对象，WGSL 应返回结构体（`shore.evaluate` → `fn shoreEvaluate( … ) -> ShoreSample`）。在每个文件开头的注释中列出该模块的函数。

| 实例 | 前缀 | 示例 |
|---|---|---|
| TerrainGPU | `terrain` | `terrainHeightAt( xz: vec2f ) -> f32`、`terrainSunShadowAt( P: vec3f ) -> f32`、`terrainNormalAt`、`terrainNormalRock`、`terrainShoreSample`、`terrainUvOf` |
| OceanFFT | `ocean` | 绑定 `oceanDisplacement`、`oceanDerivatives`（texture_2d_array）；uniform 为 `oceanParams` |
| WaterSurface | `waterSurface` | `waterSurfaceCascadeAttenuation( c: i32, depth: f32 ) -> f32`、`waterSurfaceVertex` |
| ShoreWaves | `shore` | `shoreEvaluate`、`shorePhaseAt`、`shoreShape`、`shoreDirAt` 等 |
| ShoreSim | `shoreSim` | `shoreSimSample( xz ) -> vec4f`、`shoreSimInside`、`shoreSimUvOf`、`shoreSimSandFoam` |
| SurfFoam | `surfFoam` | `surfFoamShading` |
| Caustics | `caustics` | `causticsSample` |
| SeaDetail | `seaDetail` | `seaDetailSample` |
| WakeSim | `wake` | `wakeDisplacement` |
| WaterQuery | `waterQuery` | `waterQueryCameraState() -> vec4f`、`waterQueryHeightAt( slot: u32 ) -> f32` |
| Spray | `spray` | `sprayEmit…`（供其他计算内核使用的 GPU 发射器） |
| Atmosphere | `atmosphere` | `atmosphereSkyLuminance`、透射率／天空视图 LUT 绑定 |
| Sky | `sky` | `skyRadianceWithClouds( dir: vec3f, withSun: bool ) -> vec3f`、`skyReflectionRadiance` |
| Clouds | `clouds` | `cloudsShadow( xz: vec2f ) -> f32`、`cloudsSample`、`cloudsSampleView` |
| Underwater | `underwater` |  |
| LocalLights | `localLights` | 安装 `localLights` 钩子 |

如果使用的模块属于尚未完成移植的其他开发任务，仍按上述名称调用，并在测试环境中为其提供桩实现。各类的构造函数签名和公开的 CPU 方法应保持不变，使 `App.js` 只需更改导入即可完成移植。

## WGSL 注意事项

- 导数计算（`dpdx`、未指定 `Level` 的 `textureSample`）只能位于一致的控制流中：应在基于逐像素数据的分支之前计算；分支内部改用 `textureSampleLevel`／`textureSampleGrad`。
- uniform 数组的元素步长需要达到 16 字节：使用 `vec4f[N]`，并通过 `.x` 访问。
- `queue.writeBuffer` 写入的数据会在整帧命令缓冲区执行前生效：若同一帧两次写入同一缓冲区，只会保留最后一次写入的值。需要不同值的每个渲染通道应使用各自的块（例如 `createViewUniforms`）。
- 只有在 `GPU.hasFloat32Filterable` 为真时，`r32float`／`rgba32float` 才可过滤；32 位数据优先使用 `rgba16float` 或 `textureLoad`。
- 存储纹理可使用 `rgba16float`、`rgba32float`、`r32float`、`rgba8unorm`、`r32uint` 等；`rg16float` 存储纹理不属于 WebGPU 核心功能。
- 每种材质采样的纹理尽量少于约 16 张（请求的限制为 32 张，但数量越少性能越好）。

## 测试

无界面的 WebGPU（Dawn）：测试中先导入 `import './headless.mjs'`（参见 `test/engine-smoke.mjs`），再调用 `GPU.init( { headless: true } )`；使用 `writePNG` 写出图像并检查。将测试脚本放在 `test/` 中，并按对应开发任务命名。与 three.js 版本对照：参考应用可以从 `../threejs-water-claude` 以同样方式进行无界面渲染（参见其中的开发记录），也可以直接阅读其着色器。

原项目的开发环境要求：不要在 5188 端口启动开发服务器，也不要修改 `../threejs-water-claude`（当时用户正在运行的应用）。这些路径和端口提醒仅适用于原项目当时的移植工作流。