import { Group, Mesh, Vector3, Color } from '../../engine/index.js';
import { Material } from '../../engine/render/Material.js';
import { G } from '../../core/Globals.js';
import { GeoKit, sphere, cylinder, tube, loft, slab, paintVertices } from '../boat/GeoKit.js';
import { COASTAL_SITES } from '../../game/ExplorationLandmarks.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const TAU = Math.PI * 2;

function body( profiles, sides ) {

	return loft( profiles.map( ( [ z, rx, ry, y = 0 ] ) => Array.from( { length: sides }, ( _, i ) => {

		const a = i / sides * TAU; return V( Math.cos( a ) * rx, Math.sin( a ) * ry + y, z );

	} ) ), { closed: true } );

}

export function dolphinGeometry( detail = 24 ) {

	const kit = new GeoKit(), dark = new Color( 0x4d6d79 ), pale = new Color( 0xc6d4cc );
	const skin = body( [ [ - 1.32, 0.02, 0.025 ], [ - 1.1, 0.07, 0.09 ], [ - 0.85, 0.13, 0.15 ], [ - 0.5, 0.24, 0.24 ],
		[ - 0.1, 0.32, 0.30 ], [ 0.3, 0.34, 0.31 ], [ 0.62, 0.28, 0.30, 0.035 ], [ 0.82, 0.20, 0.25, 0.04 ],
		[ 0.98, 0.10, 0.085, - 0.04 ], [ 1.30, 0.065, 0.055, - 0.06 ], [ 1.46, 0.01, 0.02, - 0.06 ] ], detail );
	paintVertices( skin, p => dark.clone().lerp( pale, Math.max( 0, Math.min( 1, 0.45 - p.y * 2.6 ) ) ) ); kit.add( 'skin', skin );
	kit.add( 'skin', slab( [ [ - 0.62, 0.20 ], [ - 0.40, 0.73 ], [ - 0.24, 0.66 ], [ - 0.08, 0.30 ], [ 0.17, 0.24 ] ], [], ( z, y, side ) => V( side ? 0.028 : - 0.028, y, z ) ), { color: 0x597986 } );
	for ( const sign of [ - 1, 1 ] ) {

		kit.add( 'skin', slab( [ [ 0.20, 0.48 ], [ 0.39, 0.37 ], [ 0.85, - 0.20 ], [ 0.66, - 0.26 ], [ 0.26, 0.08 ] ], [], ( x, z, side ) => V( sign * x, - 0.12 - x * 0.18 + ( side ? 0.02 : - 0.02 ), z ) ), { color: 0x597986 } );
		kit.add( 'skin', sphere( 0.028, 10, 7 ).translate( sign * 0.19, 0.075, 0.85 ), { color: 0x101e22 } );
		kit.add( 'skin', tube( [ V( sign * 0.025, - 0.085, 1.42 ), V( sign * 0.075, - 0.09, 1.18 ), V( sign * 0.16, - 0.08, 0.88 ), V( sign * 0.2, - 0.05, 0.77 ) ], 0.006, 12, 5 ), { color: 0x263e46 } );

	}
	kit.add( 'skin', slab( [ [ 0, - 1.15 ], [ 0.30, - 1.20 ], [ 0.75, - 1.41 ], [ 0.62, - 1.53 ], [ 0.12, - 1.50 ], [ 0, - 1.40 ],
		[ - 0.12, - 1.50 ], [ - 0.62, - 1.53 ], [ - 0.75, - 1.41 ], [ - 0.30, - 1.20 ] ], [], ( x, z, side ) => V( x, side ? 0.025 : - 0.025, z ) ), { color: 0x587985 } );
	kit.add( 'skin', sphere( 0.027, 10, 6 ).scale( 0.7, 0.22, 1.6 ).translate( 0, 0.338, 0.42 ), { color: 0x263e46 } );
	return kit.merged( 'skin' );

}

