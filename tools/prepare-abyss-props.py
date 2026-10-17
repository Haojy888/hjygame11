"""Prepare the three Lux3D abyss props; preserve original files and UV textures.

Blender --background --factory-startup --python-exit-code 1 --python
  tools/prepare-abyss-props.py -- --id arch --source SOURCE.glb
  --output ../abyss-scene --game public/models/abyss [--repair-arch]
The repair flag is used only after the source aperture was visually inspected.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True, choices=['vent', 'arch', 'coral'])
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--repair-arch', action='store_true')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def bounds(obj):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (Vector([min(p[i] for p in points) for i in range(3)]),
            Vector([max(p[i] for p in points) for i in range(3)]))


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def normalize(obj):
    low, high = bounds(obj)
    height = high.z - low.z
    assert height > 0.00001, 'Flat source mesh'
    offset = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - offset) / height
    obj.data.update()


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def aperture(obj):
    low, high = bounds(obj)
    width, depth = high.x - low.x, high.y - low.y
    samples = []
    for height in [0.2, 0.4, 0.6]:
        for fraction in [-0.16, 0, 0.16]:
            x = width * fraction
            hit = obj.ray_cast(Vector((x, low.y - depth - 1, height)), Vector((0, 1, 0)), distance=depth * 3 + 2)[0]
            samples.append({'x': x, 'height': height, 'open': not hit})
    return samples


def repair_arch(obj):
    """Cut an elliptical arch passage only when explicitly requested after inspection."""
    low, high = bounds(obj)
    radius = (high.x - low.x) * 0.23
    profile = [(-radius, -0.08), (radius, -0.08), (radius, 0.45)]
    profile += [(math.cos(i * math.pi / 20) * radius, 0.45 + math.sin(i * math.pi / 20) * 0.32) for i in range(1, 21)]
    y0, y1 = low.y - 1, high.y + 1
    count = len(profile)
    vertices = [(x, y, z) for y in [y0, y1] for x, z in profile]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new('Inspected arch passage cutter')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    cutter = bpy.data.objects.new('Passage cutter', mesh)
    bpy.context.collection.objects.link(cutter)
    modifier = obj.modifiers.new('Open inspected swimming passage', 'BOOLEAN')
    modifier.operation, modifier.solver, modifier.object = 'DIFFERENCE', 'EXACT', cutter
    apply_modifier(obj, modifier)
    bpy.data.objects.remove(cutter, do_unlink=True)


def preview(obj, path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(path)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.19, 0.23, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.4
    low, high = bounds(obj)
    span = max(high.x - low.x, high.y - low.y, 1)
    bpy.ops.object.camera_add(location=(span * 1.05, -span * 2.6, 1.3))
    camera = bpy.context.object
    target = Vector((0, 0, 0.48))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', span * 1.5
    scene.camera = camera
    for location, power, color, size in [((2, -3, 4), 320, (0.8, 0.91, 1), 3),
                                         ((-3, -1, 2), 220, (1, 0.78, 0.59), 3),
                                         ((1, 3, 3), 300, (0.54, 0.83, 1), 2)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy, light.data.color, light.data.shape, light.data.size = power, color, 'DISK', size
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=span * 5, location=(0, 0, -0.007))
    ground = bpy.context.object
    ground.name = 'Preview floor (not exported)'
    material = bpy.data.materials.new('Preview floor')
    material.diffuse_color = (0.12, 0.15, 0.17, 1)
    ground.data.materials.append(material)
    bpy.ops.render.render(write_still=True)


def main():
    args = arguments()
    source, output, game = args.source.resolve(), args.output.resolve(), args.game.resolve()
    output.mkdir(parents=True, exist_ok=True)
    game.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert objects, 'Source has no mesh'
    source_meshes = len(objects)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        # Baking the full hierarchy once prevents double transforms in the runtime loader.
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = 'Abyss ' + args.id + ' | Lux3D'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    low, high = bounds(obj)
    original_size = list(high - low)
    # Arch front faces -Y in Blender / +Z in the GLB. Avoid exporting a side-on gateway.
    if args.id == 'arch' and high.y - low.y > high.x - low.x:
        obj.rotation_euler.z = math.pi / 2
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        low, high = bounds(obj)
    normalize(obj)
    assert obj.data.uv_layers.active, 'Source must contain UV0'
    before = triangles(obj)
    if args.id == 'coral':
        # Weld coincident seam vertices before reduction; loop UVs remain separate.
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.validate(clean_customdata=True)
        obj.data.update()
    aperture_before = aperture(obj) if args.id == 'arch' else None
    if args.repair_arch:
        assert args.id == 'arch', 'Repair applies only to the arch'
        repair_arch(obj)
    target = {'vent': 8000, 'arch': 12000, 'coral': 8000}[args.id]
    current = triangles(obj)
    if current > target:
        modifier = obj.modifiers.new('Game mesh triangle budget', 'DECIMATE')
        modifier.ratio = (target - 80) / current
        modifier.use_collapse_triangulate = True
        apply_modifier(obj, modifier)
    apply_modifier(obj, obj.modifiers.new('Explicit game triangles', 'TRIANGULATE'))
    # Decimation can remove an extremal vertex; normalize the final export again.
    normalize(obj)
    if args.id == 'coral':
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        for polygon in obj.data.polygons:
            # Keep the rock base angular and smooth the organic sponge walls.
            polygon.use_smooth = polygon.center.z > 0.22
    used = {poly.material_index for poly in obj.data.polygons}
    materials = {obj.data.materials[index] for index in used}
    assert len(materials) == 1, 'Expected one Lux3D material; inspect before baking an atlas'
    material = next(iter(materials))
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    # Repair stale derived custom data before export rather than letting the exporter do it.
    mesh_repaired = obj.data.validate(clean_customdata=True)
    obj.data.update()
    assert material.use_nodes
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    metallic = bsdf.inputs['Metallic']
    for link in list(metallic.links):
        material.node_tree.links.remove(link)
    metallic.default_value = 0
    bsdf.inputs['Alpha'].default_value = 1
    for link in list(bsdf.inputs['Alpha'].links):
        material.node_tree.links.remove(link)
    material.use_backface_culling = True
    textures = []
    texture_dir = output / 'textures' / args.id
    texture_dir.mkdir(parents=True, exist_ok=True)
    images = {node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    for index, image in enumerate(sorted(images, key=lambda image: image.name)):
        size = list(image.size)
        assert all(size), 'Empty material texture'
        limit = 1024
        if max(size) > limit:
            scale = limit / max(size)
            image.scale(max(1, round(size[0] * scale)), max(1, round(size[1] * scale)))
        colorspace = image.colorspace_settings.name
        image.file_format = 'PNG'
        image.filepath_raw = str(texture_dir / f'{args.id}-{index}.png')
        image.save()
        # Imported GLBs are packed: reload would otherwise restore the original 2K bytes.
        if image.packed_file:
            image.unpack(method='REMOVE')
        image.reload()
        image.colorspace_settings.name = colorspace
        image.pack()
        assert max(image.size) <= limit, 'Texture resize did not survive repacking'
        textures.append({'name': image.name, 'sourceSize': size, 'size': list(image.size), 'colorspace': colorspace})
    obj['provenance'] = 'Lux3D text-to-3d task ' + {'vent': '4168824', 'arch': '4168829', 'coral': '4168834'}[args.id]
    obj['preparation'] = 'UVs and PBR textures preserved; packed PNG; bottom at 0; 1m height; static single material'
    for other in bpy.context.selected_objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    destination = game / f'{args.id}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                             export_animations=False, export_morph=False, export_yup=True,
                             export_image_format='AUTO', export_cameras=False, export_lights=False)
    # Validate the actual wire format, rather than assuming exporter settings were sufficient.
    raw = destination.read_bytes()
    chunk_size, chunk_type = struct.unpack_from('<II', raw, 12)
    assert chunk_type == 0x4e4f534a
    gltf = json.loads(raw[20:20 + chunk_size])
    assert len(gltf['nodes']) == len(gltf['meshes']) == len(gltf['meshes'][0]['primitives']) == 1
    assert all(image.get('mimeType') == 'image/png' and 'bufferView' in image and 'uri' not in image for image in gltf.get('images', []))
    assert not gltf.get('extensionsRequired')
    assert triangles(obj) <= target
    low, high = bounds(obj)
    assert abs(low.z) < 0.00001 and abs(high.z - 1) < 0.00001
    receipt = {'id': args.id, 'sourceTaskId': obj['provenance'].split()[-1], 'sourceMeshes': source_meshes,
               'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceSizeBlenderXYZ': original_size,
               'normalizedSizeGameXYZ': [high.x - low.x, high.z - low.z, high.y - low.y],
               'trianglesBefore': before, 'triangles': triangles(obj), 'vertices': len(obj.data.vertices),
               'coralSeamsWelded': args.id == 'coral', 'meshDataRepaired': mesh_repaired,
               'images': textures, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
               'archApertureBefore': aperture_before, 'archRepairApplied': args.repair_arch,
               'archApertureAfter': aperture(obj) if args.id == 'arch' else None}
    preview(obj, output / f'{args.id}-preview.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f'{args.id}.blend'), compress=True)
    (output / f'{args.id}-preparation.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=True))


if __name__ == '__main__':
    main()
