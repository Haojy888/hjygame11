import assert from 'node:assert/strict';
import { Scene, Group, Vector3, Quaternion, PerspectiveCamera, Ray } from '../src/engine/index.js';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { freshVoyage, normalizeVoyage, SALVAGE, EVENT_SITES } from '../src/game/Voyage.js';
import { VoyageController } from '../src/game/VoyageController.js';
import { VoyageWorld } from '../src/world/VoyageWorld.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { Vendor } from '../src/game/Vendor.js';
import { Input } from '../src/core/Input.js';
import { mapLocations } from '../src/game/WorldMap.js';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { abyssPropGeometry } from '../src/world/AbyssAssets.js';

const data = new Map(), storage = { getItem: ( k ) => data.get( k ), setItem: ( k, v ) => data.set( k, v ) };
const state = new GameState( storage );
const old = new GameState( null ); old.fromJSON( { v: 2, money: 12 } ); assert.deepEqual( old.voyage, freshVoyage() );
const corrupt = normalizeVoyage( { station: 2.5, hooked: 'bad', salvaged: [ 'bell', 'bell', 'bad' ], display: 'bad', cooldown: Infinity,
	event: { type: 'toString', site: 0, remaining: 600, serial: 1 }, log: [ { kind: '<img>', hour: 5 } ] } );
assert.equal( corrupt.station, 0 ); assert.deepEqual( corrupt.salvaged, [ 'bell' ] ); assert.equal( corrupt.event, null ); assert.equal( corrupt.display, 'none' );
assert.equal( state.voyageAction( 'accept' ), false ); state.orderIndex = 2;
for ( const action of [ 'accept', 'buoy', 'record', 'repair', 'return' ] ) {

	assert.equal( state.voyageAction( action, { hour: 9 } ), true ); assert.equal( state.voyageAction( action ), false );
	assert.deepEqual( GameState.load( storage ).voyage, state.voyage );

}
for ( const action of [ undefined, null, 'bad', 'accept' ] ) assert.equal( state.voyageAction( action ), false );
assert.equal( state.money, 0 ); assert.equal( state.voyageAction( 'photo', { id: 'toString' } ), false );
state.voyage.cooldown = 0;
assert.equal( state.voyageAction( 'offer', { type: 'supply', site: 0 } ), true );
const serial = state.voyage.event.serial;
assert.equal( state.voyageAction( 'finish', { serial } ), false );
assert.equal( state.voyageAction( 'respond', { serial: serial + 1 } ), false );
assert.equal( state.voyageAction( 'respond', { serial } ), true );
state.fuel = 9; assert.equal( state.voyageAction( 'finish', { serial } ), false );
state.fuel = 10; assert.equal( state.voyageAction( 'finish', { serial } ), true ); assert.equal( state.fuel, 5 ); assert.equal( state.money, 30 );
assert.equal( state.voyageAction( 'finish', { serial } ), false );
assert.equal( state.voyageAction( 'hook', { id: 'bell' } ), true ); assert.equal( state.voyageAction( 'hook', { id: 'compass' } ), false );
assert.equal( state.voyageAction( 'haul', { id: 'bell' } ), false ); state.boatId = 'offshore';
assert.equal( state.voyageAction( 'haul', { id: 'bell' } ), true ); assert.equal( state.voyage.display, 'bell' );
assert.equal( state.voyageAction( 'haul', { id: 'bell' } ), false ); assert.equal( state.voyageAction( 'display', { id: 'compass' } ), false );
const blocked = new GameState( { setItem() { throw new Error( 'quota' ); } } ); blocked.orderIndex = 2;
assert.equal( blocked.voyageAction( 'accept' ), false ); assert.deepEqual( blocked.voyage, freshVoyage() );
blocked.voyage = { ...freshVoyage(), cooldown: 0, event: { type: 'supply', site: 0, serial: 3, remaining: 10, accepted: true } }; blocked.fuel = 10;
assert.equal( blocked.voyageAction( 'finish', { serial: 3 } ), false ); assert.equal( blocked.fuel, 10 ); assert.equal( blocked.money, 0 ); assert.ok( blocked.voyage.event );
state.reset(); assert.deepEqual( state.voyage, freshVoyage() ); state.orderIndex = 2;

