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
    parser.add_argument("--repair-grouper", action="store_true",
                        help="Round the Nassau grouper tail and settle its raised gill flap")
    parser.add_argument("--repair-parrot", action="store_true",
                        help="Reshape the parrotfish's tall fins, pectorals, tail and beak")
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


def smoothstep(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def repair_grouper(fish):
    """Small silhouette and flap corrections to the generated Nassau grouper."""
    for vertex in fish.data.vertices:
        x, y, z = vertex.co
        tail = 1 - smoothstep(-.47, -.34, z)
        if tail:
            edge = min(1.0, abs(y + .005) / .145)
            vertex.co.y = y * (1 - .07 * tail)
            vertex.co.z = z + tail * (-.035 + .066 * edge * edge)
        # The detached outer edge of both gill covers casts an oversized,
        # dark double slit. Settle only the protruding lower edge into the body.
        gill = (smoothstep(.12, .21, z) * (1 - smoothstep(.34, .43, z))
                * smoothstep(-.19, -.10, y) * (1 - smoothstep(-.07, .00, y))
                * smoothstep(.055, .115, abs(x)))
        if gill:
            vertex.co.x = x * (1 - .12 * gill)
            vertex.co.y += .012 * gill
    fish.data.update()


def settle_grouper_gills(fish):
    """Smooth the paired overlapping gill flaps without rewiring the UV atlas."""
    verts = fish.data.vertices
    if fish.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for edge in fish.data.edges:
        edge.use_edge_sharp = False
    merged, indices, points = {}, [], []
    for vertex in verts:
        key = tuple(round(float(c), 5) for c in vertex.co)
        if key not in merged:
            merged[key] = len(points)
            points.append(vertex.co.copy())
        indices.append(merged[key])
    adjacent = [set() for _ in points]
    for edge in fish.data.edges:
        a, b = (indices[index] for index in edge.vertices)
        if a != b:
            adjacent[a].add(b)
            adjacent[b].add(a)
    weights = []
    for x, y, z in points:
        weights.append(smoothstep(.13, .20, z) * (1 - smoothstep(.35, .41, z))
                       * smoothstep(-.19, -.145, y) * (1 - smoothstep(-.04, .02, y))
                       * smoothstep(.025, .06, abs(x)))
    for _ in range(18):
        coords = [point.copy() for point in points]
        for i, weight in enumerate(weights):
            if weight and adjacent[i]:
                avg = sum((coords[j] for j in adjacent[i]), Vector()) / len(adjacent[i])
                points[i] = coords[i].lerp(avg, .65 * weight)
    for vertex, index in zip(verts, indices):
        if weights[index]:
            vertex.co = points[index]
    fish.data.update()
    # Welding this duplicate creates a continuous normal reference, while the
    # exported mesh keeps its separate source UV islands and intact texture.
    normal_source = fish.copy()
    normal_source.data = fish.data.copy()
    normal_source.name = "grouper_smooth_normals"
    bpy.context.scene.collection.objects.link(normal_source)
    bm = bmesh.new()
    bm.from_mesh(normal_source.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bm.to_mesh(normal_source.data)
    bm.free()
    for polygon in normal_source.data.polygons:
        polygon.use_smooth = True
    normal_source.data.update()
    normalize_length(normal_source)
    return normal_source


def transfer_grouper_normals(fish, normal_source):
    bpy.context.view_layer.objects.active = fish
    transfer = fish.modifiers.new("continuous_skin_normals", "DATA_TRANSFER")
    transfer.object = normal_source
    transfer.use_loop_data = True
    transfer.data_types_loops = {"CUSTOM_NORMAL"}
    transfer.loop_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    bpy.data.objects.remove(normal_source, do_unlink=True)


def parrot_pectoral_vertices(fish):
    """Identify the two detached pectoral fin shells by their measured bounds."""
    neighbors = [[] for _ in fish.data.vertices]
    for edge in fish.data.edges:
        a, b = edge.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    seen = set()
    matched = set()
    for vertex in fish.data.vertices:
        if vertex.index in seen:
            continue
        stack = [vertex.index]
        seen.add(vertex.index)
        component = []
        while stack:
            index = stack.pop()
            component.append(index)
            for other in neighbors[index]:
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        if len(component) < 80:
            continue
        points = [fish.data.vertices[index].co for index in component]
        x_min, x_max = min(p.x for p in points), max(p.x for p in points)
        y_min, y_max = min(p.y for p in points), max(p.y for p in points)
        z_min, z_max = min(p.z for p in points), max(p.z for p in points)
        if ((x_min > .075 or x_max < -.075) and .065 < z_min < .12
                and .24 < z_max < .29 and -.14 < y_min < -.09
                and -.01 < y_max < .04):
            matched.update(component)
    if len(matched) < 200:
        raise RuntimeError(f"Could not isolate parrot pectoral fins: {len(matched)} vertices")
    return matched


def repair_parrot(fish):
    """Correct source silhouette while retaining its atlas and articulated fin edges."""
    pectorals = parrot_pectoral_vertices(fish)
    for vertex in fish.data.vertices:
        x, y, z = vertex.co
        if y > .13:
            y = .117 + (y - .13) * .42
        elif y < -.13:
            y = -.117 + (y + .13) * .52
        else:
            y *= .90
        if vertex.index in pectorals:
            # Keep the root fixed against the body; moving it opened a seam on
            # the reverse-side source shell. Taper only the free trailing edge.
            tip = 1 - smoothstep(.08, .17, z)
            y = -.05 + (y + .05) * (1 - .55 * tip)
            x *= 1 - .08 * tip
        # The source caudal peduncle slopes far below the body's centerline.
        tail = 1 - smoothstep(-.40, -.22, z)
        y += .075 * tail
        fan = 1 - smoothstep(-.48, -.36, z)
        if fan:
            y = -.04 + (y + .04) * (1 + .16 * fan)
            edge = min(1.0, abs(y + .04) / .15)
            z += fan * (.038 - .07 * edge * edge)
        # Raise the skin immediately below the dorsal-fin root into the
        # generated V-shaped forehead gap; leave the thin fin membrane alone.
        brow = (max(0.0, 1 - abs(z - .375) / .065)
                * smoothstep(.075, .13, y)
                * (1 - smoothstep(.20, .25, y))
                * smoothstep(.025, .075, abs(x)))
        y += .065 * brow
        # Retract the thin projecting leading edge of the dorsal fin; it
        # otherwise hangs over the forehead like a pointed brim on both sides.
        if y > .14 and abs(x) < .075:
            z -= .055 * smoothstep(.31, .40, z) * (1 - smoothstep(.075, .14, abs(x)))
        vertex.co = (x, y, z)
    fish.data.update()
    normalize_length(fish)
    return len(pectorals)


def add_parrot_beak(fish):
    """Build small fused dental plates using pale pixels of the source atlas."""
    # Source texture pixel (640, 1312) is pale mint; Blender's UV V runs up.
    center_uv = (.3125, 1 - 1312 / 2048)
    for name, center, radii in (
        ("upper_dental_plate", (0, -.027, .462), (.043, .024, .043)),
        ("lower_dental_plate", (0, -.047, .458), (.041, .022, .043)),
    ):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8)
        plate = bpy.context.object
        plate.name = name
        for vertex in plate.data.vertices:
            p = vertex.co
            vertex.co = (center[0] + p.x * radii[0],
                         center[1] + p.y * radii[1],
                         center[2] + p.z * radii[2])
        plate.data.materials.append(fish.data.materials[0])
        for loop in plate.data.uv_layers.active.data:
            u, v = loop.uv
            loop.uv = (center_uv[0] + (u - .5) * .005,
                       center_uv[1] + (v - .5) * .005)
        for polygon in plate.data.polygons:
            polygon.use_smooth = True
        fish.select_set(True)
        plate.select_set(True)
        bpy.context.view_layer.objects.active = fish
        bpy.ops.object.join()
    normalize_length(fish)


def normalize_length(fish):
    z_min = min(v.co.z for v in fish.data.vertices)
    z_max = max(v.co.z for v in fish.data.vertices)
    scale = 1.0 / (z_max - z_min)
    midpoint = (z_min + z_max) / 2
    for vertex in fish.data.vertices:
        vertex.co.x *= scale
        vertex.co.y *= scale
        vertex.co.z = (vertex.co.z - midpoint) * scale
    fish.data.update()
    return scale


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
        mirror_result["finalLengthScale"] = normalize_length(fish)
    normal_source = None
    if opt.repair_grouper:
        if opt.name != "grouper":
            raise ValueError("--repair-grouper requires --name grouper")
        repair_grouper(fish)
        normal_source = settle_grouper_gills(fish)
        normalize_length(fish)
    parrot_pectorals = None
    if opt.repair_parrot:
        if opt.name != "parrot":
            raise ValueError("--repair-parrot requires --name parrot")
        parrot_pectorals = repair_parrot(fish)
    before_decimate = sum(len(p.vertices) - 2 for p in fish.data.polygons)
    if before_decimate > opt.target_triangles:
        mod = fish.modifiers.new("controlled_triangle_reduction", "DECIMATE")
        mod.ratio = opt.target_triangles / before_decimate
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if opt.repair_parrot:
        add_parrot_beak(fish)
    triangles = sum(len(p.vertices) - 2 for p in fish.data.polygons)
    if not 8000 <= triangles <= max(15000, opt.target_triangles):
        raise RuntimeError(f"Final triangle count outside target: {triangles}")
    for polygon in fish.data.polygons:
        polygon.use_smooth = True
    if fish.data.has_custom_normals and not opt.preserve_source_seams:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    fish.data.update()
    if normal_source:
        transfer_grouper_normals(fish, normal_source)

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
              "repairedGrouper": opt.repair_grouper,
              "repairedParrot": opt.repair_parrot,
              "parrotPectoralVertices": parrot_pectorals,
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
