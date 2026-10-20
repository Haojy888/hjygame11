import { Group, Mesh, Vector3, Color } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { G } from '../core/Globals.js';
import { GeoKit, box, cylinder, sphere, rod, torus, tube, roundedBox } from './boat/GeoKit.js';
import { createMound } from './reef/ReefGeometry.js';
import { mulberry32 } from '../util/Noise.js';
import { LIGHTHOUSE as L, COASTAL_SITES } from '../game/ExplorationLandmarks.js';
import { WRECK_SITE } from '../game/Expedition.js';
import { CoastalLife } from './marine/CoastalLife.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const TAU = Math.PI * 2;

// Architecture stays code-built: every stair, doorway and rail uses the same dimensions
// for rendering and collision. Material buckets merge details into a handful of draws.
function finish( kit, parent, prefix ) {

	for ( const name of kit.buckets.keys() ) {

		const material = new Material( { name: prefix + ':' + name, vertexColors: true, roughness: name === 'metal' ? 0.65 : 0.9,
			surface: `let wear = perlin3( in.P * 5.0 ) * 0.14 + perlin3( in.P * 0.9 ) * 0.10;
				s.albedo *= 0.86 + wear; s.roughness = ${ name === 'metal' ? '0.66' : '0.9' };` } );
		const mesh = new Mesh( kit.merged( name ), material ); mesh.name = prefix + ':' + name; mesh.castShadow = true; parent.add( mesh );

	}

}

export class ExplorationWorld {

	constructor( app ) {

		this.app = app; this.time = 0; this.group = new Group(); this.group.name = '归航灯塔与海上见闻'; app.scene.add( this.group );
		this.targets = new Map(); this.routes = []; this.buoys = [];
		this.buildLighthouse(); this.buildWreckInterior(); this.buildBuoys(); this.buildBones();
		this.life = new CoastalLife( app, this.group );

	}