const terrain = new TerrainData(), scene = new Scene(), colliders = new Colliders();
const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 ), input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set() } );
const boat = { group: new Group(), visualScale: new Vector3( 1.35, 1, 1.6 ) }; scene.add( boat.group );
const player = { mode: 'boat', position: new Vector3( 80, 1, 160 ), busy: false }, ui = {};
const app = { scene, terrainData: terrain, colliders, camera, input, player, boat, gameState: state, weather: { rain: false, thunderstorm: false }, settings: { timeOfDay: 18 },
	boatCtl: { position: player.position.clone(), quaternion: new Quaternion(), velocity: new Vector3(), capsized: false } };
const joe = Object.assign( Object.create( Vendor.prototype ), { kind: 'buyer', position: new Vector3( 55, 1, - 70 ), radius: 3 } );
app.ui = { ui };
const game = Object.assign( Object.create( Game.prototype ), { app, state, rod: { equipped: false }, stand: { vendor: joe }, guide: { open: false },
	hud: { invOpen: false, standOpen: false, catchOpen: false, inv: { querySelector: () => null }, toggleInventory( value ) { this.invOpen = value; } }, worldMap: { open: false }, messages: [], toast( message ) { this.messages.push( message ); } } );
const world = new VoyageWorld( app ), controller = game.voyage = new VoyageController( game, { world, random: () => 0 } );
const photoPosition = world.photoMesh.geometry.attributes.position, photoUV = world.photoMesh.geometry.attributes.uv;
for ( let i = 0; i < photoPosition.count; i ++ ) assert.equal( photoUV.getY( i ), photoPosition.getY( i ) > 0 ? 0 : 1, 'photo top edge samples the uploaded first row, not the bottom row' );
for ( const root of [ world.group, world.cabin ] ) root.traverse( ( object ) => {

	const geometry = object.geometry;
	if ( ! geometry ) return;
	for ( const attribute of Object.values( geometry.attributes ) ) assert.ok( attribute.array.every( Number.isFinite ), 'all generated prop vertices, normals and UVs are finite' );

} );
const prepared = {};
for ( const [ id, limit, width, depth ] of [ [ 'station', 19000, 0.75, 2 / 3 ], [ 'tender', 18000, 1.9 / 1.6, 4.5 / 1.6 ], [ 'bell', 6500 ], [ 'crew', 19800 ] ] ) {

	const bytes = readFileSync( new URL( '../public/models/voyage/' + id + '.glb', import.meta.url ) );
	const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const geometry = prepared[ id ] = abyssPropGeometry( gltf ), bounds = geometry.boundingBox;
	assert.ok( geometry.index.count / 3 <= limit && bytes.length < ( id === 'crew' ? 12000000 : 4500000 ), 'real Lux3D assets fit the triangle and download budgets' );
	assert.ok( gltf.images.length > 0 && gltf.images.every( ( im ) => im.bytes?.length > 1000 && ! im.uri && im.mimeType === 'image/png' ), 'all runtime model textures are embedded PNGs' );
	assert.ok( Math.abs( bounds.min.y ) < 0.0001 && Math.abs( bounds.max.y - 1 ) < 0.0001 );
	if ( width ) assert.ok( Math.abs( bounds.max.x - bounds.min.x - width ) < 0.025 && Math.abs( bounds.max.z - bounds.min.z - depth ) < 0.025, 'prepared shelter and tender match actual platform/deck dimensions' );
	assert.equal( gltf.animations.length, 0, 'boat bobbing, moving winch and cabin transforms are runtime actions' );
	if ( id === 'station' ) for ( const x of [ - 0.2, 0, 0.2 ] ) for ( const z of [ - 0.2, 0, 0.2 ] ) {

		const ray = new Ray( new Vector3( x, 0.8, z ), new Vector3( 0, - 1, 0 ) ), pos = geometry.attributes.position, ix = geometry.index.array;
		const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3(); let covered = false;
		for ( let i = 0; i < ix.length; i += 3 ) {

			a.fromBufferAttribute( pos, ix[ i ] ); b.fromBufferAttribute( pos, ix[ i + 1 ] ); c.fromBufferAttribute( pos, ix[ i + 2 ] );
			const point = ray.intersectTriangle( a, b, c, false, hit ); if ( point && point.y > 0.5 ) covered = true;

		}
		assert.ok( covered, 'the generated open roof is actually closed by Blender geometry across the shelter' );

	}

}
const heightHit = ( geometry, x, z, from, direction ) => {

	const ray = new Ray( new Vector3( x, from, z ), new Vector3( 0, direction, 0 ) ), p = geometry.attributes.position, ix = geometry.index.array;
	const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3(); let y = null;
	for ( let i = 0; i < ix.length; i += 3 ) {

		a.fromBufferAttribute( p, ix[ i ] ); b.fromBufferAttribute( p, ix[ i + 1 ] ); c.fromBufferAttribute( p, ix[ i + 2 ] );
		if ( ray.intersectTriangle( a, b, c, false, hit ) && ( y === null || Math.abs( hit.y - from ) < Math.abs( y - from ) ) ) y = hit.y;

	}
	return y;

};
const hip = new Vector3( 0, heightHit( prepared.crew, 0, - 0.12, - 0.1, 1 ), - 0.12 ).multiplyScalar( 1.2 ).add( world.crewOffset );
const bench = heightHit( prepared.tender, hip.x / 1.6, hip.z / 1.6, 2, - 1 ) * 1.6 - 0.55;
assert.ok( Math.abs( hip.y - bench ) < 0.045, 'the actual generated hip surface rests on the actual tender seat without floating or sinking' );
let requests = 0;
globalThis.__assetFile = async () => { requests ++; throw new Error( 'simulated unavailable voyage model' ); };
const warn = console.warn; console.warn = () => {};
try {

	const pending = world.assets.load( 'station' ); assert.equal( world.assets.load( 'station' ), pending );
	assert.equal( await pending, false ); assert.equal( requests, 1 ); assert.equal( world.stationFallback.visible, true );
	assert.equal( world.assets.models.size, 0 ); assert.ok( world.targets.repair && colliders );

} finally { console.warn = warn; delete globalThis.__assetFile; }
game.hud.invOpen = true;
assert.equal( controller.command( 'accept' ), true ); assert.equal( controller.command( 'accept' ), false ); game.hud.invOpen = false;
const arrive = ( point, mode = 'boat' ) => {

	player.mode = mode; player.position.copy( point ).add( new Vector3( 0, mode === 'boat' ? 0.8 : 0, mode === 'boat' ? - 5 : - 2 ) );
	app.boatCtl.position.copy( player.position ); camera.position.copy( player.position ).add( new Vector3( 0, 0.5, 0 ) ); camera.lookAt( point ); camera.updateMatrixWorld();

};
const press = () => { input.pressed.add( 'KeyG' ); controller.update( 0.1 ); input.endFrame(); };
for ( const [ stage, key, mode ] of [ [ 1, 'buoy', 'boat' ], [ 2, 'record', 'swim' ], [ 3, 'repair', 'boat' ] ] ) {

	arrive( world.targets[ key ], mode );
	for ( const [ object, field, value ] of [ [ input, 'focused', false ], [ ui, '_photo', true ], [ game.hud, 'invOpen', true ], [ app, 'freeCam', true ], [ game, 'rescueHold', 1 ] ] ) {

		const old = object[ field ]; object[ field ] = value; press(); assert.equal( state.voyage.station, stage ); object[ field ] = old;

	}
	if ( stage === 3 ) { app.weather.thunderstorm = true; press(); assert.equal( state.voyage.station, 3 ); app.weather.thunderstorm = false; }
	if ( mode === 'boat' ) {

		const near = player.position.clone(); camera.position.copy( world.targets[ key ] ).add( new Vector3( 0, 1, - 3 ) ); camera.lookAt( world.targets[ key ] ); camera.updateMatrixWorld();
		player.position.z -= 20; press(); assert.equal( state.voyage.station, stage, 'a nearby camera cannot interact while the player is too far away' ); player.position.copy( near );
		camera.position.copy( player.position ).add( new Vector3( 0, 3, - 13 ) ); camera.lookAt( world.targets[ key ] ); camera.updateMatrixWorld();
		assert.ok( camera.position.distanceTo( world.targets[ key ] ) > 8, 'normal third-person chase distance exceeds hand interaction range' );

	}
	press(); assert.equal( state.voyage.station, stage + 1, 'actual target, mode, camera framing and collider checks advance the station' );

}
assert.equal( world.light.enabled, true ); player.mode = 'walk'; player.position.copy( joe.position ); game.hud.standOpen = true; game.hud.vendor = joe;
assert.equal( game.returnStation(), true ); assert.equal( game.returnStation(), false ); game.hud.standOpen = false;

