"""Bridge the source hogfish's missing middle dorsal filament after prepare-fish.py."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend', type=Path, required=True)
parser.add_argument('--out-glb', type=Path, required=True)
opt = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
blend = opt.blend.resolve()
glb = opt.out_glb.resolve()
if not blend.is_file():
    raise FileNotFoundError(blend)
bpy.ops.wm.open_mainfile(filepath=str(blend))
fish = bpy.data.objects['wrasse']
assert not fish.get('middle_dorsal_bridge_added'), 'Run prepare-fish.py before applying this repair again'
assert sum(len(p.vertices) - 2 for p in fish.data.polygons) == 13999, 'Unexpected wrasse base mesh'

# Sample the existing detached filament; retain its original material and atlas.
target = Vector((.001, .286, -.04))
uv = fish.data.uv_layers.active.data
near = min((loop for loop in fish.data.loops if fish.data.vertices[loop.vertex_index].co.y > .28),
           key=lambda loop: (fish.data.vertices[loop.vertex_index].co - target).length_squared)
sample = uv[near.index].uv.copy()
control = [Vector(p) for p in ((.001, .08, .15), (.001, .245, .12),
                              (.001, .27, .025), (.001, .287, -.042))]
verts, faces = [], []
rings, sides = 24, 8
for ring in range(rings):
    t = ring / (rings - 1)
    s = 1 - t
    p = control[0] * s**3 + control[1] * 3*s*s*t + control[2] * 3*s*t*t + control[3] * t**3
    tangent = (3*s*s*(control[1] - control[0]) + 6*s*t*(control[2] - control[1])
               + 3*t*t*(control[3] - control[2])).normalized()
    normal = Vector((1, 0, 0))
    bitangent = tangent.cross(normal).normalized()
    radius = .005 * (1 - t) + .0019 * t
    for side in range(sides):
        angle = side * math.tau / sides
        verts.append(p + radius * (normal * math.cos(angle) + bitangent * math.sin(angle)))
    if ring:
        for side in range(sides):
            a = (ring - 1) * sides + side
            b = (ring - 1) * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
faces.extend((tuple(reversed(range(sides))), tuple((rings - 1) * sides + j for j in range(sides))))
mesh = bpy.data.meshes.new('middle_dorsal_bridge')
mesh.from_pydata(verts, [], faces)
mesh.materials.append(fish.data.materials[0])
mesh.update()
layer = mesh.uv_layers.new(name='UVMap')
for loop in layer.data:
    loop.uv = sample
for polygon in mesh.polygons:
    polygon.use_smooth = True
bridge = bpy.data.objects.new('middle_dorsal_bridge', mesh)
bpy.context.scene.collection.objects.link(bridge)
bridge.vertex_groups.new(name='root').add(list(range(len(verts))), 1., 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
fish.select_set(True)
bridge.select_set(True)
bpy.context.view_layer.objects.active = fish
bpy.ops.object.join()
fish['middle_dorsal_bridge_added'] = True
bpy.context.scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
fish.select_set(True)
rig = fish.parent
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                         export_image_format='AUTO', export_materials='EXPORT', export_normals=True,
                         export_texcoords=True, export_skins=True, export_animations=True,
                         export_force_sampling=True, export_frame_range=True, export_yup=False,
                         export_draco_mesh_compression_enable=False)
print('FILAMENT_REPAIR', json.dumps({'triangles': sum(len(p.vertices) - 2 for p in fish.data.polygons),
                                   'sampleUv': list(sample), 'bridgeVertices': len(verts)}))
