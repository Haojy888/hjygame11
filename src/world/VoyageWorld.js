import { Group, Mesh, InstancedMesh, Matrix4, Quaternion, Vector3, PlaneGeometry } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { Texture } from '../engine/gpu/Texture.js';
import { GPU } from '../engine/gpu/GPU.js';
import { decodeImage } from '../engine/loaders/GLTF.js';
import { GeoKit, box, cylinder, sphere, rod, torus, lathe } from './boat/GeoKit.js';
import { STATION, BUOY, RECORDER, SALVAGE, EVENT_SITES } from '../game/Voyage.js';
import { fishGeometry } from './fish/FishGeometry.js';
import { SPECIES } from './fish/FishSpecies.js';
import { AbyssAssets } from './AbyssAssets.js';
import { RestorationWorld } from './RestorationWorld.js';

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/voyage/';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const UP = V( 0, 1, 0 );
function build( name, parts, parent ) {

	const kit = new GeoKit();
	for ( const [ geometry, color ] of parts ) kit.add( 'prop', geometry, { color, rough: 0.75 } );
	const mesh = new Mesh( kit.merged( 'prop' ), new Material( { name, vertexColors: true, roughness: 0.78,
		surface: 's.albedo *= 0.87 + perlin3( in.P * 7.0 ) * 0.16; s.roughness = 0.78;' } ) );
	mesh.name = name; mesh.castShadow = true; parent.add( mesh ); return mesh;

}
function relic( id, parent ) {

	if ( id === 'bell' ) return build( '打捞旧船钟', [
		[ lathe( [ [ 0.25, 0 ], [ 0.22, 0.08 ], [ 0.12, 0.35 ], [ 0.10, 0.4 ], [ 0, 0.42 ] ], 18 ), 0x8b8056 ],
		[ torus( 0.06, 0.015, 6, 12 ).translate( 0, 0.47, 0 ), 0x7a7050 ], [ cylinder( 0.025, 0.035, 0.3, 8 ).translate( 0, 0.17, 0 ), 0x5a5440 ],
	], parent );
	if ( id === 'compass' ) return build( '打捞黄铜罗盘', [ [ cylinder( 0.2, 0.22, 0.07, 24 ), 0x9a8151 ],
		[ cylinder( 0.175, 0.175, 0.012, 24 ).translate( 0, 0.04, 0 ), 0xd7caa0 ], [ box( 0.018, 0.012, 0.28 ).rotateY( 0.3 ).translate( 0, 0.053, 0 ), 0x445752 ] ], parent );
	return build( '打捞观测仪器', [ [ box( 0.52, 0.3, 0.32 ), 0x648479 ], [ cylinder( 0.11, 0.11, 0.035, 16 ).rotateX( Math.PI / 2 ).translate( 0.1, 0.04, 0.18 ), 0xd5cba8 ],
		[ box( 0.09, 0.10, 0.04 ).translate( - 0.14, 0.02, 0.18 ), 0x384d50 ], [ rod( V( - 0.18, 0.15, 0 ), V( - 0.18, 0.65, 0 ), 0.012, 5 ), 0x555b5a ] ], parent );

}
export class VoyageWorld {