function seahorseGeometry() {

	const kit = new GeoKit(), add = ( geometry, color = 0xbd9150 ) => kit.add( 'body', geometry, { color } );
	add( sphere( 0.12, 14, 10 ).scale( 0.72, 1.8, 0.88 ).translate( 0, 0.38, 0 ) );
	add( tube( [ V( 0, 0.49, 0 ), V( 0, 0.64, 0 ), V( 0, 0.72, 0.10 ), V( 0, 0.68, 0.17 ) ], 0.055, 24, 8 ) );
	add( sphere( 0.073, 12, 8 ).scale( 0.7, 1, 1.4 ).translate( 0, 0.69, 0.14 ) );
	add( cylinder( 0.023, 0.029, 0.18, 9 ).rotateX( Math.PI / 2 ).translate( 0, 0.665, 0.27 ) );
	add( tube( [ V( 0, 0.24, 0 ), V( 0, 0.10, - 0.035 ), V( 0, - 0.035, 0.02 ), V( 0, - 0.04, 0.13 ), V( 0, 0.035, 0.15 ), V( 0, 0.065, 0.07 ) ], 0.022, 28, 7 ) );
	for ( const side of [ - 1, 1 ] ) add( sphere( 0.012, 9, 6 ).translate( side * 0.052, 0.715, 0.17 ), 0x252c25 );
	for ( let i = 0; i < 7; i ++ ) {

		add( sphere( 0.018, 6, 4 ).scale( 1.2, 0.45, 1.2 ).translate( 0, 0.25 + i * 0.055, - 0.10 ), 0xd5b675 );
		add( cylinder( 0, 0.014, 0.055, 5 ).rotateX( - 0.9 ).translate( 0, 0.29 + i * 0.06, - 0.105 ), 0xd5b675 );

	}
	return kit.merged( 'body' );

}

const SWIM = /* wgsl */`
	let tail = pow( clamp( ( 0.15 - v.position.z ) / 1.65, 0.0, 1.0 ), 2.0 );
	let ph = frame.time * 4.7 + mat.phase + v.position.z * 1.3;
	let dy = sin( ph ) * tail * 0.14;
	let previous = sin( ph - frame.dt * 4.7 ) * tail * 0.14;
	v.prevWorldOffset = ( v.prevModel * vec4f( 0.0, previous - dy, 0.0, 0.0 ) ).xyz;
	v.position.y += dy;`;

export class CoastalLife {

	constructor( app, parent ) {

		this.app = app; this.time = 0; this.group = new Group(); this.group.name = '近海生命'; parent.add( this.group );
		const near = dolphinGeometry(), far = dolphinGeometry( 10 );
		this.dolphins = Array.from( { length: 3 }, ( _, i ) => {

			const group = new Group(); group.name = '瓶鼻海豚 ' + ( i + 1 ); this.group.add( group );
			const material = new Material( { name: '海豚皮肤', vertexColors: true, roughness: 0.36, uniforms: { phase: [ 'f32', i * 2.3 ] }, vertex: SWIM,
				surface: 's.roughness = 0.34; s.clearcoat = 0.25; s.clearcoatRoughness = 0.22;' } );
			const lowMaterial = new Material( { name: '远处海豚', vertexColors: true, roughness: 0.4, uniforms: { phase: [ 'f32', i * 2.3 ] }, vertex: SWIM } );
			const high = new Mesh( near, material ), low = new Mesh( far, lowMaterial ); high.castShadow = true; group.add( high, low );
			const home = COASTAL_SITES.dolphin, pos = V( home.x + i * 4, - 1, home.z + i * 2 ); group.position.copy( pos );
			const collider = app.colliders?.addEllipsoid( pos, V( 0.65, 0.55, 1.5 ) );
			return { group, high, low, pos, velocity: V( 1, 0, 0 ), collider, index: i, following: false, breaching: false };

		} );
		this.buildMoray(); this.buildSeahorses();

	}

