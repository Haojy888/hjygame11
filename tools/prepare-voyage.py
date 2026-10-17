"""F-drive Blender preparation. Keep cloud originals, UVs and editable packed projects."""
import argparse,hashlib,importlib.util,json,math,struct,sys
from pathlib import Path
import bpy
from mathutils import Vector

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
helpers=module('abyss_helpers','prepare-abyss-props.py')
render=module('preview_helpers','prepare-swimmers.py').render

p=argparse.ArgumentParser();p.add_argument('--id',choices=['station','tender','bell','crew'],required=True)
for key in ['source','output','game']:p.add_argument('--'+key,type=Path,required=True)
p.add_argument('--task',required=True);p.add_argument('--inspect',action='store_true');p.add_argument('--yaw',type=float,default=0)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.source=a.source.resolve();a.output=a.output.resolve();a.game=a.game.resolve();a.output.mkdir(parents=True,exist_ok=True);a.game.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert objects
bpy.ops.object.select_all(action='DESELECT')
for o in objects:
    matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix;o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
if len(objects)>1:bpy.ops.object.join()
obj=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
obj.rotation_mode='XYZ'
lo,hi=helpers.bounds(obj);original=list(hi-lo)
if a.inspect:
    span=max(hi-lo);center=(lo+hi)/2
    for v in obj.data.vertices:v.co=(v.co-center)/span
    obj.data.update();render(obj,a.output/(a.id+'-source.png'));render(obj,a.output/(a.id+'-source-top.png'),top=True)
    print(json.dumps({'id':a.id,'sourceSizeXYZ':original,'triangles':helpers.triangles(obj)}));sys.exit(0)
if a.id=='tender':
    points=[v.co for v in obj.data.vertices];mx=sum(v.x for v in points)/len(points);my=sum(v.y for v in points)/len(points)
    xx=sum((v.x-mx)**2 for v in points);yy=sum((v.y-my)**2 for v in points);xy=sum((v.x-mx)*(v.y-my) for v in points)
    angle=.5*math.atan2(2*xy,xx-yy)
    obj.rotation_euler.z=math.pi/2-angle;bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
if a.yaw:
    obj.rotation_euler.z=math.radians(a.yaw);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
helpers.normalize(obj)
lo,hi=helpers.bounds(obj)
# Blender X,Y,Z -> game X,Z,Y. Preserve unit height for the existing loader.
dimensions={'station':(3.6/4.8,3.2/4.8),'tender':(1.9/1.6,4.5/1.6),'bell':None,'crew':None}[a.id]
if dimensions:
    for v in obj.data.vertices:v.co.x*=dimensions[0]/(hi.x-lo.x);v.co.y*=dimensions[1]/(hi.y-lo.y)
    obj.data.update()
before=helpers.triangles(obj);target={'station':19000,'tender':18000,'bell':6500,'crew':19800}[a.id]
if before>target:
    m=obj.modifiers.new('Game triangle budget','DECIMATE');m.ratio=(target-80)/before;m.use_collapse_triangulate=True;helpers.apply_modifier(obj,m)
helpers.apply_modifier(obj,obj.modifiers.new('Explicit triangles','TRIANGULATE'));obj.data.validate(clean_customdata=True);obj.data.update();helpers.normalize(obj)
assert obj.data.uv_layers.active
used={poly.material_index for poly in obj.data.polygons};materials={obj.data.materials[i] for i in used};assert len(materials)==1
material=next(iter(materials));obj.data.materials.clear();obj.data.materials.append(material)
for poly in obj.data.polygons:poly.material_index=0;poly.use_smooth=a.id!='station'
if a.id=='tender':obj.data.set_sharp_from_angle(angle=math.radians(45))
bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for key,value in [('Metallic',0),('Alpha',1)]:
    for link in list(bsdf.inputs[key].links):material.node_tree.links.remove(link)
    bsdf.inputs[key].default_value=value
images=[];texture_dir=a.output/'textures'/a.id;texture_dir.mkdir(parents=True,exist_ok=True)
for i,image in enumerate(sorted({n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image},key=lambda image:image.name)):
    size=list(image.size)
    limit=2048 if a.id=='crew' and image.colorspace_settings.name=='sRGB' else 1024
    if max(size)>limit:image.scale(round(size[0]*limit/max(size)),round(size[1]*limit/max(size)))
    space=image.colorspace_settings.name;image.file_format='PNG';image.filepath_raw=str(texture_dir/(a.id+f'-{i}.png'));image.save()
    if image.packed_file:image.unpack(method='REMOVE')
    image.reload();image.colorspace_settings.name=space;image.pack();images.append({'source':size,'size':list(image.size),'space':space})
if a.id=='station':
    # The actual cloud shelter has a roof rim but an open centre. Close it locally
    # using the same material atlas; keep its original antenna and window detail.
    color_node=bsdf.inputs['Base Color'].links[0].from_node
    image=color_node.image;pixels=list(image.pixels);width,height=image.size
    candidates=range(0,width*height,max(1,width*height//4096))
    sample=min(candidates,key=lambda i:abs(sum(pixels[i*4:i*4+3])/3-.72)+3*(max(pixels[i*4:i*4+3])-min(pixels[i*4:i*4+3])))
    uv=((sample%width+.5)/width,(sample//width+.5)/height)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.565));roof=bpy.context.object;roof.name='Local closed weather roof'
    roof.scale=(.71,.625,.022);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    roof.data.materials.append(material)
    for loop in roof.data.uv_layers.active.data:loop.uv=uv
    bpy.ops.object.select_all(action='DESELECT');roof.select_set(True);obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;obj.name='Lux3D '+a.id;obj['providerTaskId']=a.task
destination=a.game/(a.id+'.glb')
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_animations=False,export_morph=False,export_yup=True,export_image_format='AUTO',export_cameras=False,export_lights=False)
raw=destination.read_bytes();count=struct.unpack_from('<I',raw,12)[0];wire=json.loads(raw[20:20+count])
assert len(wire['nodes'])==len(wire['meshes'])==len(wire['meshes'][0]['primitives'])==1
assert all(im.get('mimeType')=='image/png' and 'bufferView' in im for im in wire['images'])
assert helpers.triangles(obj)<=target
lo,hi=helpers.bounds(obj)
receipt={'id':a.id,'taskId':a.task,'sourceSizeXYZ':original,'triangles':helpers.triangles(obj),'trianglesBefore':before,'yaw':a.yaw,
    'sizeGameXYZ':[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y],'images':images,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
    'localRepair':'Closed the generated open roof using a small solid panel and the existing atlas.' if a.id=='station' else None}
bpy.ops.wm.save_as_mainfile(filepath=str(a.output/(a.id+'.blend')))
(a.output/(a.id+'-preparation.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
render(obj,a.output/(a.id+'-preview.png'));render(obj,a.output/(a.id+'-top.png'),top=True)
print('VOYAGE_PREPARATION '+json.dumps(receipt))
