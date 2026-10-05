"""Repair the unpainted body patch in the batch-3 queen angelfish atlas.

Run after prepare-fish.py, using Blender's background Python:
  --blend angel.blend --out-glb angel.glb [--out-blend repaired.blend]
The repair is specific to the 13,999-triangle export of Lux3D task 3942896.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend', type=Path, required=True)
parser.add_argument('--out-glb', type=Path, required=True)
parser.add_argument('--out-blend', type=Path)
opt = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
opt.blend = opt.blend.resolve()
opt.out_glb = opt.out_glb.resolve()
opt.out_blend = (opt.out_blend or opt.blend).resolve()
bpy.ops.wm.open_mainfile(filepath=str(opt.blend))
fish = bpy.data.objects.get('angel')
if fish is None or fish.type != 'MESH' or fish.parent is None:
    raise ValueError('Expected the prepared queen angelfish mesh and rig')
mesh = fish.data
if len(mesh.polygons) != 13999 or not mesh.uv_layers.active:
    raise ValueError('This patch requires the inspected 13,999-triangle angel export')

# Rays through the gray patch in the actual game portrait identified these
# body faces. The protruding yellow pectoral itself needs no geometry changes.
visible_faces = {10258, 10256, 8723, 8658, 10259, 8728, 8656, 8655,
                 8654, 10260, 8651, 8477, 8661, 10238, 8664}
centers = [mesh.polygons[i].center.copy() for i in visible_faces]
if not all(.08 < p.x < .13 and -.15 < p.y < .06 and .05 < p.z < .17 for p in centers):
    raise ValueError('Unexpected source topology: the inspected body faces moved')
uv = mesh.uv_layers.active.data
changed = 0
for polygon in mesh.polygons:
    x, y, z = polygon.center
    mirrored = Vector((-x, y, z))
    opposite_patch = (x < 0 and abs(polygon.normal.x) > .8
                      and min((mirrored - center).length for center in centers) < .025)
    if polygon.index not in visible_faces and not opposite_patch:
        continue
    for loop_index in polygon.loop_indices:
        point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
        # Sample one continuous patch of intact scales in the original atlas.
        # Sampling unrelated UV islands per vertex would fold the texture.
        uv[loop_index].uv = (.35 + (point.z - .115) * .55,
                             .687 + (point.y + .025) * .45)
    changed += 1
if changed != 76:
    raise ValueError(f'Unexpected repaired face count: {changed}')
mesh.update()
bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
opt.out_blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(opt.out_blend))
bpy.ops.object.select_all(action='DESELECT')
fish.select_set(True)
fish.parent.select_set(True)
bpy.context.view_layer.objects.active = fish.parent
opt.out_glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(opt.out_glb), export_format='GLB', use_selection=True,
    export_image_format='AUTO', export_materials='EXPORT', export_normals=True,
    export_texcoords=True, export_skins=True, export_animations=True,
    export_force_sampling=True, export_frame_range=True, export_yup=False,
    export_draco_mesh_compression_enable=False)
print('ANGEL_UV_REPAIRED', json.dumps({'changedFaces': changed, 'glb': str(opt.out_glb)}))