state.voyage.cooldown = 0; player.mode = 'boat'; player.position.set( 80, 1, 160 );
assert.equal( controller.offer(), true ); assert.equal( state.voyage.event.type, 'shoal' );
const remaining = state.voyage.event.remaining; game.hud.invOpen = true; controller.update( 0.1 ); assert.equal( state.voyage.event.remaining, remaining );
assert.equal( controller.command( 'respond' ), true ); game.hud.invOpen = false;
const site = EVENT_SITES[ state.voyage.event.site ]; arrive( new Vector3( site.x, - 1.6, site.z ) );
camera.position.copy( player.position ).add( new Vector3( 0, 3, - 13 ) ); camera.lookAt( site.x, - 1.6, site.z ); camera.updateMatrixWorld();
press(); assert.equal( state.voyage.event, null, 'accepted radio encounters can also be completed from a third-person chase camera' );

state.boatId = 'offshore';
const bell = world.salvage.get( 'bell' ); arrive( bell.point, 'swim' ); press(); assert.equal( state.voyage.hooked, 'bell' );
arrive( new Vector3( bell.point.x, 0.7, bell.point.z ) ); app.boatCtl.position.set( bell.point.x, 0, bell.point.z );
input.keys.add( 'KeyG' );
for ( const [ object, field, value ] of [ [ app.weather, 'thunderstorm', true ], [ game.hud, 'invOpen', true ], [ input, 'focused', false ] ] ) {

	const old = object[ field ]; object[ field ] = value; controller.update( 0.1 ); assert.equal( controller.haul, 0 ); object[ field ] = old;

}
app.boatCtl.velocity.x = 2; controller.update( 0.1 ); assert.equal( controller.haul, 0 ); app.boatCtl.velocity.x = 0;
app.boatCtl.quaternion.setFromAxisAngle( new Vector3( 0, 0, 1 ), 0.3 ); controller.update( 0.1 ); assert.equal( controller.haul, 0 ); app.boatCtl.quaternion.identity();
for ( let i = 0; i < 50; i ++ ) controller.update( 0.1 );
const partial = controller.haul; assert.ok( partial > 0.4 && partial < 0.5 );
input.keys.delete( 'KeyG' ); controller.update( 0.1 ); assert.equal( controller.haul, partial ); input.keys.add( 'KeyG' );
game.hud.invOpen = true; app.boatCtl.position.x += 20; controller.update( 0.1 );
assert.equal( controller.haul, 0, 'drifting out of winch range resets partial lifting even while the inventory is open' );
assert.equal( world.haul, 0 ); assert.equal( state.voyage.hooked, 'bell' ); assert.equal( world.rope.visible, false );
app.boatCtl.position.x -= 20; game.hud.invOpen = false;
for ( let i = 0; i < 50; i ++ ) controller.update( 0.1 );
for ( let i = 0; i < 75; i ++ ) controller.update( 0.1 );
assert.deepEqual( state.voyage.salvaged, [ 'bell' ] ); assert.equal( state.voyage.hooked, null ); assert.equal( world.exhibits.get( 'bell' ).visible, true );
assert.ok( GameState.load( storage ).voyage.salvaged.includes( 'bell' ) );
const hud = Object.assign( Object.create( GameHUD.prototype ), { game } ); assert.match( hud.radioMarkup(), /已修复并回港/ ); assert.match( hud.cabinMarkup(), /旧船钟/ );
assert.ok( mapLocations( game ).some( ( entry ) => entry.id === 'station' ) );
assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'salvage-bell' ), false );
for ( const point of [ world.targets.record, ...Array.from( world.salvage.values(), ( value ) => value.point ) ] ) assert.ok( point.y < - 3 && point.y > terrain.heightAt( point.x, point.z ) );
const query = { cpuValid: true, resultInputs: new Float32Array( 64 * 4 ), setPoint() {}, get: () => ( { height: 2 } ) };
const savedQuery = app.query; app.query = query; world.waterSlot = 7;
query.resultInputs[ 28 ] = 115; query.resultInputs[ 29 ] = 248;
assert.equal( world.waterAt( 0, { x: 115, z: 248 }, 0.1 ), 2 );
assert.equal( world.waterAt( 0, { x: 200, z: 248 }, 0.1 ), 0.1, 'a previous event site cannot move the new boat to a stale wave height' );
query.get = () => ( { height: NaN } ); assert.equal( world.waterAt( 0, { x: 115, z: 248 }, 0.1 ), 0.1 );
app.query = savedQuery; world.waterSlot = - 1;
console.log( 'Voyage passed: old saves and rollback, ordered station story, real boat/swim/camera interactions, radio timers and stale responses, fuel accounting, real tilt/storm winch gates, resumable hooks, unique collectibles, cabin and map.' );