	buildMoray() {

		const app = this.app, site = COASTAL_SITES.moray;
		this.moray = new Group(); this.moray.name = '礁洞海鳗'; this.moray.position.set( site.x, app.terrainData.heightAt( site.x, site.z ) + 0.55, site.z ); this.group.add( this.moray );
		const material = new Material( { name: '海鳗斑纹', color: 0x68774a, roughness: 0.55,
			surface: 's.albedo *= 0.65 + smoothstep( -0.15, 0.35, perlin3( in.P * 28.0 ) ) * 0.6; s.clearcoat = 0.18;' } );
		const eel = new Mesh( body( [ [ - 1.7, 0.025, 0.025 ], [ - 1.2, 0.09, 0.10 ], [ - 0.5, 0.13, 0.17 ], [ 0.2, 0.15, 0.18 ], [ 0.65, 0.18, 0.16 ], [ 0.95, 0.11, 0.10 ] ], 18 ), material );
		this.eel = new Group(); this.eel.add( eel ); this.moray.add( this.eel );
		const jaw = this.jaw = new Mesh( sphere( 0.13, 12, 8 ).scale( 1, 0.4, 2.2 ).translate( 0, 0, 0.18 ), material ); jaw.position.set( 0, - 0.08, 0.58 ); this.eel.add( jaw );
		const eyes = new Material( { color: 0xd0c989, roughness: 0.2 } ), pupils = new Material( { color: 0x17251f, roughness: 0.2 } );
		for ( const side of [ - 1, 1 ] ) {

			const eye = new Mesh( sphere( 0.031, 10, 7 ), eyes ); eye.position.set( side * 0.163, 0.07, 0.71 ); this.eel.add( eye );
			const pupil = new Mesh( sphere( 0.017, 8, 6 ), pupils ); pupil.position.set( side * 0.184, 0.07, 0.72 ); this.eel.add( pupil );

		}
		const rockMat = new Material( { color: 0x6d7c72, roughness: 0.95, surface: 's.albedo *= 0.8 + perlin3( in.P * 8.0 ) * 0.22;' } );
		for ( const [ x, y, sx, sy ] of [ [ - 0.78, - 0.05, 0.65, 0.75 ], [ 0.78, - 0.05, 0.65, 0.75 ], [ 0, 0.6, 0.8, 0.4 ] ] ) {

			const rock = new Mesh( sphere( 1, 12, 8 ).scale( sx, sy, 0.85 ), rockMat ); rock.position.set( x, y, - 0.3 ); this.moray.add( rock );
			const center = this.moray.position.clone().add( rock.position ); app.colliders?.addEllipsoid( center, V( sx, sy, 0.85 ) );

		}
		app.colliders?.addCapsule( this.moray.position.clone().add( V( 0, 0, - 1.4 ) ), this.moray.position.clone().add( V( 0, 0, 1 ) ), 0.18 );
		this.morayPoint = this.moray.position.clone().add( V( 0, 0.1, 0.78 ) );

	}

	buildSeahorses() {

		const app = this.app, site = COASTAL_SITES.seahorse;
		this.garden = new Group(); this.garden.name = '海马草庭'; this.garden.position.set( site.x, app.terrainData.heightAt( site.x, site.z ), site.z ); this.group.add( this.garden );
		const geometry = seahorseGeometry(), material = new Material( { vertexColors: true, roughness: 0.7 } );
		this.seahorses = Array.from( { length: 3 }, ( _, i ) => {

			const fish = new Mesh( geometry, material ); fish.position.set( ( i - 1 ) * 0.8, 0.5 + i * 0.16, i % 2 * 0.55 ); fish.rotation.y = ( i - 1 ) * 0.6; this.garden.add( fish ); return fish;

		} );
		const kit = new GeoKit();
		for ( let i = 0; i < 25; i ++ ) {

			const a = i * 2.4, r = 0.4 + i % 5 * 0.35, x = Math.sin( a ) * r, z = Math.cos( a ) * r;
			kit.add( 'grass', tube( [ V( x, 0, z ), V( x + 0.1, 0.4, z ), V( x - 0.05, 0.9 + i % 4 * 0.18, z + 0.1 ) ], 0.025, 12, 5 ), { color: i % 2 ? 0x60854e : 0x7d9257 } );

		}
		this.garden.add( new Mesh( kit.merged( 'grass' ), new Material( { vertexColors: true, roughness: 0.9, vertex: 'v.position.x += sin( frame.time * 0.8 + v.position.z ) * v.position.y * 0.035;' } ) ) );
		this.seahorsePoint = this.garden.position.clone().add( V( 0, 1.0, 0.2 ) );

	}

