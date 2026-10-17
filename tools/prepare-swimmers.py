"""Inspect and prepare Lux3D wildlife with F-drive Blender, retaining UVs and source files.

blender -b --factory-startup --python-exit-code 1 --python tools/prepare-swimmers.py --
  --id green-turtle --source SOURCE.glb --output OUTPUT --game public/models/creatures
Add --inspect for source views; --yaw DEGREES sets the inspected nose toward Blender -Y.
"""
import argparse, hashlib, importlib.util, json, math, struct, sys
from array import array
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

spec = importlib.util.spec_from_file_location('abyss_preparation', Path(__file__).with_name('prepare-abyss-props.py'))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def repair_ray_tail(obj):
    """The inspected source had a Y-shaped tail. Keep the disc and replace only that fork."""
    uv_layer = obj.data.uv_layers.active
    uv_name = uv_layer.name
    image = next(n.image for n in obj.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.colorspace_settings.name == 'sRGB')
    width, height = image.size
    pixels = array('f', [0]) * len(image.pixels)
    image.pixels.foreach_get(pixels)
    candidates = []
    for face in obj.data.polygons:
        if face.center.y < 0.24:
            continue
        uv = sum((uv_layer.data[i].uv for i in face.loop_indices), Vector((0, 0))) / len(face.loop_indices)
        index = (int(uv.y*height)%height*width+int(uv.x*width)%width)*4
        color = pixels[index:index+3]
        candidates.append((sum(color), uv))
    dark_uv = min(candidates, key=lambda item:item[0])[1]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=0.000001,
        plane_co=(0, 0.195, 0), plane_no=(0, 1, 0), clear_outer=True)
    bm.to_mesh(obj.data)
    bm.free()
    vertices, faces = [], []
    rings, sides = 25, 8
    for i in range(rings):
        t = i / (rings-1)
        x = math.sin(t*math.pi*1.4)*0.025*t
        y, z = 0.19+t*1.12, -0.05+0.012*math.sin(t*math.pi)
        radius = 0.012*(1-t)**1.2+0.00045
        for j in range(sides):
            angle = j/sides*math.tau
            vertices.append((x+math.cos(angle)*radius, y, z+math.sin(angle)*radius))
    for i in range(rings-1):
        for j in range(sides):
            a, b = i*sides+j, i*sides+(j+1)%sides
            faces.append((a,a+sides,b+sides,b))
    faces += [tuple(range(sides)), tuple(reversed(range((rings-1)*sides,rings*sides)))]
    mesh = bpy.data.meshes.new('Single tapered eagle ray whip tail')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name=uv_name)
    for loop in mesh.loops:
        uv.data[loop.index].uv = dark_uv + Vector(((loop.vertex_index%sides)/sides*0.0004,(loop.vertex_index//sides)/rings*0.0004))
    tail = bpy.data.objects.new(mesh.name,mesh)
    bpy.context.collection.objects.link(tail)
    tail.data.materials.append(obj.data.materials[0])
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); tail.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.data.update()


def render(obj, destination, top=False):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising = 'CPU', 12, True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format, scene.render.filepath = 'PNG', str(destination)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.13, 0.17, 0.21, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    low, high = helpers.bounds(obj)
    center, span = (low + high) / 2, max(high - low)
    bpy.ops.object.camera_add(location=center + Vector((0, 0, span * 2.5) if top else (span * 1.1, -span * 1.9, span * 1.4)))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', span * 1.35
    scene.camera = camera
    lights = []
    for offset, power, color in [((1.5, -2, 3), 320, (0.86, 0.94, 1)), ((-2, 0, 1), 230, (1, 0.84, 0.68)), ((0, 2, 2), 230, (0.6, 0.84, 1))]:
        bpy.ops.object.light_add(type='AREA', location=center + Vector(offset) * span)
        light = bpy.context.object
        light.data.energy, light.data.color, light.data.shape, light.data.size = power * span * span, color, 'DISK', span * 2
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        lights.append(light)
    bpy.ops.render.render(write_still=True)
    for light in lights:
        bpy.data.objects.remove(light, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True, choices=['green-turtle', 'spotted-eagle-ray'])
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--yaw', type=float, default=0)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
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
    low, high = helpers.bounds(obj)
    original_size = list(high - low)
    if args.inspect:
        center, span = (low + high) / 2, max(high - low)
        for vertex in obj.data.vertices:
            vertex.co = (vertex.co - center) / span
        obj.data.update()
        render(obj, output / f'{args.id}-source.png')
        render(obj, output / f'{args.id}-source-top.png', top=True)
        print(json.dumps({'id': args.id, 'sourceSizeXYZ': original_size, 'triangles': helpers.triangles(obj)}))
        return
    obj.rotation_euler.z = math.radians(args.yaw)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if args.id == 'spotted-eagle-ray':
        repair_ray_tail(obj)
    low, high = helpers.bounds(obj)
    # Turtle matches one metre nose-tail; eagle ray matches the original one metre disc span.
    length = high.y - low.y if args.id == 'green-turtle' else high.x - low.x
    assert length > 0.001 and obj.data.uv_layers.active
    center = (low + high) / 2
    for vertex in obj.data.vertices:
        vertex.co = (vertex.co - center) / length
        if args.id == 'green-turtle':
            # Rest-plane of the flippers is near zero; shell rises above it.
            vertex.co.z += 0.065
        else:
            # Blender -Y exports as game +Z; put the snout at the original +0.5.
            vertex.co.y += (-0.5 - (low.y - center.y) / length)
    obj.data.update()
    before = helpers.triangles(obj)
    if before > 12000:
        modifier = obj.modifiers.new('Near animal mesh budget', 'DECIMATE')
        modifier.ratio, modifier.use_collapse_triangulate = 11900 / before, True
        helpers.apply_modifier(obj, modifier)
    helpers.apply_modifier(obj, obj.modifiers.new('Explicit game triangles', 'TRIANGULATE'))
    obj.data.validate(clean_customdata=True)
    obj.data.update()
    used = {poly.material_index for poly in obj.data.polygons}
    materials = {obj.data.materials[index] for index in used}
    assert len(materials) == 1
    material = next(iter(materials))
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for name, value in [('Metallic', 0), ('Alpha', 1)]:
        for link in list(bsdf.inputs[name].links):
            material.node_tree.links.remove(link)
        bsdf.inputs[name].default_value = value
    texture_dir = output / 'textures' / args.id
    texture_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for index, image in enumerate(sorted({n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}, key=lambda i: i.name)):
        size = list(image.size)
        if max(size) > 1024:
            ratio = 1024 / max(size)
            image.scale(round(size[0] * ratio), round(size[1] * ratio))
        color_space = image.colorspace_settings.name
        image.file_format, image.filepath_raw = 'PNG', str(texture_dir / f'{args.id}-{index}.png')
        image.save()
        if image.packed_file:
            image.unpack(method='REMOVE')
        image.reload()
        image.colorspace_settings.name = color_space
        image.pack()
        images.append({'sourceSize': size, 'size': list(image.size), 'colorSpace': color_space})
    args.game.mkdir(parents=True, exist_ok=True)
    destination = args.game.resolve() / f'{args.id}.glb'
    obj.name = args.id + ' | Lux3D'
    obj['Lux3DTask'] = {'green-turtle': '4169673', 'spotted-eagle-ray': '4169678'}[args.id]
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_animations=False, export_morph=False, export_yup=True, export_image_format='AUTO', export_cameras=False, export_lights=False)
    raw = destination.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    wire = json.loads(raw[20:20 + size])
    assert len(wire['nodes']) == len(wire['meshes']) == len(wire['meshes'][0]['primitives']) == 1
    assert all(i.get('mimeType') == 'image/png' and 'bufferView' in i for i in wire['images'])
    assert not wire.get('extensionsRequired') and helpers.triangles(obj) <= 12000
    low, high = helpers.bounds(obj)
    receipt = {'id': args.id, 'taskId': obj['Lux3DTask'], 'yaw': args.yaw, 'sourceSizeXYZ': original_size,
        'inspectedTailRepair': args.id == 'spotted-eagle-ray',
        'trianglesBefore': before, 'triangles': helpers.triangles(obj), 'vertices': len(obj.data.vertices),
        'gameSizeXYZ': [high.x-low.x, high.z-low.z, high.y-low.y], 'gameMinXYZ': [low.x, low.z, -high.y],
        'gameMaxXYZ': [high.x, high.z, -low.y], 'textures': images,
        'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    render(obj, output / f'{args.id}-preview.png')
    render(obj, output / f'{args.id}-top.png', top=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f'{args.id}.blend'), compress=True)
    (output / f'{args.id}-preparation.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
