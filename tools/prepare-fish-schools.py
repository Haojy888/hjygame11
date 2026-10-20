"""Derive small, static school meshes from the finished catch models; no generation calls.

blender -b --factory-startup --python-exit-code 1 --python tools/prepare-fish-schools.py -- 
  --source public/models/fish-realistic --output public/models/fish-schools --work WORK
The existing GPU swim shader supplies per-fish animation and motion vectors at runtime.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output, work = args.output.resolve(), args.work.resolve()
    output.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    report = []
    for source in sorted(args.source.resolve().glob('*.glb')):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
        for obj in bpy.context.scene.objects:
            if obj.type == 'ARMATURE':
                obj.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        # The importer also creates hidden mesh shapes for editing armature bones.
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and any(m.type == 'ARMATURE' for m in obj.modifiers)]
        assert len(meshes) == 1, source
        original = meshes[0]
        mesh = bpy.data.meshes.new_from_object(original.evaluated_get(bpy.context.evaluated_depsgraph_get()), preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
        mesh.transform(original.matrix_world)
        fish = bpy.data.objects.new(source.stem, mesh)
        bpy.context.collection.objects.link(fish)
        bpy.ops.object.select_all(action='DESELECT')
        fish.select_set(True)
        bpy.context.view_layer.objects.active = fish
        before = sum(len(p.vertices) - 2 for p in mesh.polygons)
        modifier = fish.modifiers.new('School mesh budget', 'DECIMATE')
        modifier.ratio = min(1, 6000 / before)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        images = []
        for index, image in enumerate(bpy.data.images):
            if image.type != 'IMAGE':
                continue
            # Packed GLB images are loaded lazily by Blender.
            image.pixels[0]
            size = list(image.size)
            factor = min(1, 1024 / max(size))
            image.scale(max(1, round(size[0] * factor)), max(1, round(size[1] * factor)))
            image.filepath_raw = str(work / f'{source.stem}-{index}.png')
            image.file_format = 'PNG'
            color_space = image.colorspace_settings.name
            image.save()
            if image.packed_file:
                image.unpack(method='REMOVE')
            image.reload()
            image.colorspace_settings.name = color_space
            image.pack()
            images.append(list(image.size))
        destination = output / source.name
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
            export_yup=True, export_skins=False, export_animations=False, export_image_format='AUTO',
            export_normals=True, export_texcoords=True, export_draco_mesh_compression_enable=False)
        triangles = sum(len(p.vertices) - 2 for p in fish.data.polygons)
        assert triangles <= 6100
        report.append({'id': source.stem, 'sourceTriangles': before, 'triangles': triangles, 'images': images, 'bytes': destination.stat().st_size})
        print('SCHOOL_PREPARED', json.dumps(report[-1]), flush=True)
    (work / 'prepared.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
