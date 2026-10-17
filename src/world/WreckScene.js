import { Group, Mesh, InstancedMesh, Matrix4, Vector3, Quaternion } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { GPU } from '../engine/gpu/GPU.js';
import { GeoKit, box, sphere, rod, roundedBox } from './boat/GeoKit.js';
import { AbyssAssets } from './AbyssAssets.js';
import { WRECK_SITE, CAVE_SITE } from '../game/Expedition.js';
import { createMound, createSeagrass, createTubes } from './reef/ReefGeometry.js';
import { stoneMaterial } from './AbyssScene.js';
import { mulberry32 } from '../util/Noise.js';

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/expedition/';
const UP = new Vector3( 0, 1, 0 );
const JELLY_VERTEX = /* wgsl */`
	let seed = v.model[3].x * 0.43 + v.model[3].z * 0.17;
	let ph = frame.time * 1.65 + seed;
	let old = ( frame.time - frame.dt ) * 1.65 + seed;
	let bell = smoothstep( 0.48, 0.85, v.position.y );
	let trail = 1.0 - smoothstep( 0.15, 0.65, v.position.y );
	let offset = vec3f( sin( ph + v.position.y * 3.0 ) * trail * 0.055 + v.position.x * sin( ph ) * bell * 0.10,
		sin( ph ) * bell * 0.035, cos( ph + v.position.y * 2.0 ) * trail * 0.045 + v.position.z * sin( ph ) * bell * 0.10 );
	let previous = vec3f( sin( old + v.position.y * 3.0 ) * trail * 0.055 + v.position.x * sin( old ) * bell * 0.10,
		sin( old ) * bell * 0.035, cos( old + v.position.y * 2.0 ) * trail * 0.045 + v.position.z * sin( old ) * bell * 0.10 );
	v.prevWorldOffset = ( v.prevModel * vec4f( previous - offset, 0.0 ) ).xyz;
	v.position += offset;`;

export class WreckScene {

