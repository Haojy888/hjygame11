# Lighthouse

`lighthouse.glb` is the fitted exterior from Aholo Lux3D task `4229108`.
The unmodified generated source and packed Blender project are retained in the
task's separate delivery directory. `tools/prepare-lighthouse.py` records the
source-specific measurements, UV-preserving clearance cuts and texture packing.

The game reuses its exact dock, ladder, stairs, inner walls, walking surfaces,
live lamp and persistent repair interaction. The generated exterior is hollowed
around the existing staircase; its gallery floor is seated under the exact floor,
and the thicker gallery rail uses matching collision volumes.

The prepared model has 19,789 triangles, embedded 1024px PBR PNGs and a height of
approximately 19.7 metres. It is loaded through `AbyssAssets`, normalized to unit
height by that loader, and placed at the lighthouse's existing base elevation.
Failed downloads keep the local facade. Successful loading fades the generated
exterior in while preserving the interior walls and all gameplay progress.
