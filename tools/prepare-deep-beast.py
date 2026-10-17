"""Preserve Lux3D UVs/materials, attach original vertex IDs and editable idle shapes.

Blender --background --python-exit-code 1 --python tools/prepare-deep-beast.py --
  <Lux3D.glb> <original mesh.json> <output directory>
The runtime export is static; the game restores terrain conformity and GPU animation
from _SOURCE IDs. The .blend retains packed textures and a morph animation preview.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

source, original, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
output.mkdir(parents=True, exist_ok=True)
data = json.loads(original.read_text(encoding='utf-8'))
positions = list(zip(*(iter(data['position']),) * 3))

def xyz(p):
    return (p[0], -p[2], p[1])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(objects) == 1, 'Material transfer must preserve the single octopus mesh'
obj = objects[0]
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh = obj.data
mesh.calc_loop_triangles()
assert len(mesh.loop_triangles) == len(data['indices']) // 3
tree = KDTree(len(positions))
for index, point in enumerate(positions):
    tree.insert(xyz(point), index)
tree.balance()
indices, distances = [], []
for vertex in mesh.vertices:
    _, index, distance = tree.find(vertex.co)
    indices.append(index)
    distances.append(distance)
assert max(distances) < 0.001, f'Material transfer moved geometry: {max(distances)} metres'
arm_ids = {math.floor(data['aux'][i * 4 + 3]) for i in indices if data['aux'][i * 4 + 3] >= 1}
assert arm_ids == set(range(1, 9))
attr = mesh.attributes.new(name='_SOURCE', type='FLOAT', domain='POINT')
attr.data.foreach_set('value', indices)
for poly in mesh.polygons:
    poly.use_smooth = True
obj.name = '沉睡古神 · Lux3D 写实材质'
obj['provenance'] = 'Original procedural mesh + Lux3D material-transfer task 4163910'
obj['anatomy'] = 'Eight arms, 256 suckers; _SOURCE maps to original terrain-aware geometry and GPU arm weights'
images = []
base_images = {link.from_node.image for mat in mesh.materials if mat.use_nodes
               for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'
               for link in node.inputs['Base Color'].links if link.from_node.type == 'TEX_IMAGE'}
for image in bpy.data.images:
    if image.type != 'IMAGE':
        continue
    before = list(image.size)
    limit = 1536 if image in base_images else 1024
    if max(before) > limit:
        scale = limit / max(before)
        image.scale(round(before[0] * scale), round(before[1] * scale))
    image.pack()
    images.append({'name': image.name, 'originalSize': before, 'size': list(image.size)})

for other in bpy.context.selected_objects:
    other.select_set(False)
obj.select_set(True)
game_glb = output / 'abyssal-elder-lux3d.glb'
bpy.ops.export_scene.gltf(filepath=str(game_glb.resolve()), export_format='GLB', use_selection=True,
                         export_attributes=True, export_animations=False, export_morph=False,
                         export_yup=True, export_image_format='AUTO')

def pose(p, arm, time):
    x, y, z = p
    if arm < 1:
        breath = 1 + 0.008 * math.sin(time * 0.48)
        return xyz((x * breath, y * breath + 0.28, z * breath))
    index = math.floor(arm) - 1
    t = (arm % 1) / 0.9
    angle, weight = index * math.pi / 4 + math.pi / 8, t * t
    wave = math.sin(time * 0.65 - t * 5 + index * 1.7)
    return xyz((x + math.cos(angle) * wave * 0.65 * weight,
                y + (math.sin(time * 0.48 - t * 4 + index) * 0.35 + 0.65) * weight * weight,
                z - math.sin(angle) * wave * 0.65 * weight))

obj.shape_key_add(name='Basis')
keys = []
for sample in range(8):
    key = obj.shape_key_add(name=f'Idle wave {sample + 1}')
    key.data.foreach_set('co', [v for i in indices for v in pose(positions[i], data['aux'][i * 4 + 3], sample * 2.5)])
    keys.append(key)
for frame in range(9):
    for index, key in enumerate(keys):
        key.value = 1 if index == frame % 8 else 0
        key.keyframe_insert(data_path='value', frame=1 + frame * 30)
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 241, 30
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str((output / 'abyssal-elder-lux3d.blend').resolve()), compress=True)
receipt = {'sourceTaskId': '4163910', 'triangles': len(mesh.loop_triangles),
           'vertices': len(mesh.vertices), 'maxTransferDistance': max(distances),
           'arms': sorted(arm_ids), 'images': images, 'gameBytes': game_glb.stat().st_size}
(output / 'blender-preparation.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=True))