	update( dt ) {

		dt = Number.isFinite( dt ) ? Math.min( 0.1, Math.max( 0, dt ) ) : 0; this.time += dt;
		const app = this.app, boat = app.boatCtl, cp = app.camera.position, home = COASTAL_SITES.dolphin;
		const moving = !! boat && ! boat.capsized && Math.hypot( boat.velocity?.x || 0, boat.velocity?.z || 0 ) > 1.2
			&& boat.position.z > 55 && boat.position.z < 370 && app.terrainData.heightAt( boat.position.x, boat.position.z ) < - 5;
		for ( const d of this.dolphins ) {

			const i = d.index, angle = this.time * 0.065 + i * 0.2;
			const target = V( home.x + Math.sin( angle ) * 26, - 0.8, home.z + Math.cos( angle ) * 22 );
			d.following = moving && d.pos.distanceToSquared( boat.position ) < 85 ** 2;
			if ( d.following ) {

				const yaw = boat.getYaw(), x = ( i % 2 ? - 1 : 1 ) * ( 6.5 + i * 1.6 ), z = 9 + i * 3;
				target.set( boat.position.x + Math.cos( yaw ) * x + Math.sin( yaw ) * z, - 0.8, boat.position.z - Math.sin( yaw ) * x + Math.cos( yaw ) * z );

			}
			const player = app.player?.position;
			if ( player && Math.hypot( player.x - d.pos.x, player.z - d.pos.z ) < 2.8 ) {

				const away = V( d.pos.x - player.x, 0, d.pos.z - player.z ); if ( away.lengthSq() < 0.001 ) away.set( 1, 0, 0 );
				target.copy( d.pos ).addScaledVector( away.normalize(), 5 );

			}
			if ( boat?.getYaw ) {

				const yaw = boat.getYaw(), c = Math.cos( yaw ), s = Math.sin( yaw ), dx = d.pos.x - boat.position.x, dz = d.pos.z - boat.position.z;
				const x = dx * c - dz * s, z = dx * s + dz * c;
				const wide = app.boat?.profileId === 'offshore' ? 4.5 : 3.5, long = app.boat?.profileId === 'offshore' ? 10 : 7.5;
				if ( Math.abs( x ) < wide && Math.abs( z ) < long ) {

					const side = ( Math.sign( x ) || ( i % 2 ? - 1 : 1 ) ) * ( wide + 3 );
					target.set( boat.position.x + c * side + s * z, - 0.8, boat.position.z - s * side + c * z );

				}

			}
			// Steering uses the real terrain, so a following animal cannot cut across an island.
			if ( app.terrainData.heightAt( target.x, target.z ) > - 3 ) target.set( home.x, - 0.8, home.z );
			const desired = target.sub( d.pos ); desired.y = 0; const distance = desired.length();
			if ( distance > 0.01 ) desired.multiplyScalar( Math.min( d.following ? 6 : 2.6, distance * 0.55 ) / distance );
			d.velocity.lerp( desired, 1 - Math.exp( - dt * 1.5 ) );
			const next = d.pos.clone().addScaledVector( d.velocity, dt );
			if ( app.terrainData.heightAt( next.x, next.z ) < - 2.8 ) { d.pos.x = next.x; d.pos.z = next.z; }
			else d.velocity.multiplyScalar( - 0.5 );
			const cycle = ( this.time + i * 7 ) % 32, leap = cycle > 14 && cycle < 15.6 ? ( cycle - 14 ) / 1.6 : null;
			d.breaching = leap !== null; const water = G.seaLevel.value || 0;
			d.pos.y = water - 0.85 + ( leap === null ? Math.sin( this.time * 1.2 + i ) * 0.18 : Math.sin( leap * Math.PI ) * 2.35 );
			d.group.position.copy( d.pos ); d.group.rotation.set( leap === null ? Math.cos( this.time * 1.2 + i ) * 0.04 : - Math.cos( leap * Math.PI ) * 0.48, Math.atan2( d.velocity.x, d.velocity.z ), 0, 'YXZ' );
			const range = cp.distanceToSquared( d.pos ); d.group.visible = range < 180 ** 2; d.high.visible = range < 32 ** 2; d.low.visible = ! d.high.visible;
			if ( d.collider ) { d.collider.center.copy( d.pos ); d.collider.rotation.copy( d.group.quaternion ); d.collider.inverse.copy( d.group.quaternion ).conjugate(); }

		}
		this.moray.visible = cp.distanceToSquared( this.moray.position ) < 65 ** 2;
		this.garden.visible = cp.distanceToSquared( this.garden.position ) < 55 ** 2;
		const near = cp.distanceToSquared( this.morayPoint ) < 8 ** 2, lit = !! app.localLights?.flashlight?.on && near;
		this.eel.rotation.y = Math.sin( this.time * 0.4 ) * 0.06; this.jaw.rotation.x = 0.12 + ( lit ? 0.24 : 0.06 ) * ( 0.5 + 0.5 * Math.sin( this.time * 1.8 ) );
		for ( let i = 0; i < this.seahorses.length; i ++ ) this.seahorses[ i ].rotation.z = Math.sin( this.time * 0.8 + i ) * 0.05;

	}

	photoSubjects() {

		return [ ...this.dolphins.filter( d => d.group.visible ).map( d => ( { id: 'dolphin', point: d.pos.clone() } ) ),
			{ id: 'moray', point: this.morayPoint }, { id: 'seahorse', point: this.seahorsePoint } ];

	}

}