	buildLighthouse() {

		const app = this.app, C = app.colliders, kit = new GeoKit();
		const tower = this.tower = new Group(); tower.name = '归航灯塔'; tower.position.set( L.x, 0, L.z ); this.group.add( tower );
		const add = ( bucket, geometry, color ) => kit.add( bucket, geometry, { color } );
		const solidBox = ( name, x, y, z, w, h, d, color, yaw = 0, walkable = false ) => {

			add( [ 'stone', 'wall', 'approach-step' ].includes( name ) ? 'stone' : 'metal', box( w, h, d ).rotateY( yaw ).translate( x, y, z ), color );
			return C?.addBox( V( L.x + x, y, L.z + z ), V( w / 2, h / 2, d / 2 ), yaw, { tag: 'lighthouse-' + name, walkable } );

		};
		const floor = app.terrainData.heightAt( L.x, L.z ), rock = createMound( mulberry32( 3107 ), 2, 'rock' );
		rock.computeBoundingBox(); const b = rock.boundingBox, s = b.getSize( V() );
		rock.translate( - ( b.min.x + b.max.x ) / 2, - b.min.y, - ( b.min.z + b.max.z ) / 2 ).scale( 23 / s.x, ( L.baseY - floor - 0.2 ) / s.y, 22 / s.z ).translate( 0, floor, 0 );
		add( 'stone', rock, 0x596767 );
		// The solid rock core leaves the entire exterior stair approach open.
		C?.addBox( V( L.x, ( floor + 3.8 ) / 2, L.z - 1 ), V( 5.7, ( 3.8 - floor ) / 2, 6.7 ), 0, { tag: 'lighthouse-islet' } );
		for ( const side of [ - 1, 1 ] ) C?.addBox( V( L.x + side * 7, ( floor + 3.8 ) / 2, L.z ), V( 1.5, ( 3.8 - floor ) / 2, 7 ), 0, { tag: 'lighthouse-islet' } );
		solidBox( 'stone', 0, L.baseY - 0.22, 0, 11.4, 0.44, 11.4, 0x9a9c90, 0, true );
		// Nine broad exterior steps link the dock to the island terrace.
		for ( let i = 0; i < 9; i ++ ) {

			const top = L.deckY + ( i + 1 ) * 0.2, z = 10 - i * 0.55;
			solidBox( 'approach-step', 0, top - 0.12, z, 2.2, 0.24, 0.68, 0x969b90, 0, true );
			this.routes.push( V( L.x, top, L.z + z ) );

		}
		solidBox( 'dock', 0, L.deckY - 0.12, 14.4, 3.5, 0.24, 8.5, 0x776b54, 0, true );
		for ( const x of [ - 1.45, 1.45 ] ) for ( const z of [ 11.3, 17.6 ] ) {

			add( 'metal', cylinder( 0.16, 0.24, L.deckY - floor, 10 ).translate( x, ( floor + L.deckY ) / 2, z ), 0x535f5b );
			C?.addCylinder( L.x + x, L.z + z, 0.24, floor, L.deckY, { tag: 'lighthouse-dock-pile' } );
			add( 'metal', torus( 0.26, 0.075, 7, 18 ).rotateY( Math.PI / 2 ).translate( x * 1.2, 1.25, z ), 0x303b3c );

		}
		for ( let z = 10.4; z < 18.5; z += 0.45 ) add( 'metal', box( 3.5, 0.008, 0.022 ).translate( 0, L.deckY + 0.004, z ), 0x4c4e43 );
		this.ladderPoint = V( L.x, 0, L.z + 19.1 );
		for ( const x of [ - 0.34, 0.34 ] ) {

			add( 'metal', rod( V( x, - 1.5, 19.1 ), V( x, L.deckY + 0.8, 19.1 ), 0.035, 8 ), 0xbbbdab );
			add( 'metal', rod( V( x, L.deckY + 0.8, 19.1 ), V( x, L.deckY + 0.8, 18 ), 0.035, 8 ), 0xbbbdab );

		}
		for ( let y = - 1.4; y < L.deckY; y += 0.28 ) add( 'metal', rod( V( - 0.34, y, 19.1 ), V( 0.34, y, 19.1 ), 0.025, 7 ), 0xd4a659 );
		this.ladder = C?.addBox( V( L.x, ( L.deckY - 1.5 ) / 2, L.z + 19.1 ), V( 0.4, ( L.deckY + 1.5 ) / 2, 0.16 ), 0,
			{ tag: 'ladder', solid: false, climbTo: V( L.x, L.deckY, L.z + 18 ) } );
		const topY = this.galleryY = L.baseY + L.steps * L.rise;
		// Thirty-two separate wall panels leave a real doorway and four open windows.
		for ( let i = 0; i < 32; i ++ ) {

			const a = i / 32 * TAU, x = Math.sin( a ) * 3.67, z = Math.cos( a ) * 3.67;
			let y = L.baseY;
			const spans = [];
			for ( let band = 0; band < 4; band ++ ) {

				const high = Math.min( topY, L.baseY + ( band + 1 ) * 3.3 );
				if ( band === 0 && ( i < 2 || i === 31 ) ) spans.push( [ y + 2.85, high ] );
				else if ( band > 0 && i % 8 === 0 ) { spans.push( [ y, y + 0.9 ], [ y + 2.3, high ] ); }
				else spans.push( [ y, high ] );
				y = high;

			}
			for ( const [ lo, hi ] of spans ) if ( hi > lo ) solidBox( 'wall', x, ( lo + hi ) / 2, z, 0.75, hi - lo, 0.28, i % 5 === 0 ? 0xb6b5a1 : 0xd5d1b7, a );
			// Faded red bands, foundation blocks, and individual masonry seams.
			add( 'metal', box( 0.76, 0.34, 0.30 ).rotateY( a ).translate( x, L.baseY + 6.4, z ), 0x9b5147 );
			for ( let y = L.baseY + 0.8; y < topY; y += 0.8 ) {

				if ( ( i < 2 || i === 31 ) && y < L.baseY + 2.9 || i % 8 === 0 && y % 3.3 > 0.9 && y % 3.3 < 2.3 ) continue;
				add( 'stone', box( 0.69, 0.018, 0.012 ).rotateY( a ).translate( Math.sin( a ) * 3.82, y, Math.cos( a ) * 3.82 ), 0x929685 );

			}

		}
		add( 'metal', cylinder( 0.23, 0.30, topY - L.baseY, 16 ).translate( 0, ( topY + L.baseY ) / 2, 0 ), 0x616c68 );
		C?.addCylinder( L.x, L.z, 0.30, L.baseY, topY, { tag: 'lighthouse-stair-post' } );
		this.spiral = [];
		for ( let i = 0; i < L.steps; i ++ ) {

			const a = i / 20 * TAU, y = L.baseY + ( i + 1 ) * L.rise, x = Math.sin( a ) * L.stairRadius, z = Math.cos( a ) * L.stairRadius;
			solidBox( 'spiral-step', x, y - 0.09, z, 0.98, 0.18, 1.70, 0x6e7a75, a, true ); this.spiral.push( V( L.x + x, y, L.z + z ) );
			if ( i % 2 === 0 ) add( 'metal', rod( V( Math.sin( a ) * 3.22, y, Math.cos( a ) * 3.22 ), V( Math.sin( a ) * 3.22, y + 0.95, Math.cos( a ) * 3.22 ), 0.025, 6 ), 0x576762 );

		}
		const handrail = Array.from( { length: L.steps + 1 }, ( _, i ) => { const a = i / 20 * TAU; return V( Math.sin( a ) * 3.22, L.baseY + ( i + 1 ) * L.rise + 0.95, Math.cos( a ) * 3.22 ); } );
		add( 'metal', tube( handrail, 0.034, 180, 6 ), 0x76867d );
		for ( let i = 0; i < 32; i ++ ) {

			const a = i / 32 * TAU, x = Math.sin( a ) * 4.05, z = Math.cos( a ) * 4.05;
			solidBox( 'gallery', x, topY - 0.11, z, 0.93, 0.22, 1.8, 0x929d8e, a, true );
			for ( const h of [ 0.52, 1.05 ] ) add( 'metal', rod( V( Math.sin( a ) * 4.97, topY + h, Math.cos( a ) * 4.97 ), V( Math.sin( a + TAU / 32 ) * 4.97, topY + h, Math.cos( a + TAU / 32 ) * 4.97 ), 0.026, 6 ), 0x6a7c75 );
			add( 'metal', cylinder( 0.025, 0.035, 1.08, 6 ).translate( Math.sin( a ) * 4.97, topY + 0.54, Math.cos( a ) * 4.97 ), 0x6a7c75 );
			C?.addBox( V( L.x + Math.sin( a ) * 4.97, topY + 0.55, L.z + Math.cos( a ) * 4.97 ), V( 0.5, 0.55, 0.035 ), a, { tag: 'lighthouse-balcony-rail' } );

		}
		solidBox( 'landing', 0, topY - 0.08, 3.05, 1.3, 0.16, 2.4, 0x929d8e, 0, true );
		// The lantern rests above the stair opening, leaving a full-height exit to the gallery.
		const lanternY = topY + 2.8;
		for ( let i = 0; i < 8; i ++ ) {

			const a = i / 8 * TAU;
			add( 'metal', cylinder( 0.055, 0.075, 2.9, 8 ).translate( Math.sin( a ) * 2.25, lanternY + 0.05, Math.cos( a ) * 2.25 ), 0x526a65 );

		}
		for ( const y of [ lanternY - 1.4, lanternY + 1.5 ] ) add( 'metal', torus( 2.25, 0.10, 7, 48 ).rotateX( Math.PI / 2 ).translate( 0, y, 0 ), 0x658176 );
		add( 'metal', cylinder( 0.10, 2.95, 1.6, 32 ).translate( 0, lanternY + 2.35, 0 ), 0x4d746b );
		add( 'metal', cylinder( 0.04, 0.09, 1.2, 8 ).translate( 0, lanternY + 3.7, 0 ), 0x6e887d );
		this.lampMaterial = new Material( { name: '归航灯塔灯芯', color: 0xf5d395, roughness: 0.25 } );
		const bulb = new Mesh( sphere( 0.4, 20, 12 ), this.lampMaterial ); bulb.position.set( 0, lanternY, 0 ); tower.add( bulb );
		const lensKit = new GeoKit();
		for ( let y = - 0.7; y <= 0.7; y += 0.16 ) lensKit.add( 'lens', torus( 0.7 - Math.abs( y ) * 0.33, 0.07, 8, 32 ).rotateX( Math.PI / 2 ).translate( 0, lanternY + y, 0 ) );
		tower.add( new Mesh( lensKit.merged( 'lens' ), this.lampMaterial ) );
		const glass = new Mesh( cylinder( 2.20, 2.20, 2.8, 32, 1, true ), new Material( { name: '灯室旧玻璃', color: 0x9fcbc9, roughness: 0.16, transparent: true, opacity: 0.13, depthWrite: false, side: 'double' } ) );
		glass.position.y = lanternY; tower.add( glass );
		const panel = this.panel = V( L.x + 3.75, topY + 0.9, L.z + 0.2 );
		solidBox( 'console', 3.75, topY + 0.65, 0.2, 0.35, 1.3, 0.8, 0x4b625d );
		add( 'metal', box( 0.02, 0.35, 0.45 ).translate( 3.56, topY + 0.95, 0.2 ), 0xbba97b );
		add( 'metal', cylinder( 0.055, 0.055, 0.06, 12 ).rotateZ( Math.PI / 2 ).translate( 3.52, topY + 0.94, 0.2 ), 0xc5694a );
		this.beacon = { position: V( L.x, lanternY, L.z ), color: new Color( 1, 0.86, 0.56 ), intensity: 90, range: 110, dir: V( 1, - 0.08, 0 ), cosInner: 0.994, cosOuter: 0.98, enabled: false, kind: 'lighthouse' };
		app.localLights?.add( this.beacon );
		this.beamPivot = new Group(); this.beamPivot.position.set( 0, lanternY, 0 ); tower.add( this.beamPivot );
		const beam = new Mesh( cylinder( 5.2, 0.04, 65, 28, 1, true ).rotateZ( - Math.PI / 2 ).translate( 32.5, 0, 0 ), new Material( { name: '灯塔夜间光束', color: 0x000000, transparent: true, opacity: 0.008, depthWrite: false, side: 'double', lit: false,
			surface: 's.emissive = vec3f( 1.0, 0.8, 0.46 ); let along = clamp( in.uv.y / 65.0, 0.0, 1.0 ); s.alpha *= smoothstep( 0.0, 0.04, along ) * pow( 1.0 - along, 2.0 ) * pow( abs( dot( in.N, in.V ) ), 0.65 );' } ) );
		this.beamPivot.add( beam );
		finish( kit, tower, '灯塔' ); this.targets.set( 'lighthouse', this.ladderPoint.clone() );

	}