if ( process.argv.includes( '--render' ) ) {

	await import( './smaa-shim.mjs' );
	const lux = process.argv.includes( '--lux' );
	globalThis.__assetFile = async ( url ) => {

		const { readFileSync } = await import( 'node:fs' );
		const bytes = readFileSync( new URL( '../public/models/voyage/' + url.split( '/' ).pop(), import.meta.url ) );
		return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

	};
	const { setupLife } = await import( './life-harness.mjs' );
	const { OffshoreBoatModel } = await import( '../src/world/OffshoreBoatModel.js' );
	const { readTexture } = await import( '../src/engine/gpu/Readback.js' );
	const L = await setupLife( { W: 1440, H: 900, ground: { center: [ 110, 270 ], size: 95 }, water: true } );
	const errors = []; L.GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
	const boat = new OffshoreBoatModel(); L.scene.add( boat.group ); boat.group.position.set( 101, 0, 253 );
	const previewApp = { scene: L.scene, terrainData: terrain, camera: L.camera, boat, gameState: state };
	const preview = new VoyageWorld( previewApp );
	if ( lux ) assert.deepEqual( await Promise.all( preview.assets.ids.map( ( id ) => preview.assets.load( id ) ) ), [ true, true, true, true ] );
	const v = { ...freshVoyage(), station: 4, salvaged: [ 'bell' ], display: 'bell' };
	const previewState = { boatId: 'offshore', fieldPhotos: {} };
	const update = ( dt ) => preview.update( dt, v, previewState, 18 );
	const out = resolve( '../voyage' ); mkdirSync( out, { recursive: true } );
	L.camera.position.set( 119, 7, 247 ); L.camera.lookAt( 108, 2.0, 266 );
	await L.run( 5, update ); await L.save( out + '/observatory-and-boat.png' );
	v.event = { type: 'supply', site: 0, remaining: 600, serial: 1, accepted: true };
	L.water.visible = true; L.camera.position.set( 123, 2.8, 153 ); L.camera.lookAt( 120, 0.5, 160 );
	await L.run( 4, update ); await L.save( out + '/radio-supply.png' );
	L.camera.position.set( 121.5, 1.35, 162.4 ); L.camera.lookAt( 120.18, 0.78, 160.12 );
	await L.run( 4, update ); await L.save( out + '/crew-in-engine.png' );
	v.event.type = 'shoal'; L.water.visible = false;
	L.camera.position.set( 123, - 0.6, 155 ); L.camera.lookAt( 120, - 1.8, 160 );
	await L.run( 4, update ); await L.save( out + '/radio-shoal.png' );
	v.hooked = 'compass'; preview.haul = 0.5; boat.group.position.set( - 99, 0, 319 );
	L.camera.position.set( - 108, 4, 310 ); L.camera.lookAt( - 101, - 0.5, 316 ); L.water.visible = true;
	await L.run( 4, update ); await L.save( out + '/winch-and-rope.png' );
	v.hooked = null; preview.haul = 0;
	L.water.visible = false;
	L.camera.position.copy( boat.group.position ).add( new Vector3( - 0.35, 1.9, 1.1 ) );
	L.camera.lookAt( boat.group.position.clone().add( new Vector3( 0.85, 1.73, - 1.1 ) ) );
	// Decoded RGBA fixture checks the real exhibit texture path. Browser JPEG decoding is separate.
	for ( const [ width, height ] of [ [ 4, 2 ], [ 2, 4 ] ] ) {

		globalThis.__assetImage = async () => ( { width, height, data: new Uint8Array( width * height * 4 ).fill( 255 ) } );
		await preview.loadPhoto( 'data:image/jpeg;base64,AAAA' );
		assert.ok( Math.abs( 0.61 * preview.photoMesh.scale.x / ( 0.40 * preview.photoMesh.scale.y ) - width / height ) < 0.001, 'landscape and portrait photos fit the frame without stretching or cropping' );

	}
	globalThis.__assetImage = async () => ( { width: 2, height: 2, data: new Uint8Array( [ 40, 180, 170, 255, 220, 160, 60, 255, 15, 70, 100, 255, 140, 210, 190, 255 ] ) } );
	await preview.loadPhoto( 'data:image/jpeg;base64,AAAA' );
	assert.ok( Math.abs( preview.photoMesh.geometry.parameters.width * preview.photoMesh.scale.x / ( preview.photoMesh.geometry.parameters.height * preview.photoMesh.scale.y ) - 1 ) < 0.001, 'square photography fixture retains its aspect inside the rectangular frame' );
	previewState.fieldPhotos.jelly = { image: 'data:image/jpeg;base64,AAAA' }; v.photo = 'jelly';
	await L.run( 5, update ); await L.save( out + '/cabin-collection.png' );
	assert.equal( preview.photoMesh.visible, true ); assert.equal( preview.exhibits.get( 'bell' ).visible, ! lux );
	if ( lux ) {

		assert.equal( preview.stationFallback.visible, false ); assert.equal( preview.tenderFallback.visible, false );
		assert.ok( preview.assets.models.has( 'crew' ), 'the real seated crew replaces the removed block figure' );
		const bell = preview.assets.models.get( 'bell' );
		assert.ok( Math.abs( bell.instanceMatrix.array[ 16 + 12 ] - ( boat.group.position.x + 0.65 * 1.35 ) ) < 0.001, 'real generated bell is attached to the moving cabin' );

	}
	const data = await readTexture( L.ldr.texture ); assert.ok( new Uint8Array( data.data ).some( ( value ) => value > 30 ) );
	let finishDecode; globalThis.__assetImage = () => new Promise( ( resolve ) => { finishDecode = resolve; } );
	const pendingPhoto = preview.loadPhoto( 'data:image/jpeg;base64,AAAA' ); await preview.loadPhoto( null );
	finishDecode( { width: 1, height: 1, data: new Uint8Array( [ 255, 255, 255, 255 ] ) } ); await pendingPhoto;
	assert.equal( preview.photoMesh.visible, false ); assert.equal( preview.photoTexture, null, 'removing a photo releases its texture and an old decode cannot restore it' );
	assert.deepEqual( errors, [], 'station, boat radio, shoal, moving rope, actual cabin photo material and collectibles render together' );
	console.log( 'Native voyage passed:', L.mr.stats ); await L.exit();

}
