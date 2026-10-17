"""F-drive Blender preparation for the wreck expedition. Preserve original source assets.

--id wreck|jelly|anchor --task TASK --source FILE --output DIR --game DIR [--inspect] [--open-hold]
"""
import argparse,importlib.util,json,math,struct,sys,hashlib
from pathlib import Path
import bpy
from mathutils import Vector

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
helpers=module('abyss_helpers','prepare-abyss-props.py')
preview=module('wildlife_helpers','prepare-swimmers.py').render

def cut(obj,center,size,name):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    cutter=bpy.context.object;cutter.name=name;cutter.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    modifier=obj.modifiers.new(name,'BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
    helpers.apply_modifier(obj,modifier)
    bpy.data.objects.remove(cutter,do_unlink=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--id',choices=['wreck','jelly','anchor'],required=True)
    for name in ['source','output','game']:p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--task',required=True);p.add_argument('--inspect',action='store_true');p.add_argument('--open-hold',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    a.source=a.source.resolve();a.output=a.output.resolve();a.game=a.game.resolve()
    a.output.mkdir(parents=True,exist_ok=True);a.game.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert objects
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix;o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    lo,hi=helpers.bounds(obj);original=list(hi-lo)
    if a.inspect:
        center=(lo+hi)/2;span=max(hi-lo)
        for v in obj.data.vertices:v.co=(v.co-center)/span
        obj.data.update();preview(obj,a.output/(a.id+'-source.png'));preview(obj,a.output/(a.id+'-source-top.png'),top=True)
        print(json.dumps({'id':a.id,'sourceSizeXYZ':original,'triangles':helpers.triangles(obj)}));return
    if a.id=='wreck':
        # Generated hull arrived diagonal in XY. Fit its long principal axis before scaling.
        points=[v.co for v in obj.data.vertices];mx=sum(v.x for v in points)/len(points);my=sum(v.y for v in points)/len(points)
        xx=sum((v.x-mx)**2 for v in points);yy=sum((v.y-my)**2 for v in points);xy=sum((v.x-mx)*(v.y-my) for v in points)
        obj.rotation_euler.z=math.pi/2-math.atan2(2*xy,xx-yy)/2
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    helpers.normalize(obj)
    if a.id=='wreck':
        lo,hi=helpers.bounds(obj)
        for v in obj.data.vertices:v.co.x*=5/3.2/(hi.x-lo.x);v.co.y*=18/3.2/(hi.y-lo.y)
        obj.data.update()
    if a.open_hold:
        assert a.id=='wreck'
        lo,hi=helpers.bounds(obj);width=hi.x-lo.x;length=hi.y-lo.y
        # An open central cargo hold and starboard break survive imperfect generated interiors.
        cut(obj,(0,0,0.85),(width*.57,length*.48,1.35),'Open central cargo hold')
        cut(obj,(width*.5,0,0.80),(width,length*.28,1.25),'Open starboard swimming entrance')
    before=helpers.triangles(obj);target={'wreck':19000,'jelly':7000,'anchor':6000}[a.id]
    if before>target:
        m=obj.modifiers.new('Game triangle budget','DECIMATE');m.ratio=(target-80)/before;m.use_collapse_triangulate=True;helpers.apply_modifier(obj,m)
    helpers.apply_modifier(obj,obj.modifiers.new('Explicit triangles','TRIANGULATE'));obj.data.validate(clean_customdata=True);obj.data.update()
    helpers.normalize(obj)
    assert obj.data.uv_layers.active
    used={poly.material_index for poly in obj.data.polygons};materials={obj.data.materials[i] for i in used};assert len(materials)==1
    material=next(iter(materials));obj.data.materials.clear();obj.data.materials.append(material)
    for poly in obj.data.polygons:poly.material_index=0;poly.use_smooth=a.id=='jelly'
    bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    for name,value in [('Metallic',0),('Alpha',1)]:
        for link in list(bsdf.inputs[name].links):material.node_tree.links.remove(link)
        bsdf.inputs[name].default_value=value
    images=[];texture_dir=a.output/'textures'/a.id;texture_dir.mkdir(parents=True,exist_ok=True)
    for i,image in enumerate(sorted({n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image},key=lambda im:im.name)):
        size=list(image.size);limit=1024
        if max(size)>limit:image.scale(round(size[0]*limit/max(size)),round(size[1]*limit/max(size)))
        space=image.colorspace_settings.name;image.file_format='PNG';image.filepath_raw=str((texture_dir/(a.id+f'-{i}.png')).resolve());image.save()
        if image.packed_file:image.unpack(method='REMOVE')
        image.reload();image.colorspace_settings.name=space;image.pack();images.append({'source':size,'size':list(image.size),'space':space})
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    obj.name='Lux3D '+a.id;obj['providerTaskId']=a.task
    destination=(a.game/(a.id+'.glb')).resolve()
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_animations=False,export_morph=False,export_yup=True,export_image_format='AUTO',export_cameras=False,export_lights=False)
    raw=destination.read_bytes();count=struct.unpack_from('<I',raw,12)[0];wire=json.loads(raw[20:20+count])
    assert len(wire['nodes'])==len(wire['meshes'])==len(wire['meshes'][0]['primitives'])==1
    assert all(im.get('mimeType')=='image/png' and 'bufferView' in im for im in wire['images'])
    assert helpers.triangles(obj)<=target
    lo,hi=helpers.bounds(obj)
    receipt={'id':a.id,'taskId':a.task,'sourceSizeXYZ':original,'triangles':helpers.triangles(obj),'trianglesBefore':before,'sizeGameXYZ':[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y],
        'openHoldApplied':a.open_hold,'images':images,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    if a.id=='wreck':
        rays=[]
        for z in [.3,.55,.8]:
            hit=obj.ray_cast(Vector((hi.x+1,0,z)),Vector((-1,0,0)),distance=hi.x+1)[0]
            rays.append({'height':z,'openFromStarboard':not hit})
        receipt['starboardPassage']=rays
    preview(obj,a.output/(a.id+'-preview.png'));preview(obj,a.output/(a.id+'-top.png'),top=True)
    bpy.ops.wm.save_as_mainfile(filepath=str((a.output/(a.id+'.blend')).resolve()),compress=True)
    (a.output/(a.id+'-preparation.json')).write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt))

if __name__=='__main__':main()