	buildWreckInterior() {

		const app = this.app, kit = new GeoKit(); this.interior = new Group(); this.interior.name = '归潮号航海舱陈设';
		this.interior.position.set( WRECK_SITE.x, app.terrainData.heightAt( WRECK_SITE.x, WRECK_SITE.z ), WRECK_SITE.z ); this.group.add( this.interior );
		const add = ( geometry, color, name = 'wood' ) => kit.add( name, geometry, { color } );
		const furniture = ( x, y, z, w, h, d, color ) => {

			add( roundedBox( w, h, d, 0.035, 1 ).translate( x, y, z ), color );
			app.colliders?.addBox( this.interior.position.clone().add( V( x, y, z ) ), V( w / 2, h / 2, d / 2 ), 0, { tag: 'wreck-furniture' } );

		};
		// Keep the central log and both hull openings clear.
		furniture( - 1.15, 1.05, - 3.1, 1.25, 0.12, 1.45, 0x77674a );
		for ( const x of [ - 1.65, - 0.65 ] ) for ( const z of [ - 3.65, - 2.55 ] ) add( box( 0.09, 1, 0.09 ).translate( x, 0.5, z ), 0x645d49 );
		add( box( 0.9, 0.013, 0.9 ).rotateY( 0.18 ).translate( - 1.12, 1.125, - 3.1 ), 0xc4b27f );
		for ( let i = 0; i < 6; i ++ ) add( box( 0.65, 0.008, 0.008 ).rotateY( i * 0.11 - 0.3 ).translate( - 1.1, 1.138, - 3.4 + i * 0.12 ), 0x6f7d72 );
		add( cylinder( 0.13, 0.13, 0.07, 20 ).translate( - 0.8, 1.18, - 3.1 ), 0xa29364, 'metal' );
		add( torus( 0.48, 0.043, 8, 32 ).translate( 0, 1.55, - 6.0 ), 0x7d6949 );
		for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * TAU; add( rod( V( 0, 1.55, - 6 ), V( Math.sin( a ) * 0.62, 1.55 + Math.cos( a ) * 0.62, - 6 ), 0.025, 6 ), 0x8a7854 ); }
		furniture( 0, 0.65, - 6, 0.3, 1.3, 0.3, 0x5d6555 );
		furniture( 1.2, 0.55, 2.7, 0.9, 1.1, 0.7, 0x66776d );
		for ( const y of [ 0.22, 0.60, 0.95 ] ) add( box( 0.35, 0.035, 0.05 ).translate( 1.2, y, 3.07 ), 0x978a65, 'metal' );
		furniture( - 1.0, 0.38, 4.5, 1.25, 0.76, 0.8, 0x827154 );
		for ( const x of [ - 1.4, - 0.6 ] ) add( box( 0.1, 0.83, 0.86 ).translate( x, 0.4, 4.5 ), 0x53655d, 'metal' );
		for ( let i = 0; i < 13; i ++ ) add( sphere( 0.08 + i % 3 * 0.025, 7, 5 ).scale( 1, 0.45, 0.8 ).translate( - 1.6 + i % 4 * 0.35, 0.07, 2.7 + Math.floor( i / 4 ) * 0.45 ), 0xb4ab8c );
		finish( kit, this.interior, '沉船陈设' );

	}

	buildBuoys() {

		for ( const [ i, x, z ] of [ [ 0, - 155, 185 ], [ 1, - 182, 218 ], [ 2, 76, 193 ], [ 3, 152, 290 ] ] ) {

			const group = new Group(), kit = new GeoKit(); group.name = '航道浮标 ' + ( i + 1 ); group.position.set( x, 0, z ); this.group.add( group );
			const color = i < 2 ? 0xb24f42 : 0x36857a;
			kit.add( 'metal', cylinder( 0.65, 0.9, 0.6, 20 ), { color } );
			kit.add( 'metal', cylinder( 0.32, 0.58, 1.8, 16 ).translate( 0, 1.0, 0 ), { color } );
			kit.add( 'metal', torus( 0.54, 0.035, 6, 24 ).rotateX( Math.PI / 2 ).translate( 0, 1.6, 0 ), { color: 0xb2b79c } );
			kit.add( 'metal', box( 0.38, 0.46, 0.05 ).translate( 0, 1.02, 0.43 ), { color: 0xe1ddbc } );
			// Raised numeral strokes stay legible without a new texture request.
			for ( let n = 0; n <= i; n ++ ) kit.add( 'metal', box( 0.035, 0.22, 0.02 ).translate( - i * 0.05 + n * 0.1, 1.03, 0.47 ), { color: 0x344c48 } );
			const lamp = new Mesh( sphere( 0.16, 10, 6 ), new Material( { color: i < 2 ? 0xe47a55 : 0x76d5ad, roughness: 0.25 } ) ); lamp.position.y = 2.05; group.add( lamp );
			const chainKit = new GeoKit(), floor = this.app.terrainData.heightAt( x, z );
			for ( let y = - 0.6, n = 0; y > Math.max( floor, - 32 ); y -= 0.38, n ++ ) chainKit.add( 'metal', torus( 0.10, 0.025, 5, 9 ).rotateY( n % 2 * Math.PI / 2 ).translate( x + Math.sin( y * 0.13 ) * 0.35, y, z ), { color: 0x625f4b } );
			const chain = new Group(); this.group.add( chain ); finish( chainKit, chain, '浮标锚链' );
			finish( kit, group, '航标' ); this.buoys.push( { group, lamp, chain, x, z, phase: i * 1.7 } );

		}

	}

	buildBones() {

		const site = COASTAL_SITES.whalebones, kit = new GeoKit(), C = this.app.colliders;
		const group = this.bones = new Group(); group.name = '鲸落骨廊'; group.position.set( site.x, this.app.terrainData.heightAt( site.x, site.z ), site.z ); this.group.add( group );
		for ( let i = 0; i < 13; i ++ ) {

			const z = - 6 + i * 0.95, w = 3.2 * Math.sin( ( i + 2 ) / 16 * Math.PI ), h = 3.3 * Math.sin( ( i + 2 ) / 16 * Math.PI );
			kit.add( 'bone', sphere( 0.25, 10, 7 ).scale( 1.3, 1, 1.5 ).translate( 0, 0.3, z ), { color: 0xb4b398 } );
			for ( const side of [ - 1, 1 ] ) {

				const points = [ V( side * 0.15, 0.35, z ), V( side * w * 0.85, h * 0.35, z ), V( side * w, h * 0.82, z ), V( side * w * 0.65, h, z ) ];
				kit.add( 'bone', tube( points, 0.095 + i % 3 * 0.015, 20, 7 ), { color: 0xc5c2a7 } );
				// Keep a central swimming corridor; each rib remains a rounded solid.
				for ( let k = 1; k < points.length - 1; k ++ ) C?.addCapsule( points[ k ].clone().add( group.position ), points[ k + 1 ].clone().add( group.position ), 0.13 );

			}
		}
		for ( const side of [ - 1, 1 ] ) kit.add( 'bone', tube( [ V( side * 0.2, 0.4, - 6.4 ), V( side * 1.2, 0.6, - 8 ), V( side * 1.0, 0.3, - 10.5 ), V( side * 0.2, 0.2, - 11.7 ) ], 0.2, 30, 10 ), { color: 0xc5c2a7 } );
		for ( let i = 0; i < 24; i ++ ) kit.add( 'coral', sphere( 0.12, 7, 5 ).scale( 1, 1.8, 1 ).translate( Math.sin( i * 2.4 ) * 2.8, 0.1 + i % 4 * 0.25, - 6 + i * 0.48 ), { color: i % 2 ? 0x8b8f75 : 0x938d89 } );
		finish( kit, group, '鲸骨' ); this.targets.set( 'whalebones', group.position.clone().add( V( 0, 1.6, 0 ) ) );

	}

	update( dt, lit ) {

		this.time += Number.isFinite( dt ) ? Math.min( 0.1, Math.max( 0, dt ) ) : 0;
		const cp = this.app.camera.position, night = G.night.value > 0.15;
		this.tower.visible = cp.distanceToSquared( V( L.x, 8, L.z ) ) < 950 ** 2;
		this.interior.visible = cp.distanceToSquared( this.interior.position ) < 120 ** 2;
		this.bones.visible = cp.distanceToSquared( this.bones.position ) < 140 ** 2;
		this.lampMaterial.emissive.setRGB( lit && night ? 4 : 0, lit && night ? 3.1 : 0, lit && night ? 1.5 : 0 );
		this.beacon.enabled = !! lit && night; this.beamPivot.visible = this.beacon.enabled && this.tower.visible;
		this.beamPivot.rotation.y = - this.time * 0.24; this.beacon.dir.set( Math.cos( this.time * 0.24 ), - 0.06, Math.sin( this.time * 0.24 ) ).normalize();
		for ( const b of this.buoys ) {

			b.group.visible = cp.distanceToSquared( b.group.position ) < 220 ** 2; b.chain.visible = cp.distanceToSquared( b.group.position ) < 48 ** 2;
			b.group.position.y = ( G.seaLevel.value || 0 ) + Math.sin( this.time * 1.3 + b.phase ) * 0.15;
			b.group.rotation.z = Math.sin( this.time * 0.8 + b.phase ) * 0.06; b.group.rotation.x = Math.cos( this.time + b.phase ) * 0.05;
			const flash = night && ( this.time + b.phase ) % 3.8 < 0.3; b.lamp.material.emissive.setRGB( flash ? 3 : 0, flash ? 1.5 : 0, flash ? 0.5 : 0 );

		}
		this.life.update( dt );

	}

}
