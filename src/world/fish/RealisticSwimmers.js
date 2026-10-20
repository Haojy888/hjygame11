import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from '../../engine/index.js';
import { GPU } from '../../engine/gpu/GPU.js';
import { Texture } from '../../engine/gpu/Texture.js';
import { generateMipmaps } from '../../engine/gpu/Mipmaps.js';
import { loadGLB, decodeImage } from '../../engine/loaders/GLTF.js';
import { ReefBatch } from '../reef/ReefBatch.js';
import { createSwimMaterial } from './FishMaterial.js';
import { PART } from './FishGeometry.js';
import { bandFade } from '../../materials/LODFade.js';
import { FISH_IDS } from '../../game/FishTable.js';

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/creatures/';
const FILES = { turtle: 'green-turtle', eagleRay: 'spotted-eagle-ray' };
const FISH = new Set( FISH_IDS );
const FISH_BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/fish-schools/';

// Blender bakes each animal into the same +Z nose / +Y back frame as CreatureGeometry.
export function swimmerGeometry( gltf, species ) {

	if ( ( ! Object.hasOwn( FILES, species ) && ! FISH.has( species ) ) || gltf.nodes.length !== 1 || gltf.meshes.length !== 1 || gltf.meshes[ 0 ].length !== 1 ) throw new Error( 'Expected a prepared swimmer' );
	const p = gltf.meshes[ 0 ][ 0 ], A = p.attributes, node = gltf.nodes[ 0 ];
	if ( p.mode !== 4 || ! p.indices || p.indices.length / 3 > 14000 ) throw new Error( 'Invalid swimmer triangle budget' );
	if ( FISH.has( species ) && p.indices.length / 3 > 6100 ) throw new Error( 'Invalid school fish triangle budget' );
	const geometry = new BufferGeometry();
	for ( const [ name, key, size ] of [ [ 'position', 'POSITION', 3 ], [ 'normal', 'NORMAL', 3 ], [ 'uv', 'TEXCOORD_0', 2 ] ] ) {

		if ( ! A[ key ]?.array.every( Number.isFinite ) ) throw new Error( 'Missing or invalid swimmer attribute' );
		geometry.setAttribute( name, new BufferAttribute( A[ key ].array.slice(), size ) );

	}
	const pos = geometry.attributes.position;
	if ( geometry.attributes.normal.count !== pos.count || geometry.attributes.uv.count !== pos.count || p.indices.some( ( i ) => i >= pos.count ) ) throw new Error( 'Invalid swimmer indices' );
	geometry.setIndex( new BufferAttribute( p.indices.slice(), 1 ) );
	geometry.applyMatrix4( new Matrix4().compose( new Vector3( ...node.t ), new Quaternion( ...node.r ), new Vector3( ...node.s ) ) );
	geometry.computeBoundingBox(); geometry.computeBoundingSphere();
	const size = geometry.boundingBox.getSize( new Vector3() );
	if ( ! [ size.x, size.y, size.z ].every( ( n ) => n > 0 && n < 3 ) ) throw new Error( 'Invalid swimmer scale' );
	const data = new Float32Array( pos.count * 4 );
	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
		let part, reach, id;
		if ( FISH.has( species ) ) {

			// The shared vertex shader bends the textured body and tail for each individual.
			part = PART.BODY; reach = 0; id = 0;

		} else if ( species === 'eagleRay' ) {

			part = z < - 0.08 && Math.abs( x ) < 0.065 ? PART.WHIP : PART.DISC;
			reach = Math.min( 1, Math.max( 0, ( Math.abs( x ) - 0.065 ) / 0.435 ) );
			id = y >= 0 ? 1 : - 1;

		} else {

			const front = z > - 0.18, root = front ? 0.29 : 0.18;
			const outsideShell = ( x / 0.27 ) ** 2 + ( ( z + 0.02 ) / 0.36 ) ** 2 > 1;
			const flipper = Math.abs( x ) > root && y < 0.035 && outsideShell;
			part = flipper ? PART.FLIPPER : PART.CARAPACE;
			reach = flipper ? Math.min( 1, Math.max( 0, ( Math.abs( x ) - root ) / ( front ? 0.38 : 0.20 ) ) ) : 0;
			id = front ? 0 : 2;

		}
		data.set( [ Math.max( 0, Math.min( 1, 0.5 - z ) ), part, reach, id ], i * 4 );

	}
	geometry.setAttribute( 'aData', new BufferAttribute( data, 4 ) );
	return geometry;

}

export class RealisticSwimmers {

	constructor( parent ) {

		this.parent = parent; this.pending = new Map(); this.models = new Map(); this.disposed = false;
		this.time = 0; this.loadingFish = 0; this.fishCount = 0;

	}

