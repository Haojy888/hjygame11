"""Fit task 4229108's generated facade to Tidewater's existing playable lighthouse.

Original input is preserved. Measurements below come from the six inspected views
and source vertex bounds; they are specific to this source, not a general building tool.
Run with Blender --background --factory-startup --python-exit-code 1 --python ...
"""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

spec=importlib.util.spec_from_file_location('inspection',Path(__file__).with_name('prepare-fish.py'))
helpers=importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)

def mix(x, knots):
    for (a,b),(c,d) in zip(knots,knots[1:]):
        if x<=c:
            return b+(d-b)*max(0,min(1,(x-a)/(c-a)))
    return knots[-1][1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--work',type=Path,required=True)
    parser.add_argument('--game',type=Path,required=True)
    parser.add_argument('--blend',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    for key in ['source','work','game','blend']:
        setattr(args,key,getattr(args,key).resolve())
    args.work.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(objects)==1
    obj=objects[0]
    bpy.ops.object.select_all(action='DESELECT')
    matrix=obj.matrix_world.copy(); obj.parent=None; obj.matrix_world=matrix
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    low,high=helpers.bounds([obj]); center=(low+high)/2
    original_triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
    for v in obj.data.vertices:
        # Source entrance faces +Y. Blender -Y exports to game +Z.
        x,y,z=-(v.co.x-center.x),-(v.co.y-center.y),v.co.z
        radius=math.hypot(x,y)
        if z<0.115:
            expected=mix(z,[(low.z,0.124),(0.115,0.095)])
            scale=3.82/expected
            height=mix(z,[(low.z,0),(0.115,12.0),(0.176,13.2)])
        elif z<0.180:
            scale=mix(z,[(0.115,3.82/0.095),(0.150,4.75/0.133),(0.176,4.97/0.142),(0.180,4.97/0.142)])
            height=mix(z,[(0.115,12.0),(0.176,13.2),(0.180,13.24)])
        else:
            outer=radius>0.109 and z<0.25
            if outer:
                scale=4.97/0.142
                height=mix(z,[(0.180,13.24),(0.240,14.25),(0.250,14.3)])
            else:
                scale=2.25/0.095
                height=mix(z,[(0.180,14.6),(0.367,17.5),(0.459,19.15),(high.z,19.7)])
        v.co=Vector((x*scale,y*scale,height))
    obj.data.update()

    cuts=[]
    uv=obj.data.uv_layers.active.data
    polygons=[[(obj.data.vertices[obj.data.loops[i].vertex_index].co.copy(),uv[i].uv.copy(),obj.data.vertices[obj.data.loops[i].vertex_index].normal.copy()) for i in face.loop_indices] for face in obj.data.polygons]
    def split(poly,normal,distance):
        inside=[]; outside=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            da,db=normal.dot(a[0])-distance,normal.dot(b[0])-distance
            (inside if da<=0 else outside).append(a)
            if (da<0<db) or (db<0<da):
                t=da/(da-db)
                corner=tuple(x.lerp(y,t) for x,y in zip(a,b))
                inside.append(corner); outside.append(corner)
        return inside,outside
    def subtract(planes,label,low,high):
        # Clip a triangle against a convex cutter, preserving UV interpolation.
        # The source has disconnected UV islands, so solid booleans can silently
        # remove unrelated roof components. Geometric clipping needs no manifold.
        nonlocal polygons
        result=[]
        for poly in polygons:
            if any(max(v[0][k] for v in poly)<low[k] or min(v[0][k] for v in poly)>high[k] for k in range(3)):
                result.append(poly); continue
            current=poly
            for normal,distance in planes:
                current,outside=split(current,normal,distance)
                if len(outside)>=3: result.append(outside)
                if len(current)<3: break
        polygons=result
        cuts.append(label)
    def box_cut(label,center,size,yaw=0):
        center=Vector(center); c,s=math.cos(yaw),math.sin(yaw)
        axes=[Vector((c,s,0)),Vector((-s,c,0)),Vector((0,0,1))]
        planes=[(axis*sign,axis.dot(center)*sign+size[k]/2) for k,axis in enumerate(axes) for sign in [-1,1]]
        radius=Vector((abs(c)*size[0]/2+abs(s)*size[1]/2,abs(s)*size[0]/2+abs(c)*size[1]/2,size[2]/2))
        subtract(planes,label,center-radius,center+radius)
    # Source bottom and gallery are capped. Remove the complete stair volume and
    # the generated lower lantern skin so the real final stair has headroom.
    planes=[(Vector((math.cos(a),math.sin(a),0)),3.64) for a in [i*math.tau/64 for i in range(64)]]
    planes += [(Vector((0,0,1)),15.0),(Vector((0,0,-1)),.5)]
    subtract(planes,'Empty tower and stair headroom',Vector((-3.64,-3.64,-.5)),Vector((3.64,3.64,15.0)))
    box_cut('Open south doorway',(0,-3.9,1.43),(2.2,2.8,2.9))
    for band in range(1,4):
        for side in range(4):
            angle=side*math.pi/2
            box_cut(f'Align existing window {band}-{side}',(math.sin(angle)*3.7,-math.cos(angle)*3.7,band*3.3+1.6),(.84,1.8,1.48),angle)
    # Source glass is opaque; open the actual pane areas and use the game's
    # transparent glass plus physical lamp in the generated metal frame.
    core=[(Vector((math.cos(a),math.sin(a),0)),1.7) for a in [i*math.tau/48 for i in range(48)]]
    core += [(Vector((0,0,1)),17.55),(Vector((0,0,-1)),-14.5)]
    subtract(core,'Clear generated opaque lamp for live lens',Vector((-1.7,-1.7,14.5)),Vector((1.7,1.7,17.55)))
    for side in range(8):
        a=side*math.pi/4+math.pi/8
        for level in range(3):
            box_cut(f'Lantern pane {side}-{level}',(math.sin(a)*2.13,-math.cos(a)*2.13,14.95+level*.82),(1.05,.85,.64),a)

    positions=[]; faces=[]; uvs=[]; normals=[]
    for poly in polygons:
        for k in range(1,len(poly)-1):
            corners=[poly[0],poly[k],poly[k+1]]
            if (corners[1][0]-corners[0][0]).cross(corners[2][0]-corners[0][0]).length_squared<1e-15: continue
            faces.append(tuple(range(len(positions),len(positions)+3)))
            for position,texcoord,normal in corners:
                positions.append(tuple(position)); uvs.append(tuple(texcoord)); normals.append(tuple(normal.normalized()))
    material=obj.data.materials[0]
    mesh=bpy.data.meshes.new('Clipped source with interpolated UVs')
    mesh.from_pydata(positions,[],faces); mesh.update()
    layer=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops: layer.data[loop.index].uv=uvs[loop.vertex_index]
    mesh.materials.append(material); obj.data=mesh
    # Weld positions for decimation, retaining per-corner UVs and imported normals.
    import bmesh
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    for face in mesh.polygons: face.use_smooth=True

    modifier=obj.modifiers.new('Budget 20k triangles','DECIMATE')
    modifier.ratio=min(1,19800/max(1,sum(len(p.vertices)-2 for p in obj.data.polygons)))
    modifier.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier=obj.modifiers.new('Explicit triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for vertex in obj.data.vertices:
        r=math.hypot(vertex.co.x,vertex.co.y)
        if 3.3<r<4.22 and 13.10<vertex.co.z<13.35:
            vertex.co.z=13.14 # Existing exact walkable floor at 13.2 covers this source floor.
    obj.data.validate(clean_customdata=True); obj.data.update()
    material=obj.data.materials[0]
    obj.data.materials.clear(); obj.data.materials.append(material)
    for face in obj.data.polygons:
        face.material_index=0
    images=sorted({n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image},key=lambda im:im.name)
    textures=[]
    for i,image in enumerate(images):
        image.pixels[0]; old=list(image.size)
        if max(old)>1024:
            image.scale(round(old[0]*1024/max(old)),round(old[1]*1024/max(old)))
        colorspace=image.colorspace_settings.name
        image.filepath_raw=str(args.work/f'lighthouse-texture-{i}.png'); image.file_format='PNG'; image.save()
        if image.packed_file: image.unpack(method='REMOVE')
        image.reload(); image.colorspace_settings.name=colorspace; image.pack()
        textures.append({'sourceSize':old,'size':list(image.size),'colorSpace':colorspace})
    obj.name='归航灯塔 | Lux3D 4229108'
    obj['Lux3DTask']='4229108'; obj['LocalCorrections']='Dimensions, empty stair clearance, doorway, windows and lantern panes; original source preserved'
    args.blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    args.game.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(args.game.resolve()),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=False,export_morph=False,export_image_format='AUTO',export_cameras=False,export_lights=False)
    low,high=helpers.bounds([obj]); triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
    assert triangles<=20000 and args.game.stat().st_size<5*1024*1024
    assert high.z>19.69, 'Source roof and lightning rod must survive local clearance cuts'
    report={'taskId':'4229108','source':str(args.source.resolve()),'sourceTriangles':original_triangles,'triangles':triangles,
        'boundsMin':list(low),'boundsMax':list(high),'gameSizeXYZ':[high.x-low.x,high.z-low.z,high.y-low.y],
        'textures':textures,'cuts':cuts,'game':str(args.game.resolve()),'gameBytes':args.game.stat().st_size,'blend':str(args.blend.resolve())}
    (args.work/'lighthouse-prepared.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    helpers.render_views([obj],args.work/'lighthouse-prepared-views')
    print('LIGHTHOUSE_PREPARED',json.dumps(report),flush=True)

if __name__=='__main__': main()
