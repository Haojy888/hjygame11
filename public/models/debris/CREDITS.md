# 沙滩杂物模型：致谢与许可

所有扫描的杂物素材均来自 [Poly Haven](https://polyhaven.com)，采用 **CC0 1.0（公共领域）** 许可。CC0 不要求署名，此处仍列出来源，便于追溯。

| 文件 | Poly Haven 素材 | 许可 | 处理方式 |
|---|---|---|---|
| `dead_quiver_trunk.glb`, `dead_quiver_trunk_{albedo,normal,arm}.jpg` | [Dead Quiver Trunk](https://polyhaven.com/a/dead_quiver_trunk) | CC0 | 使用 Blender 5.2 合并网格、将长轴转向 +X 并居中，再简化为 4,000／700／160 个三角形的细节层级（原模型约 18,000 个）；1K 纹理未修改 |
| `dead_quiver_branch_01.glb`, `dead_quiver_branch_01_{albedo,normal,arm}.jpg` | [Dead Quiver Branch 01](https://polyhaven.com/a/dead_quiver_branch_01) | CC0 | 细节层级为 2,600／500／120 个三角形（原模型约 15,000 个） |
| `dead_quiver_branch_02.glb`, `dead_quiver_branch_02_{albedo,normal,arm}.jpg` | [Dead Quiver Branch 02](https://polyhaven.com/a/dead_quiver_branch_02) | CC0 | 细节层级为 2,600／500／120 个三角形（原模型约 14,000 个） |
| `lambis_shell.glb`, `lambis_shell_{albedo,normal,arm}.jpg` | [Lambis Shell](https://polyhaven.com/a/lambis_shell) | CC0 | 细节层级为 1,400／300／80 个三角形（原模型约 12,500 个） |

纹理为 1024 × 1024 JPEG，包含反照率（sRGB）、OpenGL 切线空间法线和 ARM 贴图（R 通道为环境光遮蔽、G 为粗糙度、B 为金属度）。GLB 文件仅包含几何体（网格名为 `LOD0`、`LOD1`、`LOD2`）。

`src/world/debris/ScannedDebris.js` 会加载这些纹理，并将它们打包为 2 × 2 纹理图集。