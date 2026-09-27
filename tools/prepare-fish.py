"""Inspect Lux3D fish sources and prepare game-ready GLBs with Blender.

Run with blender --background --factory-startup --python-exit-code 1 --python
prepare_fish.py -- --source SOURCE.glb --name grunt --mode inspect --work DIR
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector
import numpy as np


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--mode", choices=("inspect", "prepare"), default="inspect")
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--forward", default=None, help="Source nose axis, e.g. +X or -Z")
    parser.add_argument("--up", default=None, help="Source dorsal axis, e.g. +Y")
    parser.add_argument("--out-glb", type=Path)
    parser.add_argument("--out-blend", type=Path)
    parser.add_argument("--target-triangles", type=int, default=14000)
    parser.add_argument("--width-scale", type=float, default=1.0)
    parser.add_argument("--height-scale", type=float, default=1.0)
    parser.add_argument("--mirror-clean-side", action="store_true",
                        help="Replace the flawed +X tuna half with the clean -X half")
    parser.add_argument("--preserve-source-seams", action="store_true",
                        help="Keep original separate UV islands and their imported normals")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def bounds(objects):
    pts = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return low, high


def components(obj):
    verts = obj.data.vertices
    neighbors = [[] for _ in verts]
    for edge in obj.data.edges:
        a, b = edge.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    seen = set()
    result = []
    for vertex in verts:
        if vertex.index in seen:
            continue
        stack = [vertex.index]
        seen.add(vertex.index)
        members = []
        while stack:
            idx = stack.pop()
            members.append(idx)
            for neighbor in neighbors[idx]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        points = [obj.matrix_world @ verts[idx].co for idx in members]
        result.append({"vertices": len(members),
                       "min": [min(p[i] for p in points) for i in range(3)],
                       "max": [max(p[i] for p in points) for i in range(3)]})
    return sorted(result, key=lambda row: row["vertices"], reverse=True)


def set_preview_scene(center, extent):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 560
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("inspection_world")
    scene.world.color = (0.07, 0.08, 0.1)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    camera_data = bpy.data.cameras.new("inspection_camera")
    camera = bpy.data.objects.new("inspection_camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(extent) * 1.35
    return camera, max(extent) * 2.5


def render_views(objects, directory):
    directory.mkdir(parents=True, exist_ok=True)
    low, high = bounds(objects)
    center = (low + high) / 2
    extent = high - low
    camera, distance = set_preview_scene(center, extent)
    for label, direction in (("px", (1, 0, 0)), ("nx", (-1, 0, 0)),
                             ("py", (0, 1, 0)), ("ny", (0, -1, 0)),
                             ("pz", (0, 0, 1)), ("nz", (0, 0, -1))):
        vec = Vector(direction)
        camera.location = center + vec * distance
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = str(directory / f"{label}.png")
        bpy.ops.render.render(write_still=True)


def inspect_source(source, name, work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh found in source GLB")
    low, high = bounds(meshes)
    positions = np.array([tuple(obj.matrix_world @ v.co) for obj in meshes for v in obj.data.vertices])
    eigenvalues, eigenvectors = np.linalg.eigh(np.cov(positions, rowvar=False))
    principal = [(float(eigenvalues[i]), [float(x) for x in eigenvectors[:, i]]) for i in reversed(range(3))]
    report = {
        "source": str(source.resolve()),
        "bytes": source.stat().st_size,
        "boundsMin": list(low), "boundsMax": list(high),
        "dimensions": list(high - low),
        "principalAxes": principal,
        "components": components(meshes[0])[:30] if len(meshes) == 1 else None,
        "meshes": [{"name": obj.name, "triangles": sum(len(poly.vertices) - 2 for poly in obj.data.polygons),
                    "uvLayers": len(obj.data.uv_layers), "materials": [m.name if m else None for m in obj.data.materials]}
                   for obj in meshes],
        "images": [{"name": img.name, "size": list(img.size), "packed": bool(img.packed_file),
                    "source": img.source} for img in bpy.data.images],
        "armatures": [obj.name for obj in bpy.context.scene.objects if obj.type == "ARMATURE"],
        "animations": [action.name for action in bpy.data.actions],
    }
    work.mkdir(parents=True, exist_ok=True)
    (work / f"{name}-source-inspect.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    render_views(meshes, work / f"{name}-source-views")
    print("FISH_INSPECT", json.dumps(report, ensure_ascii=False))


def direction(value):
    axis = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0),
            "-Y": (0, -1, 0), "+Z": (0, 0, 1), "-Z": (0, 0, -1)}
    return Vector(axis[value.upper()] if value.upper() in axis else [float(x) for x in value.split(",")]).normalized()


def mirror_clean_side(fish):
    bm = bmesh.new()
    bm.from_mesh(fish.data)
    geometry = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geometry, dist=1e-6,
                           plane_co=(0, 0, 0), plane_no=(1, 0, 0),
                           clear_outer=True, clear_inner=False)
    bm.to_mesh(fish.data)
    bm.free()
    fish.data.update()
    if max(vertex.co.x for vertex in fish.data.vertices) > 1e-4:
        raise RuntimeError("Bisect kept the flawed +X half")
    mirror = fish.modifiers.new("clean_side_symmetry", "MIRROR")
    mirror.use_axis[0] = True
    mirror.use_clip = True
    mirror.use_mirror_merge = True
    mirror.merge_threshold = 1e-5
    bpy.ops.object.modifier_apply(modifier=mirror.name)
    return {"halfVertices": len(fish.data.vertices),
            "xRange": [min(v.co.x for v in fish.data.vertices),
                       max(v.co.x for v in fish.data.vertices)]}


def prepare(opt):
    if not (opt.forward and opt.up and opt.out_glb and opt.out_blend):
        raise ValueError("prepare needs --forward, --up, --out-glb, and --out-blend")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(opt.source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh found")
    source_triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target="MESH")
    if len(meshes) > 1:
        bpy.ops.object.join()
    fish = bpy.context.view_layer.objects.active
    fish.name = opt.name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    forward, up = direction(opt.forward), direction(opt.up)
    up = (up - forward * up.dot(forward)).normalized()
    right = up.cross(forward).normalized()
    basis = Matrix((right, up, forward))
    points = [basis @ v.co for v in fish.data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    length = high.z - low.z
    if length <= 0:
        raise ValueError("Zero-length model")
    center = (high + low) / 2
    for vertex, point in zip(fish.data.vertices, points):
        vertex.co = ((point.x - center.x) / length * opt.width_scale,
                     (point.y - center.y) / length * opt.height_scale,
                     (point.z - center.z) / length)
    fish.data.update()
    if not fish.data.uv_layers:
        raise RuntimeError("Source mesh has no UVs")
    before_weld = len(fish.data.vertices)
    if not opt.preserve_source_seams:
        if fish.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        for edge in fish.data.edges:
            edge.use_edge_sharp = False
        bm = bmesh.new()
        bm.from_mesh(fish.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
        bm.to_mesh(fish.data)
        bm.free()
        fish.data.update()
    after_weld = len(fish.data.vertices)
    mirror_result = mirror_clean_side(fish) if opt.mirror_clean_side else None
    if mirror_result:
        z_min = min(v.co.z for v in fish.data.vertices)
        z_max = max(v.co.z for v in fish.data.vertices)
        scale = 1.0 / (z_max - z_min)
        midpoint = (z_min + z_max) / 2
        for vertex in fish.data.vertices:
            vertex.co.x *= scale
            vertex.co.y *= scale
            vertex.co.z = (vertex.co.z - midpoint) * scale
        fish.data.update()
        mirror_result["finalLengthScale"] = scale
    before_decimate = sum(len(p.vertices) - 2 for p in fish.data.polygons)
    if before_decimate > opt.target_triangles:
        mod = fish.modifiers.new("controlled_triangle_reduction", "DECIMATE")
        mod.ratio = opt.target_triangles / before_decimate
        bpy.ops.object.modifier_apply(modifier=mod.name)
    triangles = sum(len(p.vertices) - 2 for p in fish.data.polygons)
    if not 8000 <= triangles <= max(15000, opt.target_triangles):
        raise RuntimeError(f"Final triangle count outside target: {triangles}")
    for polygon in fish.data.polygons:
        polygon.use_smooth = True
    if fish.data.has_custom_normals and not opt.preserve_source_seams:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    fish.data.update()

    rig_data = bpy.data.armatures.new(opt.name + "_skeleton")
    rig = bpy.data.objects.new(opt.name + "_rig", rig_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    spans = (("root", .40, -.08), ("tail_01", -.08, -.22),
             ("tail_02", -.22, -.37), ("tail_03", -.37, -.50))
    previous = None
    for name, z0, z1 in spans:
        bone = rig_data.edit_bones.new(name)
        bone.head = (0, 0, z0)
        bone.tail = (0, 0, z1)
        if previous:
            bone.parent = previous
            bone.use_connect = True
        previous = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = [fish.vertex_groups.new(name=name) for name, _, _ in spans]
    anchors = [(-.08, 0), (-.22, 1), (-.37, 2), (-.50, 3)]
    for vertex in fish.data.vertices:
        z = vertex.co.z
        if z >= anchors[0][0]:
            groups[0].add([vertex.index], 1.0, "REPLACE")
        elif z <= anchors[-1][0]:
            groups[3].add([vertex.index], 1.0, "REPLACE")
        else:
            for i in range(3):
                upper, lower = anchors[i], anchors[i + 1]
                if upper[0] >= z >= lower[0]:
                    blend = (upper[0] - z) / (upper[0] - lower[0])
                    groups[i].add([vertex.index], 1.0 - blend, "REPLACE")
                    groups[i + 1].add([vertex.index], blend, "REPLACE")
                    break
    fish.parent = rig
    fish.modifiers.new("tail_skin", "ARMATURE").object = rig

    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 49
    for frame in range(1, 50, 3):
        phase = 2 * math.pi * (frame - 1) / 48
        for i, amp in enumerate((.035, .07, .105), 1):
            bone = rig.pose.bones[f"tail_0{i}"]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler[2] = amp * math.sin(phase - i * .35)
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
    action = rig.animation_data.action
    action.name = "idle"
    # GLB exporter samples each integer frame and writes linear interpolation.
    scene.frame_set(1)

    opt.work.mkdir(parents=True, exist_ok=True)
    render_views([fish], opt.work / f"{opt.name}-prepared-views")
    scene.frame_set(25)
    render_views([fish], opt.work / f"{opt.name}-posed-views")
    scene.frame_set(1)
    for index, image in enumerate(bpy.data.images):
        if image.source != "FILE":
            continue
        image.filepath_raw = str(opt.work / f"{opt.name}-texture-{index}.png")
        image.file_format = "PNG"
        image.save()
        image.pack()
    bpy.ops.file.pack_all()
    opt.out_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(opt.out_blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    fish.select_set(True)
    bpy.context.view_layer.objects.active = rig
    opt.out_glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(opt.out_glb), export_format="GLB", use_selection=True,
                              export_image_format="AUTO", export_materials="EXPORT",
                              export_normals=True, export_texcoords=True, export_skins=True,
                              export_animations=True, export_force_sampling=True,
                              export_frame_range=True, export_yup=False,
                              export_draco_mesh_compression_enable=False)
    report = {"source": str(opt.source), "output": str(opt.out_glb), "blend": str(opt.out_blend),
              "sourceTriangles": source_triangles, "outputTriangles": triangles,
              "verticesWelded": before_weld - after_weld,
              "mirroredCleanSide": mirror_result,
              "forward": list(forward), "up": list(up), "widthScale": opt.width_scale,
              "heightScale": opt.height_scale, "length": 1.0,
              "images": [{"name": img.name, "size": list(img.size)} for img in bpy.data.images]}
    (opt.work / f"{opt.name}-prepare.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("FISH_PREPARED", json.dumps(report))


def main():
    opt = args()
    opt.source = opt.source.resolve()
    opt.work = opt.work.resolve()
    if not opt.source.is_file():
        raise FileNotFoundError(opt.source)
    if opt.mode == "inspect":
        inspect_source(opt.source, opt.name, opt.work)
    else:
        opt.out_glb = opt.out_glb.resolve()
        opt.out_blend = opt.out_blend.resolve()
        prepare(opt)


if __name__ == "__main__":
    main()
