import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from '../engine/index.js';
import { GPU } from '../engine/gpu/GPU.js';
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { loadGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { Material } from '../engine/render/Material.js';
import { WORLD } from './WorldLayout.js';

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/abyss/';
const IDS = [ 'vent', 'arch', 'coral' ];
const UP = new Vector3( 0, 1, 0 );

// These three Blender exports have one baked node, one primitive and embedded PBR maps.
// Keep this scene-specific; other glTF assets retain their existing loaders.
export function abyssPropGeometry( gltf ) {

	if ( gltf.nodes.length !== 1 || gltf.nodes[ 0 ].mesh !== 0 || gltf.meshes.length !== 1 || gltf.meshes[ 0 ].length !== 1 ) throw new Error( 'Expected a prepared abyss prop' );
	const p = gltf.meshes[ 0 ][ 0 ], A = p.attributes, n = gltf.nodes[ 0 ];
	if ( p.mode !== 4 || ! p.indices || ! A.POSITION || ! A.NORMAL || ! A.TEXCOORD_0 ) throw new Error( 'Missing abyss geometry or UV' );
	const count = A.POSITION.array.length / 3;
	if ( p.indices.length / 3 > 20000 || A.NORMAL.array.length !== count * 3 || A.TEXCOORD_0.array.length !== count * 2 ) throw new Error( 'Invalid abyss prop size' );
	for ( const key of [ 'POSITION', 'NORMAL', 'TEXCOORD_0' ] ) if ( ! A[ key ].array.every( Number.isFinite ) ) throw new Error( 'Invalid abyss vertex' );
	if ( p.indices.some( ( index ) => index >= count ) ) throw new Error( 'Invalid abyss triangle' );
	const geometry = new BufferGeometry();
	for ( const [ name, field, size ] of [ [ 'position', 'POSITION', 3 ], [ 'normal', 'NORMAL', 3 ], [ 'uv', 'TEXCOORD_0', 2 ] ] ) geometry.setAttribute( name, new BufferAttribute( A[ field ].array.slice(), size ) );
	geometry.setIndex( new BufferAttribute( p.indices.slice(), 1 ) );
	geometry.applyMatrix4( new Matrix4().compose( new Vector3( ...n.t ), new Quaternion( ...n.r ), new Vector3( ...n.s ) ) );
	geometry.computeBoundingBox();
	const box = geometry.boundingBox, height = box.max.y - box.min.y;
	if ( height < 0.001 ) throw new Error( 'Flat abyss prop' );
	geometry.translate( - ( box.min.x + box.max.x ) / 2, - box.min.y, - ( box.min.z + box.max.z ) / 2 ).scale( 1 / height, 1 / height, 1 / height );
	geometry.computeBoundingBox(); geometry.computeBoundingSphere();
	return geometry;

}

export function seatAbyssProp( geometry, placement, terrain = null ) {

	const position = placement.position.clone(), yaw = new Quaternion().setFromAxisAngle( UP, placement.rotation );
	const rotation = terrain ? new Quaternion().setFromUnitVectors( UP, terrain.normalAt( position.x, position.z, new Vector3() ) ).multiply( yaw ) : yaw;
	const matrix = new Matrix4().compose( position, rotation, new Vector3().setScalar( placement.height ) );
	if ( terrain ) {

		// Align to the seabed plane, then bury the entire low rim slightly. A curved
		// seabed can differ from its centre normal; anchoring only the lowest contact
		// would leave the other arch foot floating above the downhill side.
		const p = geometry.attributes.position, point = new Vector3();
		let highest = - Infinity;
		for ( let i = 0; i < p.count; i ++ ) if ( p.getY( i ) < 0.06 ) {

			point.set( p.getX( i ), p.getY( i ), p.getZ( i ) ).applyMatrix4( matrix );
			highest = Math.max( highest, point.y - terrain.heightAt( point.x, point.z ) );

		}
		if ( Number.isFinite( highest ) ) position.y -= highest + 0.10;
		matrix.setPosition( position );

	}
	return { matrix, position };

}

export class AbyssAssets {

	constructor( { scene, placements, colliders = null, terrain = null, ids = IDS, base = BASE } ) {

		this.group = new Group(); this.group.name = '深海遗迹 · Lux3D 景物';
		this.group.visible = false; scene.add( this.group );
		this.placements = placements; this.colliders = colliders; this.terrain = terrain;
		this.ids = ids; this.base = base;
		this.pending = new Map(); this.models = new Map(); this.visible = false;

	}

	load( id ) {

		if ( ! this.ids.includes( id ) ) return Promise.resolve( false );
		if ( this.pending.has( id ) ) return this.pending.get( id );
		const textures = [];
		const promise = loadGLB( this.base + id + '.glb' ).then( async ( gltf ) => {

			const geometry = abyssPropGeometry( gltf );
			const gm = gltf.materials[ gltf.meshes[ 0 ][ 0 ].material ] || {}, pbr = gm.pbrMetallicRoughness || {};
			const bindings = {};
			for ( const [ key, info, srgb ] of [ [ 'propAlbedo', pbr.baseColorTexture, true ], [ 'propOrm', pbr.metallicRoughnessTexture, false ], [ 'propNormal', gm.normalTexture, false ] ] ) {

				if ( ! info ) continue;
				const image = gltf.images[ gltf.textures[ info.index ]?.source ];
				if ( ! image?.bytes ) throw new Error( 'Missing embedded abyss texture' );
				const px = await decodeImage( image.bytes, image.mimeType );
				const texture = new Texture( { label: id + ':' + key, width: px.width, height: px.height, format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm', data: px.data, mips: true, sampler: 'anisoRepeat' } );
				textures.push( texture ); texture.getGPU(); generateMipmaps( texture ); bindings[ key ] = texture;

			}
			const material = new Material( {
				name: '深海景物 · ' + id, color: new Color( ...( pbr.baseColorFactor || [ 1, 1, 1 ] ).slice( 0, 3 ) ),
				textures: bindings, roughness: 0.88, metalness: 0,
				surface: /* wgsl */`
				${ bindings.propAlbedo ? 's.albedo *= textureSample( propAlbedo, smpAnisoRepeat, in.uv ).rgb;' : '' }
				${ bindings.propOrm ? 's.roughness = clamp( 0.58 + textureSample( propOrm, smpAnisoRepeat, in.uv ).g * 0.35, 0.62, 0.95 );' : '' }
				${ bindings.propNormal ? 's.normal = perturbNormalByMap( in.P, in.N, in.uv, textureSample( propNormal, smpAnisoRepeat, in.uv ).xyz * 2.0 - 1.0 );' : '' }
				s.alpha = 1.0; s.metalness = 0.0; s.specularIntensity = 0.25;
				`,
			} );
			const places = this.placements.filter( ( p ) => p.id === id );
			const mesh = new InstancedMesh( geometry, material, places.length );
			mesh.name = '深海景物:' + id; mesh.castShadow = false; mesh.staticVelocity = true;
			for ( let i = 0; i < places.length; i ++ ) {

				const p = places[ i ];
				const seated = seatAbyssProp( geometry, p, p.alignToTerrain === false ? null : this.terrain );
				mesh.setMatrixAt( i, seated.matrix );
				this._collider( id, { ...p, position: seated.position }, geometry.boundingBox );

			}
			mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
			this.group.add( mesh ); this.models.set( id, mesh );
			return true;

		} ).catch( ( error ) => {

			for ( const texture of textures ) texture.destroy();
			console.warn( 'AbyssAssets: keeping base scenery for ' + id, error );
			return false;

		} );
		this.pending.set( id, promise );
		return promise;

	}

	_collider( id, p, box ) {

		if ( ! this.colliders || id === 'coral' ) return;
		const height = p.height, width = ( box.max.x - box.min.x ) * height, depth = ( box.max.z - box.min.z ) * height;
		if ( id === 'vent' ) this.colliders.addCylinder( p.position.x, p.position.z, Math.min( width, depth ) * 0.28, p.position.y, p.position.y + height, { tag: 'abyss-vent' } );
		if ( id !== 'arch' ) return;
		// Three separate volumes preserve a real swimming passage under the lintel.
		for ( const side of [ - 1, 1 ] ) {

			const offset = new Vector3( side * width * 0.39, height * 0.39, 0 ).applyAxisAngle( UP, p.rotation );
			this.colliders.addBox( p.position.clone().add( offset ), new Vector3( width * 0.10, height * 0.39, depth * 0.28 ), p.rotation, { tag: 'abyss-arch-post' } );

		}
		this.colliders.addBox( p.position.clone().add( new Vector3( 0, height * 0.91, 0 ) ), new Vector3( width * 0.49, height * 0.08, depth * 0.28 ), p.rotation, { tag: 'abyss-arch-lintel' } );

	}

	update( dt, camera ) {

		const p = camera.position;
		this.visible = Math.hypot( p.x - WORLD.abyss.center.x, p.z - WORLD.abyss.center.z ) < 205 && p.y < 5;
		this.group.visible = this.visible;
		if ( this.visible && GPU.device ) for ( const id of this.ids ) if ( ! this.pending.has( id ) ) this.load( id );

	}

}