	constructor( app ) {

		this.app = app; this.time = 0; this.haul = 0; this.photoKey = null; this.photoVersion = 0;
		this.waterSlot = - 1; this.eventSurfaceY = 0;
		if ( app.query?.allocate && app.query.count <= 61 ) this.waterSlot = app.query.allocate( 'voyage', 3 );
		this.group = new Group(); this.group.name = '海湾七号与航海遭遇'; app.scene.add( this.group );
		this.restoration = new RestorationWorld( app, this.group );
		const t = app.terrainData;
		const rise = 1.3;
		this.targets = { buoy: V( BUOY.x, 0.6, BUOY.z ), record: V( RECORDER.x, t.heightAt( RECORDER.x, RECORDER.z ) + 1, RECORDER.z ),
			repair: V( STATION.x, 1.8 + rise, STATION.z - 3.0 ) };
		this.station = new Group(); this.station.position.set( STATION.x, rise, STATION.z ); this.group.add( this.station );
		const shell = [ [ box( 2.8, 2.1, 2.3 ).translate( - 0.6, 2.25, 0.45 ), 0xb8bbb0 ],
			[ box( 3.2, 0.15, 2.7 ).translate( - 0.6, 3.35, 0.45 ), 0x6a7b73 ], [ box( 1.25, 0.65, 0.05 ).translate( - 0.6, 2.6, - 0.73 ), 0x31535b ],
			[ box( 1.8, 0.06, 1.1 ).rotateX( - 0.25 ).translate( 1.55, 2.2, 0.8 ), 0x28465c ],
			[ rod( V( - 1.4, 3.4, 1 ), V( - 1.4, 6.1, 1 ), 0.05, 8 ), 0x69736d ], [ torus( 0.48, 0.035, 8, 20 ).translate( - 1.4, 5.3, 1 ), 0xc6c4af ],
			[ rod( V( - 2, 5.8, 1 ), V( - 0.8, 5.8, 1 ), 0.025, 6 ), 0x7c8580 ] ];
		this.stationFallback = build( '观测站舱体回退', shell, this.station );
		const parts = [ [ box( 5.8, 0.25, 5.6 ).translate( 0, 1.1, 0 ), 0x7a8276 ],
			[ box( 1.0, 0.55, 0.35 ).translate( 0, 1.6, - 2.5 ), 0x566d68 ], [ box( 0.65, 0.3, 0.04 ).translate( 0, 1.78, - 2.71 ), 0x2e5357 ] ];
		for ( const x of [ - 2.3, 2.3 ] ) for ( const z of [ - 2.1, 2.1 ] ) {

			const floor = t.heightAt( STATION.x + x, STATION.z + z ) - rise, height = 1.1 - floor;
			parts.push( [ cylinder( 0.16, 0.23, height, 10 ).translate( x, floor + height / 2, z ), 0x5c7067 ] );
			app.colliders?.addCylinder( STATION.x + x, STATION.z + z, 0.25, floor + rise, 1.3 + rise, { tag: 'observatory-pile' } );

		}
		build( '海湾七号观测站', parts, this.station );
		app.colliders?.addBox( V( STATION.x - 0.6, 2.6 + rise, STATION.z + 0.45 ), V( 1.8, 1.4, 1.6 ), 0, { tag: 'observatory-house' } );
		app.colliders?.addBox( V( STATION.x, 1.1 + rise, STATION.z ), V( 2.9, 0.16, 2.8 ), 0, { tag: 'observatory-platform' } );
		this.lampMat = new Material( { color: 0x597469, roughness: 0.4 } );
		const lamp = new Mesh( sphere( 0.12, 10, 6 ), this.lampMat ); lamp.position.set( 0, 2.1, - 2.55 ); this.station.add( lamp );
		this.light = { position: V( STATION.x, 2.2 + rise, STATION.z - 2.5 ), color: { r: 0.2, g: 0.9, b: 0.6 }, intensity: 3, range: 8, kind: 'observatory', enabled: false };
		app.localLights?.add( this.light );
		this.buoy = build( '旧呼号浮标', [ [ cylinder( 0.5, 0.62, 0.65, 16 ), 0xdf9d46 ], [ cylinder( 0.055, 0.06, 1.8, 8 ).translate( 0, 0.8, 0 ), 0x657b77 ],
			[ sphere( 0.12, 10, 6 ).translate( 0, 1.7, 0 ), 0xd3bd72 ], [ box( 0.34, 0.2, 0.06 ).translate( 0, 0.7, - 0.1 ), 0xd9d4b9 ] ], this.group );
		build( '海床值班记录器', [ [ box( 0.75, 0.65, 0.5 ), 0x7d9286 ], [ box( 0.5, 0.35, 0.03 ).translate( 0, 0.12, - 0.27 ), 0xbfb799 ],
			[ cylinder( 0.05, 0.06, 0.5, 8 ).translate( - 0.2, 0.55, 0 ), 0x56685f ] ], this.group ).position.copy( this.targets.record ).add( V( 0, - 0.35, 0 ) );
		this.salvage = new Map();
		for ( const item of SALVAGE ) {

			const mesh = relic( item.id, this.group ), point = V( item.x, t.heightAt( item.x, item.z ) + 0.4, item.z );
			mesh.position.copy( point ); this.salvage.set( item.id, { mesh, point } );
			build( '遗物下的旧木箱', [ [ box( 0.65, 0.4, 0.55 ), 0x6d7460 ] ], this.group ).position.copy( point ).add( V( 0, - 0.2, 0 ) );

		}
		this.eventGroup = new Group(); this.group.add( this.eventGroup );
		const tender = [ [ lathe( [ [ 0, - 0.22 ], [ 0.38, - 0.22 ], [ 0.68, - 0.04 ], [ 0.84, 0.35 ] ], 28 ).scale( 1, 1, 2.5 ), 0x4f888b ],
			[ torus( 0.83, 0.04, 6, 28 ).rotateX( Math.PI / 2 ).scale( 1, 1, 2.5 ).translate( 0, 0.35, 0 ), 0x9d896b ],
			[ box( 1.1, 0.12, 3.2 ).translate( 0, 0.08, 0 ), 0xc9bb96 ], [ box( 1.1, 0.12, 0.5 ).translate( 0, 0.4, - 0.7 ), 0x917c5a ],
			[ box( 0.75, 0.55, 0.7 ).translate( 0, 0.55, 0.75 ), 0xe3ded0 ], [ box( 0.6, 0.2, 0.04 ).translate( 0, 0.7, 0.38 ), 0x365c68 ],
		];
		this.visitor = new Group(); this.eventGroup.add( this.visitor );
		this.tenderFallback = build( '海燕号船体回退', tender, this.visitor );
		this.crewOffset = V( 0.18, - 0.015, 0.12 );
		this.crewFootrest = build( '船员木质脚踏', [ [ box( 0.65, 0.08, 0.42 ).translate( 0.18, - 0.06, 0.32 ), 0x958975 ] ], this.visitor );
		this.maskAnchor = new Group(); this.eventGroup.add( this.maskAnchor ); this.maskAnchor.position.y = - 10000;
		app.sceneRenderer?.addHullMask( lathe( [ [ 0, - 0.45 ], [ 0.36, - 0.45 ], [ 0.62, - 0.08 ], [ 0.72, 0.55 ], [ 0, 0.55 ] ], 28 ).scale( 1, 1, 2.5 ).translate( 0, 0, 0.18 ), this.maskAnchor );
		this.crate = build( '海面旧信箱', [ [ box( 0.85, 0.5, 0.6 ), 0x8b815f ], [ box( 0.6, 0.12, 0.02 ).translate( 0, 0.12, - 0.31 ), 0xd6cda8 ] ], this.eventGroup );
		const fish = fishGeometry( SPECIES.silverside, { lod: 2 } ).scale( 0.45, 0.45, 0.45 );
		this.shoal = new InstancedMesh( fish, new Material( { color: 0x9ebcba, roughness: 0.4, metalness: 0.15,
			vertex: 'v.position.x += sin( frame.time * 8.0 + v.position.z * 14.0 ) * max( 0.0, -v.position.z ) * 0.18;' } ), 42 );
		this.shoal.frustumCulled = false; this.eventGroup.add( this.shoal );
		this.snow = new InstancedMesh( sphere( 0.018, 5, 3 ), new Material( { color: 0x529da6, roughness: 1,
			surface: 's.emissive = vec3f( 0.04, 0.22, 0.27 ) * frame.night;' } ), 42 );
		this.snow.frustumCulled = false; this.eventGroup.add( this.snow );
		this._matrix = new Matrix4(); this._q = new Quaternion(); this._scale = V( 1, 1, 1 );
		this.rope = new Mesh( cylinder( 0.018, 0.018, 1, 7 ), new Material( { color: 0xb5aa87, roughness: 0.9 } ) );
		this.rope.frustumCulled = false; this.group.add( this.rope );
		this.hookPoint = V( - 2.5, 2.6, - 4.7 );
		this.cabin = new Group(); this.cabin.name = '我的驾驶舱收藏'; app.boat?.group.add( this.cabin );
		const sx = app.boat?.visualScale.x || 1, sz = app.boat?.visualScale.z || 1;
		build( '船载无线电', [ [ box( 0.38, 0.16, 0.22 ).translate( 0.6 * sx, 1.48, 0.98 * sz ), 0x354c50 ],
			[ box( 0.14, 0.07, 0.02 ).translate( 0.55 * sx, 1.5, 0.855 * sz ), 0x69aeb1 ],
			[ rod( V( 0.78 * sx, 1.5, sz ), V( 0.78 * sx, 1.95, sz ), 0.008, 5 ), 0x3d5150 ] ], this.cabin );
		build( '收藏架与相框', [ [ box( 0.7, 0.06, 0.32 ).translate( 0.65 * sx, 1.45, - 0.72 * sz ), 0x8b765b ],
			[ box( 0.7, 0.5, 0.04 ).translate( 0.65 * sx, 1.97, - 0.88 * sz ), 0x7a6950 ],
			[ rod( V( 0.65 * sx - 0.27, 0.7, - 0.88 * sz ), V( 0.65 * sx - 0.27, 2.2, - 0.88 * sz ), 0.02, 7 ), 0x657779 ],
			[ rod( V( 0.65 * sx + 0.27, 0.7, - 0.88 * sz ), V( 0.65 * sx + 0.27, 2.2, - 0.88 * sz ), 0.02, 7 ), 0x657779 ],
		], this.cabin );
		this.photoMesh = new Mesh( new PlaneGeometry( 0.61, 0.40 ), new Material( { color: 0x38565f, roughness: 1 } ) );
		const photoUV = this.photoMesh.geometry.attributes.uv;
		for ( let i = 0; i < photoUV.count; i ++ ) photoUV.setY( i, 1 - photoUV.getY( i ) ); // Decoded photos upload their top row first.
		this.photoMesh.position.set( 0.65 * sx, 1.97, - 0.85 * sz ); this.photoMesh.visible = false; this.cabin.add( this.photoMesh );
		this.exhibits = new Map();
		for ( const item of SALVAGE ) {

			const mesh = relic( item.id, this.cabin ); mesh.scale.setScalar( 0.6 ); mesh.position.set( 0.65 * sx, 1.52, - 0.68 * sz ); this.exhibits.set( item.id, mesh );

		}
		this.bellMount = build( '船钟悬挂支架', [ [ rod( V( 0.65 * sx, 1.84, - 0.88 * sz ), V( 0.65 * sx, 1.84, - 0.68 * sz ), 0.012, 6 ), 0x657779 ],
			[ rod( V( 0.65 * sx, 1.84, - 0.68 * sz ), V( 0.65 * sx, 1.79, - 0.68 * sz ), 0.008, 6 ), 0x657779 ] ], this.cabin );
		this.crane = build( '大船打捞绞盘', [ [ cylinder( 0.16, 0.22, 1.9, 12 ).translate( - 1.45, 1.55, - 4.7 ), 0x657e7c ],
			[ rod( V( - 1.45, 2.45, - 4.7 ), this.hookPoint, 0.09, 10 ), 0xa8ae9d ],
			[ cylinder( 0.23, 0.23, 0.4, 12 ).rotateZ( Math.PI / 2 ).translate( - 1.45, 1.3, - 4.7 ), 0x746c51 ] ], this.cabin );
		this.crane.visible = app.gameState?.boatId === 'offshore';
		this.assets = new AbyssAssets( { scene: this.group, base: BASE, ids: [ 'station', 'tender', 'bell', 'crew' ], placements: [
			{ id: 'station', position: V( STATION.x - 0.6, 1.23 + rise, STATION.z + 0.45 ), rotation: 0, height: 4.8 },
			{ id: 'tender', position: V(), rotation: 0, height: 1.6 },
			{ id: 'bell', position: V(), rotation: 0, height: 0.48 }, { id: 'bell', position: V(), rotation: 0, height: 0.288 },
			{ id: 'crew', position: V(), rotation: 0, height: 1.2 },
		] } );

	}