	constructor( { scene, terrain, colliders = null } ) {

		this.terrain = terrain; this.time = 0; this.ready = new Set();
		this.group = new Group(); this.group.name = '归潮号与潮光岩洞'; scene.add( this.group );
		this.position = new Vector3( WRECK_SITE.x, terrain.heightAt( WRECK_SITE.x, WRECK_SITE.z ), WRECK_SITE.z );
		this.cavePosition = new Vector3( CAVE_SITE.x, terrain.heightAt( CAVE_SITE.x, CAVE_SITE.z ), CAVE_SITE.z );
		this.targets = {
			bow: this.position.clone().add( new Vector3( 0, 2.0, - 8 ) ),
			log: this.position.clone().add( new Vector3( 0, 0.66, 0 ) ),
			compass: new Vector3( CAVE_SITE.x, terrain.heightAt( CAVE_SITE.x, CAVE_SITE.z + 10 ) + 1.1, CAVE_SITE.z + 10 ),
		};
		const kit = new GeoKit(), rng = mulberry32( 205233 );
		const stones = Array.from( { length: 4 }, () => createMound( rng, 2, 'rock' ) );
		const stone = ( index, w, h, d ) => {

			const geometry = stones[ index % stones.length ].clone(); geometry.computeBoundingBox();
			const b = geometry.boundingBox, size = b.getSize( new Vector3() );
			return geometry.translate( - ( b.min.x + b.max.x ) / 2, - ( b.min.y + b.max.y ) / 2, - ( b.min.z + b.max.z ) / 2 ).scale( w / size.x, h / size.y, d / size.z );

		};
		const put = ( name, geometry, x, z, y = 0, color = 0x746c54 ) => {

			geometry.translate( x, 0, z ); const p = geometry.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + terrain.heightAt( p.getX( i ), p.getZ( i ) ) + y );
			geometry.computeVertexNormals(); kit.add( name, geometry, { color, rough: 0.92 } );

		};
		// Open skeletal hull is always available. The generated hull takes over after load.
		for ( let i = - 4; i <= 4; i ++ ) {

			const z = this.position.z + i * 1.8, width = 2.4 - Math.abs( i ) * 0.23;
			for ( const side of [ - 1, 1 ] ) {

				if ( side === 1 && Math.abs( i ) < 2 ) continue;
				put( 'hull', rod( new Vector3( side * width * 0.6, 0.1, 0 ), new Vector3( side * width, 2.7, 0 ), 0.13, 7 ), this.position.x, z );
			}

		}
		for ( const side of [ - 1, 1 ] ) for ( const z of [ - 6, 6 ] ) put( 'hull', roundedBox( 0.16, 1.1, 4.8, 0.04, 1 ), this.position.x + side * 2.2, this.position.z + z, 1.0 );
		put( 'hull', box( 0.23, 0.20, 17 ), this.position.x, this.position.z, 0.13 );
		if ( colliders ) for ( const side of [ - 1, 1 ] ) for ( const z of [ - 6, 6 ] ) {

			const center = new Vector3( this.position.x + side * 2.3, terrain.heightAt( this.position.x + side * 2.3, this.position.z + z ) + 1.4, this.position.z + z );
			colliders.addBox( center, new Vector3( 0.19, 1.4, 2.5 ), 0, { tag: 'wreck-ribs' } );

		}
		// Rock walls and offset roof shelves leave a 4m wide, >4m high corridor and a skylight.
		for ( const z of [ - 7, 0, 7 ] ) for ( const side of [ - 1, 1 ] ) {

			const x = CAVE_SITE.x + side * 4.3, wz = CAVE_SITE.z + z;
			put( 'rock', stone( z + 8 + side, 4.4, 7.4, 9.4 ).translate( 0, 3.0, 0 ), x, wz, - 0.2, 0x6c8077 );
			put( 'rock', stone( z + 9 + side, 4.8, 2.1, 9.6 ), CAVE_SITE.x + side * 2.65, wz, 6.25, 0x77867b );
			colliders?.addBox( new Vector3( x, terrain.heightAt( x, wz ) + 3, wz ), new Vector3( 1.8, 3.3, 4.4 ), 0, { tag: 'cave-wall' } );
			colliders?.addBox( new Vector3( CAVE_SITE.x + side * 2.65, terrain.heightAt( CAVE_SITE.x + side * 2.65, wz ) + 6.25, wz ), new Vector3( 2.1, 0.8, 4.4 ), 0, { tag: 'cave-roof' } );

		}
		const plants = [ createSeagrass( rng, 1 ), createTubes( rng, 1, true ) ];
		for ( let i = 0; i < 144; i ++ ) {

			const cave = i % 2, center = cave ? CAVE_SITE : WRECK_SITE;
			const x = center.x + ( i % 3 ? - 1 : 1 ) * ( 6.1 + rng() * 7 ), z = center.z + ( rng() - 0.5 ) * 29;
			const scale = 1.6 + rng() * 1.7;
			put( 'life', plants[ i % 3 ? 0 : 1 ].clone().scale( scale, scale, scale ).rotateY( rng() * Math.PI * 2 ), x, z, 0, i % 3 ? 0x4a8273 : 0x9f8f79 );
			if ( i % 4 === 0 ) put( 'rock', stone( i, 0.8 + rng() * 1.4, 0.4 + rng() * 0.8, 1.1 + rng() ).rotateY( rng() * Math.PI ).translate( 0, 0.18, 0 ), x, z, 0, 0x778477 );

		}
		this.fallback = {};
		for ( let i = 0; i < 48; i ++ ) {

			put( 'life', sphere( 0.018 + rng() * 0.012, 5, 3 ), this.position.x + ( rng() - 0.5 ) * 28, this.position.z + ( rng() - 0.5 ) * 25, 2 + rng() * 5, 0x447ca0 );

		}
		for ( const name of [ 'hull', 'rock', 'life' ] ) {

			const material = name === 'rock' ? stoneMaterial() : new Material( { name: '探索场景:' + name, vertexColors: true, roughness: 0.9, side: name === 'life' ? 'double' : 'front',
				surface: 's.albedo *= 0.8 + perlin3( in.P * 3.0 ) * 0.18; s.roughness = 0.9;' + ( name === 'life' ? ' if ( in.color.b > in.color.g * 1.12 ) { let pulse = sin( frame.time * 0.4 + in.P.x ); s.emissive = vec3f( 0.035, 0.30, 0.42 ) * frame.night * ( 0.3 + 0.7 * pulse * pulse ); }' : '' ) } );
			const mesh = new Mesh( kit.merged( name ), material ); mesh.castShadow = name !== 'life';
			this.group.add( mesh ); this.fallback[ name ] = mesh;

		}
		// Small concrete props identify clues in both the fallback and generated hull.
		const crate = new Mesh( box( 0.62, 0.60, 0.48 ), new Material( { color: 0x6b6653, roughness: 0.92 } ) );
		crate.position.copy( this.position ).add( new Vector3( 0, 0.3, 0 ) ); this.group.add( crate );
		for ( const [ name, point ] of Object.entries( this.targets ) ) {

			const mesh = new Mesh( name === 'log' ? box( 0.55, 0.1, 0.38 ) : sphere( 0.16, 10, 6 ), new Material( { name: '线索:' + name, color: name === 'log' ? 0x9a8061 : 0xbfa278, roughness: 0.8, emissive: 0x070906 } ) );
			mesh.position.copy( point ); this.group.add( mesh );

		}
		this.jellyHomes = Array.from( { length: 6 }, ( _, i ) => new Vector3( this.position.x + 10 + Math.sin( i * 2.4 ) * 8, this.position.y + 5 + i % 3, this.position.z + Math.cos( i * 2.4 ) * 10 ) );
		this.jellyPositions = this.jellyHomes.map( ( p ) => p.clone() );
		const placements = [
			{ id: 'wreck', position: this.position.clone(), rotation: 0, height: 3.2, alignToTerrain: false },
			{ id: 'anchor', position: new Vector3( this.position.x - 8, terrain.heightAt( this.position.x - 8, this.position.z - 4 ), this.position.z - 4 ), rotation: 0.7, height: 1.4 },
			...this.jellyHomes.map( ( position, i ) => ( { id: 'jelly', position: position.clone(), rotation: i, height: 1.1 + i % 3 * 0.13, alignToTerrain: false } ) ),
		];
		this.assets = new AbyssAssets( { scene: this.group, placements, terrain, ids: [ 'wreck', 'anchor', 'jelly' ], base: BASE } );
		const jellyKit = new GeoKit();
		jellyKit.add( 'jelly', sphere( 0.32, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.60 ).translate( 0, 0.8, 0 ) );
		for ( let i = 0; i < 10; i ++ ) {

			const a = i / 10 * Math.PI * 2, x = Math.sin( a ) * 0.22, z = Math.cos( a ) * 0.22;
			jellyKit.add( 'jelly', rod( new Vector3( x, 0.73, z ), new Vector3( x * 1.3, 0.06, z * 1.3 ), 0.009, 5 ) );

		}
		const jm = new Material( { name: '水母回退', color: 0xabcfd4, roughness: 0.5, transparent: true, depthWrite: false, side: 'double', vertex: JELLY_VERTEX,
			surface: 's.alpha = 0.43; s.emissive = vec3f( 0.015, 0.055, 0.07 ) * ( 0.2 + frame.night * 0.8 );' } );
		this.jellyFallback = new InstancedMesh( jellyKit.merged( 'jelly' ), jm, 6 );
		this.jellyFallback.frustumCulled = false; this.group.add( this.jellyFallback );
		this._matrix = new Matrix4(); this._quat = new Quaternion(); this._scale = new Vector3();
		this.update( 0, { position: new Vector3() } );

	}

	update( dt, camera ) {

		this.time += Number.isFinite( dt ) ? Math.min( Math.max( dt, 0 ), 0.1 ) : 0;
		const near = camera.position.distanceTo( this.position ) < 180 || camera.position.distanceTo( this.cavePosition ) < 180;
		this.group.visible = near; this.assets.group.visible = near;
		if ( near && GPU.device ) for ( const id of this.assets.ids ) if ( ! this.assets.pending.has( id ) ) this.assets.load( id );
		for ( const [ id, mesh ] of this.assets.models ) if ( ! this.ready.has( id ) ) {

			if ( id === 'wreck' ) {

				// A long broken hull follows the curved seabed; seating it as a rigid
				// upright prop would bury the whole hold on this uneven patch.
				const p = mesh.geometry.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) {

					const ground = this.terrain.heightAt( this.position.x + p.getX( i ) * 3.2, this.position.z + p.getZ( i ) * 3.2 );
					p.setY( i, p.getY( i ) + ( ground - this.position.y - 0.08 ) / 3.2 );

				}
				p.needsUpdate = true; mesh.geometry.computeVertexNormals();
				mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
				mesh.computeBoundingBox(); mesh.computeBoundingSphere();
				this.fallback.hull.visible = false;

			}
			if ( id === 'jelly' ) {

				mesh.material.vertex = JELLY_VERTEX; mesh.material.surface += '\ns.alpha = 0.52; s.emissive = s.albedo * ( 0.015 + frame.night * 0.18 );';
				mesh.material.transparent = true; mesh.material.depthWrite = false; mesh.material.side = 'double';
				mesh.staticVelocity = false; mesh.frustumCulled = false; mesh.material.needsUpdate = true;
				this.jellyFallback.visible = false;

			}
			this.ready.add( id );

		}
		for ( let i = 0; i < this.jellyPositions.length; i ++ ) {

			const p = this.jellyPositions[ i ], home = this.jellyHomes[ i ];
			p.copy( home ).add( new Vector3( Math.sin( this.time * 0.13 + i ) * 1.5, Math.sin( this.time * 0.7 + i ) * 0.3, Math.cos( this.time * 0.11 + i ) * 1.5 ) );
			p.y = Math.min( - 2.5, Math.max( this.terrain.heightAt( p.x, p.z ) + 2, p.y ) );
			this._quat.setFromAxisAngle( UP, i + Math.sin( this.time * 0.09 + i ) * 0.12 );
			this._matrix.compose( p, this._quat, this._scale.setScalar( 1.1 + i % 3 * 0.13 ) );
			this.jellyFallback.setMatrixAt( i, this._matrix );
			this.assets.models.get( 'jelly' )?.setMatrixAt( i, this._matrix );

		}
		this.jellyFallback.instanceMatrix.needsUpdate = true;
		const real = this.assets.models.get( 'jelly' ); if ( real ) real.instanceMatrix.needsUpdate = true;

	}

}
