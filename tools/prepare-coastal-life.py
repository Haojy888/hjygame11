"""Inspect and bake Lux3D coastal animals for the existing static PBR loader.

blender -b --factory-startup --python-exit-code 1 --python tools/prepare-coastal-life.py --
  --id dolphin --source SOURCE.glb --work WORK --inspect
Then supply --forward and --up from the inspection, plus --game DIR --blend FILE.
The game frame is +Z nose, +Y dorsal/up. Original source files stay untouched.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

spec = importlib.util.spec_from_file_location('fish_preparation', Path(__file__).with_name('prepare-fish.py'))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True, choices=['dolphin', 'moray', 'seahorse'])
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--forward')
    parser.add_argument('--up')
    parser.add_argument('--game', type=Path)
    parser.add_argument('--blend', type=Path)
    parser.add_argument('--task-id')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.source, args.work = args.source.resolve(), args.work.resolve()
    args.work.mkdir(parents=True, exist_ok=True)
    if args.inspect:
        helpers.inspect_source(args.source, args.id, args.work)
        return
    assert args.forward and args.up and args.game and args.blend
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert objects
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    assert obj.data.uv_layers.active
    forward, up = helpers.direction(args.forward), helpers.direction(args.up)
    up = (up - forward * up.dot(forward)).normalized()
    right = up.cross(forward).normalized()
    # Blender -Y exports to game +Z, Blender +Z exports to game +Y.
    rotation = Matrix((right, -forward, up)).to_4x4()
    obj.data.transform(rotation)
    original_triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    budget = {'dolphin': 12000, 'moray': 8000, 'seahorse': 10000}[args.id]
    if original_triangles > budget:
        modifier = obj.modifiers.new('Runtime triangle budget', 'DECIMATE')
        modifier.ratio = (budget - 20) / original_triangles
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Explicit triangles', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    low, high = helpers.bounds([obj])
    height = high.z - low.z
    assert height > 0.00001
    center = (low + high) / 2
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - Vector((center.x, center.y, low.z))) / height
    obj.data.validate(clean_customdata=True)
    obj.data.update()
    materials = {obj.data.materials[p.material_index] for p in obj.data.polygons}
    assert len(materials) == 1, 'Expected one prepared material'
    material = next(iter(materials))
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    for name, value in [('Metallic', 0), ('Alpha', 1)]:
        for link in list(bsdf.inputs[name].links):
            material.node_tree.links.remove(link)
        bsdf.inputs[name].default_value = value
    textures = []
    images = sorted({node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}, key=lambda i: i.name)
    for index, image in enumerate(images):
        image.pixels[0]
        size = list(image.size)
        if max(size) > 1024:
            factor = 1024 / max(size)
            image.scale(round(size[0] * factor), round(size[1] * factor))
        color_space = image.colorspace_settings.name
        image.filepath_raw = str(args.work / f'{args.id}-{index}.png')
        image.file_format = 'PNG'
        image.save()
        if image.packed_file:
            image.unpack(method='REMOVE')
        image.reload()
        image.colorspace_settings.name = color_space
        image.pack()
        assert max(image.size) <= 1024
        textures.append({'source': size, 'size': list(image.size), 'colorSpace': color_space})
    obj.name = args.id + ' | Lux3D'
    obj['Lux3DTask'] = args.task_id or ''
    obj['Preparation'] = 'One static PBR mesh; +Z nose/+Y up; one-unit height; embedded 1024 PNGs; original source retained'
    args.blend = args.blend.resolve()
    args.blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))
    args.game = args.game.resolve()
    args.game.mkdir(parents=True, exist_ok=True)
    destination = args.game / f'{args.id}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_animations=False, export_morph=False, export_yup=True, export_image_format='AUTO', export_cameras=False, export_lights=False)
    raw = destination.read_bytes()
    import struct
    json_length = struct.unpack_from('<I', raw, 12)[0]
    wire = json.loads(raw[20:20 + json_length])
    assert len(wire['nodes']) == len(wire['meshes']) == len(wire['meshes'][0]['primitives']) == 1
    low, high = helpers.bounds([obj])
    triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    assert triangles <= budget and len(raw) < 5 * 1024 * 1024
    report = {'id': args.id, 'source': str(args.source), 'sourceTriangles': original_triangles, 'triangles': triangles,
        'bytes': len(raw), 'gameSizeXYZ': [high.x - low.x, high.z - low.z, high.y - low.y], 'textures': textures,
        'output': str(destination), 'blend': str(args.blend), 'taskId': args.task_id, 'forward': list(forward), 'up': list(up)}
    (args.work / f'{args.id}-prepared.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    helpers.render_views([obj], args.work / f'{args.id}-prepared-views')
    print('COASTAL_PREPARED', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