	update( dt, voyage, state, hour ) {

		dt = Number.isFinite( dt ) ? Math.max( 0, Math.min( dt, 0.1 ) ) : 0;
		this.time += dt;
		this.restoration.update( dt, voyage.restoration );
		const app = this.app, sea = Math.sin( this.time * 1.15 ) * 0.12;
		this.assets.group.visible = true;
		this.group.visible = true;
		this.station.visible = app.camera.position.distanceTo( V( STATION.x, 0, STATION.z ) ) < 280;
		const active = voyage.station >= 4;
		this.lampMat.emissive.setRGB( active ? 0.2 : 0, active ? 1.2 : 0, active ? 0.5 : 0 ); this.light.enabled = active;
		const buoySea = this.waterAt( 0, BUOY, sea ); this.targets.buoy.y = buoySea + 0.6;
		this.buoy.position.set( BUOY.x, buoySea + 0.1, BUOY.z ); this.buoy.rotation.z = sea * 0.2;
		for ( const [ id, item ] of this.salvage ) {

			item.mesh.visible = ! voyage.salvaged.includes( id ) && app.camera.position.distanceTo( item.point ) < 160 && ( id !== 'bell' || ! this.assets.models.has( 'bell' ) );
			item.mesh.position.copy( item.point );
			if ( voyage.hooked === id && this.haul > 0 && app.boat ) {

				app.boat.group.updateWorldMatrix( true, false );
				item.mesh.position.lerp( this.hookPoint.clone().applyMatrix4( app.boat.group.matrixWorld ).add( V( 0, - 0.7, 0 ) ), this.haul );

			}

		}
		const hooked = this.salvage.get( voyage.hooked ); this.rope.visible = !! hooked && this.haul > 0;
		if ( this.rope.visible ) {

			const top = this.hookPoint.clone().applyMatrix4( app.boat.group.matrixWorld ), delta = hooked.mesh.position.clone().sub( top );
			this.rope.position.copy( top ).addScaledVector( delta, 0.5 ); this.rope.scale.y = delta.length(); this.rope.quaternion.setFromUnitVectors( UP, delta.normalize() );

		}
		const event = voyage.event, site = event && EVENT_SITES[ event.site ];
		this.eventGroup.visible = !! site && app.camera.position.distanceTo( V( site.x, 0, site.z ) ) < 240;
		this.visitor.visible = event?.type === 'supply'; this.crate.visible = event?.type === 'drift';
		this.shoal.visible = event?.type === 'shoal'; this.snow.visible = !! site && ( hour >= 19 || hour < 5 ) && event?.type === 'shoal';
		if ( site ) {

			this.eventGroup.position.set( site.x, 0, site.z );
			const height = this.waterAt( 1, site, sea ), bow = this.waterAt( 2, { x: site.x, z: site.z + 2 }, height );
			if ( this.eventSerial !== event.serial ) { this.eventSurfaceY = height; this.eventSerial = event.serial; }
			this.eventSurfaceY += ( height - this.eventSurfaceY ) * ( 1 - Math.exp( - dt * 10 ) );
			this.visitor.position.y = this.eventSurfaceY; this.visitor.rotation.set( Math.max( - 0.2, Math.min( 0.2, ( bow - height ) * 0.4 ) ), 0, sea * 0.25 );
			this.crate.position.set( 0, this.eventSurfaceY + 0.15, 0 ); this.crate.rotation.y = this.time * 0.025;
			for ( let i = 0; i < 42; i ++ ) {

				const a = i * 2.4 + this.time * 0.22, r = 1.8 + i % 5 * 0.45;
				const p = V( Math.cos( a ) * r, - 1.7 + Math.sin( a * 1.7 ) * 0.35, Math.sin( a ) * r );
				this._q.setFromAxisAngle( UP, - a ); this._matrix.compose( p, this._q, this._scale ); this.shoal.setMatrixAt( i, this._matrix );
				p.y += 0.8; this._matrix.compose( p, this._q, this._scale ); this.snow.setMatrixAt( i, this._matrix );

			}
			this.shoal.instanceMatrix.needsUpdate = this.snow.instanceMatrix.needsUpdate = true;

		}
		this.maskAnchor.position.copy( this.visitor.position ); this.maskAnchor.quaternion.copy( this.visitor.quaternion );
		if ( ! this.eventGroup.visible || event?.type !== 'supply' ) this.maskAnchor.position.y = - 10000;
		for ( const [ id, mesh ] of this.exhibits ) mesh.visible = voyage.display === id && voyage.salvaged.includes( id ) && ( id !== 'bell' || ! this.assets.models.has( 'bell' ) );
		this.bellMount.visible = voyage.display === 'bell' && voyage.salvaged.includes( 'bell' );
		this.crane.visible = state.boatId === 'offshore';
		if ( GPU.device ) {

			if ( this.station.visible ) this.assets.load( 'station' );
			if ( this.eventGroup.visible && event?.type === 'supply' ) { this.assets.load( 'tender' ); this.assets.load( 'crew' ); }
			if ( voyage.salvaged.includes( 'bell' ) || app.camera.position.distanceTo( this.salvage.get( 'bell' ).point ) < 130 ) this.assets.load( 'bell' );

		}
		this.stationFallback.visible = ! this.assets.models.has( 'station' );
		this.tenderFallback.visible = ! this.assets.models.has( 'tender' );
		this.crewFootrest.visible = this.assets.models.has( 'tender' ) && this.assets.models.has( 'crew' );
		const station = this.assets.models.get( 'station' ); if ( station ) station.visible = this.station.visible;
		const tender = this.assets.models.get( 'tender' );
		if ( tender ) {

			tender.visible = this.eventGroup.visible && event?.type === 'supply'; tender.staticVelocity = false; tender.frustumCulled = false;
			this.visitor.updateWorldMatrix( true, false );
			this._matrix.copy( this.visitor.matrixWorld ).multiply( new Matrix4().makeTranslation( 0, - 0.55, 0 ) ).scale( V( 1.6, 1.6, 1.6 ) );
			tender.setMatrixAt( 0, this._matrix ); tender.instanceMatrix.needsUpdate = true;

		}
		const crew = this.assets.models.get( 'crew' );
		if ( crew ) {

			crew.visible = this.eventGroup.visible && event?.type === 'supply' && this.assets.models.has( 'tender' ); crew.staticVelocity = false; crew.frustumCulled = false;
			this.visitor.updateWorldMatrix( true, false );
			this._matrix.copy( this.visitor.matrixWorld ).multiply( new Matrix4().makeTranslation( this.crewOffset.x, this.crewOffset.y, this.crewOffset.z ) ).scale( V( 1.2, 1.2, 1.2 ) );
			crew.setMatrixAt( 0, this._matrix ); crew.instanceMatrix.needsUpdate = true;

		}
		const bell = this.assets.models.get( 'bell' );
		if ( bell ) {

			bell.staticVelocity = false; bell.frustumCulled = false;
			const item = this.salvage.get( 'bell' );
			this._matrix.compose( item.mesh.position, this._q.identity(), V( 0.48, 0.48, 0.48 ).multiplyScalar( voyage.salvaged.includes( 'bell' ) ? 0 : 1 ) ); bell.setMatrixAt( 0, this._matrix );
			const exhibit = this.exhibits.get( 'bell' ); exhibit.updateWorldMatrix( true, false );
			this._matrix.copy( exhibit.matrixWorld ).scale( V( 0.48, 0.48, 0.48 ).multiplyScalar( voyage.display === 'bell' && voyage.salvaged.includes( 'bell' ) ? 1 : 0 ) );
			bell.setMatrixAt( 1, this._matrix ); bell.instanceMatrix.needsUpdate = true;

		}
		const photo = state.fieldPhotos[ voyage.photo ]?.image || null;
		if ( GPU.device && photo !== this.photoKey ) this.loadPhoto( photo );
	}

