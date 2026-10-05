"""Remove the measured detached duplicate tail/body from the barracuda source."""
import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils.kdtree import KDTree

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
opt = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
source, output = opt.source.resolve(), opt.out.resolve()
if source == output:
    raise ValueError('Keep the downloaded source unchanged; use a separate output path')
if not source.is_file():
    raise FileNotFoundError(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
assert len(meshes) == 1, 'Expected the original single barracuda mesh'
fish = meshes[0]

# Weld only a disposable probe for connectivity; exported source UV islands stay separate.
probe = bmesh.new()
probe.from_mesh(fish.data)
bmesh.ops.remove_doubles(probe, verts=list(probe.verts), dist=1e-5)
probe.verts.ensure_lookup_table()
seen, detached = set(), []
for vertex in probe.verts:
    if vertex in seen:
        continue
    stack, group = [vertex], []
    seen.add(vertex)
    while stack:
        current = stack.pop()
        group.append(current)
        for edge in current.link_edges:
            other = edge.other_vert(current)
            if other not in seen:
                seen.add(other)
                stack.append(other)
    points = [fish.matrix_world @ v.co for v in group]
    if len(group) > 1000 and max(p.x for p in points) < 0 and min(p.y for p in points) > 0:
        detached.append(group)
assert len(detached) == 1 and len(detached[0]) == 3578, 'Unexpected barracuda source geometry'
tree = KDTree(len(detached[0]))
for i, vertex in enumerate(detached[0]):
    tree.insert(vertex.co, i)
tree.balance()
original = bmesh.new()
original.from_mesh(fish.data)
remove = [vertex for vertex in original.verts if tree.find(vertex.co)[2] <= 1.1e-5]
assert len(remove) == 4962, 'Unexpected detached source vertex count'
before = sum(len(p.vertices) - 2 for p in fish.data.polygons)
bmesh.ops.delete(original, geom=remove, context='VERTS')
original.to_mesh(fish.data)
original.free()
probe.free()
fish.data.update()
after = sum(len(p.vertices) - 2 for p in fish.data.polygons)
assert before == 39382 and after == 32174, 'Unexpected source triangle count'
bpy.ops.object.select_all(action='DESELECT')
fish.select_set(True)
bpy.context.view_layer.objects.active = fish
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                         export_image_format='AUTO', export_materials='EXPORT', export_normals=True,
                         export_texcoords=True, export_animations=False, export_yup=True,
                         export_draco_mesh_compression_enable=False)
print('BARRACUDA_CLEAN', json.dumps({'removedVertices': len(remove), 'sourceTriangles': before,
                                   'cleanTriangles': after}))
