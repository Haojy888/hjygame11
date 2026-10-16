"""Blender --background --python tools/deep-beast-blender.py -- <mesh.json> <output-directory>.

Creates an editable, colored .blend and a GLB with a looping morph preview.
The game uses the source JS mesh and GPU animation directly, without downloading these files.
"""
import bpy
import json
import math
import sys
from pathlib import Path

source, target = sys.argv[sys.argv.index('--') + 1:]
data = json.loads(Path(source).read_text(encoding='utf-8'))
out = Path(target).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def xyz(p):
    return (p[0], -p[2], p[1])  # game Y-up -> Blender Z-up; GLB exporter restores Y-up

rest = list(zip(*(iter(data['position']),) * 3))
indices = list(zip(*(iter(data['indices']),) * 3))
mesh = bpy.data.meshes.new('Original eight-arm elder mesh')
mesh.from_pydata([xyz(p) for p in rest], [], indices)
mesh.update()
obj = bpy.data.objects.new('沉睡古神 · 八臂深渊巨章', mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
colors.data.foreach_set('color', [c for i in range(len(rest)) for c in (*data['color'][i * 3:i * 3 + 3], 1)])
mesh.color_attributes.active_color = colors
arm_attribute = mesh.attributes.new(name='arm_and_weight', type='FLOAT', domain='POINT')
arm_attribute.data.foreach_set('value', data['aux'][3::4])

for part, name in enumerate(['Mottled wet skin', 'Double-row suckers', 'Luminous iris', 'Horizontal pupil', 'Ancient luminous scars']):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.62 if part < 2 else 0.25
    if part in (2, 4):
        bsdf.inputs['Emission Color'].default_value = (0.07, 0.30, 0.13, 1) if part == 2 else (0.02, 0.25, 0.18, 1)
        bsdf.inputs['Emission Strength'].default_value = 0.9
    if part < 2:
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 12
        noise.inputs['Detail'].default_value = 3
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.25
        bump.inputs['Distance'].default_value = 0.04
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    obj.data.materials.append(mat)
for poly in mesh.polygons:
    poly.use_smooth = True
    poly.material_index = round(data['aux'][poly.vertices[0] * 4 + 2])

def pose(p, arm, time):
    x, y, z = p
    if arm < 1:
        breath = 1 + 0.008 * math.sin(time * 0.48)
        return xyz((x * breath, y * breath + 0.28, z * breath))
    index = math.floor(arm) - 1
    t = (arm % 1) / 0.9
    a = index * math.pi / 4 + math.pi / 8
    weight = t * t
    wave = math.sin(time * 0.65 - t * 5 + index * 1.7)
    return xyz((x + math.cos(a) * wave * 0.65 * weight,
                y + (math.sin(time * 0.48 - t * 4 + index) * 0.35 + 0.65) * weight * weight,
                z - math.sin(a) * wave * 0.65 * weight))

obj.shape_key_add(name='Basis')
keys = []
for sample in range(8):
    key = obj.shape_key_add(name=f'Idle wave {sample + 1}')
    key.data.foreach_set('co', [v for i, p in enumerate(rest) for v in pose(p, data['aux'][i * 4 + 3], sample * 2.5)])
    keys.append(key)
for frame in range(9):
    for index, key in enumerate(keys):
        key.value = 1 if index == frame % 8 else 0
        key.keyframe_insert(data_path='value', frame=1 + frame * 30)
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 241, 30
scene.frame_set(1)
obj['source'] = 'src/world/DeepBeast.js — original procedural model, no third-party mesh'
obj['anatomy'] = '8 independently weighted arms; 256 dual-row hollow suckers'
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'abyssal-elder.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(out / 'abyssal-elder.glb'), export_format='GLB', use_selection=True,
                          export_materials='EXPORT', export_animations=True, export_yup=True)
print(json.dumps({'blend': str(out / 'abyssal-elder.blend'), 'glb': str(out / 'abyssal-elder.glb'),
                  'vertices': len(mesh.vertices), 'triangles': len(mesh.polygons)}))