	waterAt( index, point, fallback ) {

		const q = this.app.query;
		if ( this.waterSlot < 0 ) return fallback;
		const slot = this.waterSlot + index; q.setPoint( slot, point.x, point.z );
		if ( ! q.cpuValid || Math.hypot( q.resultInputs[ slot * 4 ] - point.x, q.resultInputs[ slot * 4 + 1 ] - point.z ) > 0.5 ) return fallback;
		const value = q.get( slot ).height;
		return Number.isFinite( value ) && Math.abs( value ) < 15 ? value : fallback;

	}

	async loadPhoto( image ) {

		this.photoKey = image; const version = ++ this.photoVersion;
		this.photoMesh.visible = false;
		if ( ! image ) { this.photoTexture?.destroy(); this.photoTexture = null; return; }
		try {

			const bytes = Uint8Array.from( atob( image.split( ',' )[ 1 ] ), ( c ) => c.charCodeAt( 0 ) );
			const px = await decodeImage( bytes, 'image/jpeg' );
			if ( version !== this.photoVersion ) return;
			this.photoTexture?.destroy(); this.photoTexture = new Texture( { width: px.width, height: px.height, format: 'rgba8unorm-srgb', data: px.data } );
			this.photoMesh.material = new Material( { name: '亲自拍摄的航海照片', roughness: 1, textures: { exhibitPhoto: this.photoTexture },
				surface: 's.albedo = textureSample( exhibitPhoto, smpLinearClamp, in.uv ).rgb; s.specularIntensity = 0.0;' } );
			const aspect = px.width / px.height, frameAspect = 0.61 / 0.40;
			this.photoMesh.scale.set( Math.min( 1, aspect / frameAspect ), Math.min( 1, frameAspect / aspect ), 1 );
			this.photoMesh.visible = true;

		} catch { if ( version === this.photoVersion ) this.photoMesh.visible = false; }

	}

}
