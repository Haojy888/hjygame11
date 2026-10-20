# Coastal animals

Three generated PBR sources from Aholo Lux3D, prepared with `tools/prepare-coastal-life.py`.
Original GLBs and packed editable Blender projects stay in the task's delivery directory.

| Model | Provider task | Runtime triangles | Runtime dimensions |
| --- | --- | --- | --- |
| Bottlenose dolphin | 4230352 | 11,980 | 2.8m long |
| Moray | 4230354 | 7,980 | 2.4m long |
| Seahorse | 4230356 | 9,979 | 0.8m tall in the existing observation garden |

Each file has one static mesh/material and embedded 1024px PBR PNGs. Geometry is
centered on X/Z, bottom-origin, unit height, with +Z forward and +Y up. Source
orientation and runtime scales were inspected rather than inferred from filenames.

`CoastalLife` reuses the shared static loader and textures, with individual render
objects retaining movement history. Models load serially on approach and fade in
over 1.2 seconds; distance transitions also fade into the simpler animals. A failed
load is deduplicated and keeps the local animal. Dolphin tail movement is vertical;
the eel has animated breathing/jaw response to the flashlight. Rounded eel collision
segments follow its curved source body, and seahorse solids follow their sway.
