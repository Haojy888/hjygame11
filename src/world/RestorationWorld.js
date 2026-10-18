import { Group, Mesh, InstancedMesh, Vector3, Matrix4, Quaternion } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { GeoKit, box, cylinder, sphere, rod, torus } from './boat/GeoKit.js';
import { createStaghorn } from './reef/ReefGeometry.js';
import { fishGeometry } from './fish/FishGeometry.js';
import { SPECIES } from './fish/FishSpecies.js';
import { mulberry32 } from '../util/Noise.js';
import { RESTORATION_SITES } from '../game/Voyage.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
function mesh( name, parts, parent ) {

	const kit = new GeoKit();
	for ( const [ geometry, color ] of parts ) kit.add( 'prop', geometry, { color, rough: 0.85 } );
	const result = new Mesh( kit.merged( 'prop' ), new Material( { name, vertexColors: true, roughness: 0.85,
		surface: 's.albedo *= 0.85 + perlin3( in.P * 12.0 ) * 0.22;' } ) );
	result.name = name; result.castShadow = true; parent.add( result ); return result;

}

export class RestorationWorld {

	constructor( app, parent ) {

		this.app = app; this.sites = new Map(); this.time = 0;
		this.matrix = new Matrix4(); this.q = new Quaternion(); this.scale = V( 1, 1, 1 ); this.pos = V(); this.up = V( 0, 1, 0 );
		const fish = fishGeometry( SPECIES.silverside, { lod: 2 } ).scale( 0.6, 0.6, 0.6 );
		const fishMat = new Material( { name: '复苏潜点的小鱼', color: 0x90afb0, roughness: 0.4, metalness: 0.12,
			vertex: 'v.position.x += sin( frame.time * 9.0 + v.position.z * 14.0 ) * max( 0.0, -v.position.z ) * 0.16;' } );
		for ( const site of RESTORATION_SITES ) {

			const root = new Group(); root.name = site.name;
			const floor = app.terrainData.heightAt( site.x, site.z ); root.position.set( site.x, floor, site.z ); parent.add( root );
			const ground = ( x, z ) => app.terrainData.heightAt( site.x + x, site.z + z ) - floor;
			const before = new Group(), after = new Group(); root.add( before, after );
			let targetY = 0.75;
			if ( site.id === 'net' ) {

				const rocks = [];
				for ( const [ x, z ] of [ [ - 2, - 1.2 ], [ 1.9, 1.2 ], [ - 1.8, 1.4 ] ] ) rocks.push( [ sphere( 0.55, 10, 7 ).scale( 1.4, 0.65, 1 ).translate( x, ground( x, z ) + 0.24, z ), 0x778076 ] );
				mesh( '压网的旧礁石', rocks, root );
				const parts = [], node = ( i, j ) => { const x = - 1.8 + i * 0.36, z = - 1.2 + j * 0.3; return V( x, ground( x, z ) + 0.20 + Math.sin( i / 10 * Math.PI ) * ( 0.55 + j * 0.05 ), z ); };
				for ( let i = 0; i <= 10; i ++ ) for ( let j = 0; j <= 8; j ++ ) {

					if ( i < 10 ) parts.push( [ rod( node( i, j ), node( i + 1, j ), 0.013, 4 ), 0x506c5e ] );
					if ( j < 8 ) parts.push( [ rod( node( i, j ), node( i, j + 1 ), 0.013, 4 ), 0x506c5e ] );
					if ( j === 0 && i % 2 === 0 ) parts.push( [ sphere( 0.075, 8, 5 ).translate( ...node( i, j ).toArray() ), 0xbcaa7d ] );

				}
				mesh( '废弃幽灵网与旧浮子', parts, before );

			} else if ( site.id === 'litter' ) {

				const parts = [], rng = mulberry32( 142012 );
				for ( let i = 0; i < 16; i ++ ) {

					const x = ( rng() - 0.5 ) * 3.4, z = ( rng() - 0.5 ) * 2.6, y = ground( x, z ) + 0.12;
					parts.push( [ cylinder( i % 2 ? 0.08 : 0.12, 0.12, 0.35, 10 ).rotateZ( 1.35 ).rotateY( i * 1.7 ).translate( x, y, z ), i % 2 ? 0x668e89 : 0x96795c ] );
					if ( i % 2 ) parts.push( [ cylinder( 0.037, 0.045, 0.13, 8 ).rotateZ( 1.35 ).rotateY( i * 1.7 ).translate( x - Math.cos( i * 1.7 ) * 0.2, y + 0.04, z + Math.sin( i * 1.7 ) * 0.2 ), 0x62877e ] );

				}
				parts.push( [ torus( 0.45, 0.09, 8, 20 ).rotateX( Math.PI / 2 ).translate( 0.3, ground( 0.3, 0 ) + 0.1, 0 ), 0x3f4e48 ] );
				mesh( '散落的旧瓶罐与废轮胎', parts, before );

			} else {

				const feet = [ [ - 1.25, - 0.85 ], [ 1.25, - 0.85 ], [ - 1.25, 0.85 ], [ 1.25, 0.85 ] ];
				const top = Math.max( ...feet.map( ( [ x, z ] ) => ground( x, z ) ), 0 ) + 0.6; targetY = top + 0.35;
				const plates = [], frame = [], corals = [], rng = mulberry32( 118018 );
				for ( const [ x, z ] of feet ) {

					const y = ground( x, z ); plates.push( [ cylinder( 0.28, 0.34, 0.12, 12 ).translate( x, y + 0.06, z ), 0x9b9f86 ] );
					frame.push( [ rod( V( x, y + 0.08, z ), V( x, top, z ), 0.035, 8 ), 0x6b8b84 ] );

				}
				for ( const z of [ - 0.85, 0, 0.85 ] ) frame.push( [ rod( V( - 1.25, top, z ), V( 1.25, top, z ), 0.025, 8 ), 0x73978f ] );
				for ( const x of [ - 1.25, - 0.6, 0, 0.6, 1.25 ] ) frame.push( [ rod( V( x, top, - 0.85 ), V( x, top, 0.85 ), 0.025, 8 ), 0x73978f ] );
				for ( let i = 0; i < 8; i ++ ) {

					const x = - 0.9 + i % 4 * 0.6, z = i < 4 ? - 0.48 : 0.48;
					corals.push( [ cylinder( 0.1, 0.12, 0.07, 10 ).translate( x, top + 0.04, z ), 0xb8b196 ],
						[ createStaghorn( rng, 1 ).scale( 0.65, 0.65, 0.65 ).translate( x, top + 0.08, z ), i % 2 ? 0xb38f71 : 0xc4ae8b ] );

				}
				mesh( '苗圃预埋基座', plates, root ); mesh( '固定的珊瑚苗架', frame, after ); mesh( '八株小珊瑚', corals, after );
				mesh( '待固定的苗架工具箱', [ [ box( 0.7, 0.3, 0.45 ).translate( 0, 0.15, 0 ), 0x7e9381 ], [ box( 0.48, 0.025, 0.02 ).translate( 0, 0.2, - 0.23 ), 0xd0c5a0 ] ], before );

			}
			const school = new InstancedMesh( fish, fishMat, 18 ); school.frustumCulled = false; root.add( school );
			const fishY = Math.max( ...Array.from( { length: 12 }, ( _, i ) => ground( Math.cos( i * Math.PI / 6 ) * 3, Math.sin( i * Math.PI / 6 ) * 3 ) ) ) + 1.2;
			this.sites.set( site.id, { root, before, after, school, fishY, point: V( site.x, floor + targetY, site.z ) } );
			before.visible = after.visible = school.visible = root.visible = false;

		}

	}

	update( dt, restoration ) {

		this.time += dt;
		for ( const [ id, site ] of this.sites ) {

			const done = restoration?.done.includes( id ) || false;
			site.root.visible = this.app.camera.position.distanceToSquared( site.point ) < 110 * 110;
			site.before.visible = ! done; site.after.visible = done; site.school.visible = done;
			if ( ! site.root.visible || ! done ) continue;
			for ( let i = 0; i < 18; i ++ ) {

				const angle = this.time * 0.35 + i * 2.4, r = 1.4 + i % 4 * 0.4;
				this.pos.set( Math.cos( angle ) * r, site.fishY + Math.sin( angle * 1.7 ) * 0.25, Math.sin( angle ) * r );
				this.q.setFromAxisAngle( this.up, - angle ); this.matrix.compose( this.pos, this.q, this.scale ); site.school.setMatrixAt( i, this.matrix );

			}
			site.school.instanceMatrix.needsUpdate = true;

		}

	}

}