	load( species ) {

		if ( this.disposed || ( ! Object.hasOwn( FILES, species ) && ! FISH.has( species ) ) ) return Promise.resolve( false );
		if ( this.pending.has( species ) ) return this.pending.get( species );
		const fish = FISH.has( species );
		if ( fish ) {

			// One download at a time; at most six fish texture sets remain on the GPU.
			if ( this.loadingFish ) return Promise.resolve( false );
			const resident = [ ...this.models ].filter( ( [ id ] ) => FISH.has( id ) );
			if ( resident.length >= 6 ) {

				const oldest = resident.sort( ( a, b ) => a[ 1 ].lastUsed - b[ 1 ].lastUsed )[ 0 ];
				if ( this.time - oldest[ 1 ].lastUsed < 8 ) return Promise.resolve( false );
				this._remove( ...oldest );

			}
			this.loadingFish ++;

		}
		const textures = [];
		const promise = loadGLB( ( fish ? FISH_BASE + species : BASE + FILES[ species ] ) + '.glb' ).then( async ( gltf ) => {

			const geometry = swimmerGeometry( gltf, species ), primitive = gltf.meshes[ 0 ][ 0 ];
			const gm = gltf.materials[ primitive.material ] || {}, pbr = gm.pbrMetallicRoughness || {};
			if ( ! pbr.baseColorTexture ) throw new Error( 'Swimmer has no skin texture' );
			const bindings = {};
			for ( const [ key, info, srgb ] of [ [ 'swimAlbedo', pbr.baseColorTexture, true ], [ 'swimOrm', pbr.metallicRoughnessTexture, false ], [ 'swimNormal', gm.normalTexture, false ] ] ) {

				if ( ! info ) continue;
				const image = gltf.images[ gltf.textures[ info.index ]?.source ];
				if ( ! image?.bytes ) throw new Error( 'Missing embedded swimmer texture' );
				const px = await decodeImage( image.bytes, image.mimeType );
				if ( this.disposed ) throw new Error( 'Swimmer disposed while loading' );
				const texture = new Texture( { label: species + ':' + key, width: px.width, height: px.height, format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm', data: px.data, mips: true, sampler: 'anisoRepeat' } );
				textures.push( texture ); texture.getGPU(); generateMipmaps( texture ); bindings[ key ] = { texture };

			}
			// School fish share geometry/textures and retain their own simulation records.
			const batch = new ReefBatch( 'Realistic.' + species, [ { geometry } ], { maxInstances: fish ? 8 : 1, dynamic: true, fade: true } );
			batch.geometry.setAttribute( 'uv', geometry.attributes.uv ); batch.fadeGeometry.setAttribute( 'uv', geometry.attributes.uv );
			const material = createSwimMaterial( batch, { fade: true } );
			Object.assign( material.bindings, bindings );
			material.name = 'Realistic swimmer: ' + species;
			if ( pbr.baseColorFactor ) material.color.setRGB( ...pbr.baseColorFactor.slice( 0, 3 ) );
			material.surface = /* wgsl */`
				if ( ! lodFadeVisible( in.pixel, in.vs.vFishFade.x, false ) ) { discard; }
				s.albedo *= textureSample( swimAlbedo, smpAnisoRepeat, in.uv ).rgb;
				s.roughness = ${ bindings.swimOrm ? 'clamp( textureSample( swimOrm, smpAnisoRepeat, in.uv ).g, 0.4, 0.88 )' : '0.62' };
				${ bindings.swimNormal ? 's.normal = perturbNormalByMap( in.P, in.N, in.uv, textureSample( swimNormal, smpAnisoRepeat, in.uv ).xyz * 2.0 - 1.0 );' : '' }
				s.alpha = 1.0; s.metalness = 0.0; s.specularIntensity = 0.3;`;
			const mesh = batch.createFadeMesh( material );
			batch.begin(); batch.commit();
			this.parent.add( mesh ); this.models.set( species, { batch, material, mesh, textures, age: 0, count: 0, lastUsed: this.time } );
			return true;

		} ).catch( ( error ) => {

			for ( const texture of textures ) texture.destroy();
			console.warn( 'RealisticSwimmers: keeping original ' + species, error ); return false;

		} ).finally( () => { if ( fish ) this.loadingFish --; } );
		this.pending.set( species, promise ); return promise;

	}

	begin( dt = 0 ) {

		this.time += Math.min( Math.max( dt, 0 ), 0.1 ); this.fishCount = 0;
		for ( const model of this.models.values() ) { model.batch.begin(); model.count = 0; model.age += Math.min( Math.max( dt, 0 ), 0.1 ); }

	}

	add( species, record, offset, distance, pixels = Infinity ) {

		const fish = FISH.has( species );
		if ( this.disposed || ( ! Object.hasOwn( FILES, species ) && ! fish ) || distance >= ( fish ? 12 : 24 ) || ! GPU.device ) return 0;
		if ( fish && ( pixels <= 32 || this.fishCount >= 24 ) ) return 0;
		if ( ! this.pending.has( species ) ) this.load( species );
		const model = this.models.get( species );
		if ( ! model || model.count >= ( fish ? 8 : 1 ) ) return 0;
		const fade = ( 1 - bandFade( distance, fish ? 6 : 12, fish ? 12 : 20 ) ) * ( fish ? bandFade( pixels, 32, 72 ) : 1 ) * Math.min( 1, model.age / 1.2 );
		if ( fade <= 0 ) return 0;
		model.batch.data.set( record.subarray( offset, offset + 16 ), model.count * 16 );
		model.batch.addFade( 0, model.count, fade, false ); model.count ++; model.lastUsed = this.time;
		if ( fish ) this.fishCount ++;
		return fade;

	}

	end() {

		for ( const model of this.models.values() ) { model.batch.commit(); model.batch.dataAttr.needsUpdate = true; }

	}

	_remove( species, model ) {

		model.mesh.removeFromParent(); model.batch.dispose(); model.material.dispose();
		for ( const texture of model.textures ) texture.destroy();
		this.models.delete( species ); this.pending.delete( species );

	}

	dispose() {

		this.disposed = true;
		for ( const [ species, model ] of this.models ) this._remove( species, model );

	}

}
