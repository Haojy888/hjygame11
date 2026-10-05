"""Compress the generated caudal sheets into one thin fin after prepare-fish.py."""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend', type=Path, required=True)
parser.add_argument('--out-glb', type=Path, required=True)
opt = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
blend, glb = opt.blend.resolve(), opt.out_glb.resolve()
if not blend.is_file():
    raise FileNotFoundError(blend)
bpy.ops.wm.open_mainfile(filepath=str(blend))
fish = bpy.data.objects['barracuda']
assert not fish.get('tail_thinned'), 'Prepare the fish from the cleaned source before thinning'
assert sum(len(p.vertices) - 2 for p in fish.data.polygons) == 14000, 'Unexpected barracuda base mesh'
normals = [corner.vector.copy() for corner in fish.data.corner_normals]
transforms = []
for vertex in fish.data.vertices:
    x, y, z = vertex.co
    t = max(0., min(1., (-z - .29) / .095))
    smooth = t*t*(3 - 2*t)
    scale = 1 - .97*smooth
    derivative = .97*6*t*(1 - t)/.095 if 0 < t < 1 else 0
    transforms.append((scale, derivative, x))
    vertex.co.x *= scale
fish.data.update()
# Apply the deformation's inverse transpose to normals, preserving the source UV seams.
for index, loop in enumerate(fish.data.loops):
    scale, derivative, x = transforms[loop.vertex_index]
    normal = normals[index]
    normals[index] = Vector((normal.x/scale, normal.y,
                             normal.z - normal.x*x*derivative/scale)).normalized()
fish.data.normals_split_custom_set(normals)
fish['tail_thinned'] = True
bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
fish.select_set(True)
fish.parent.select_set(True)
bpy.context.view_layer.objects.active = fish.parent
glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                         export_image_format='AUTO', export_materials='EXPORT', export_normals=True,
                         export_texcoords=True, export_skins=True, export_animations=True,
                         export_force_sampling=True, export_frame_range=True, export_yup=False,
                         export_draco_mesh_compression_enable=False)
print('TAIL_THINNED', json.dumps({'triangles': sum(len(p.vertices) - 2 for p in fish.data.polygons)}))
