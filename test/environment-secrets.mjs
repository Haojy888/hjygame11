import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { Player } from '../src/player/Player.js';
import { Input } from '../src/core/Input.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { mapLocations } from '../src/game/WorldMap.js';
import { SecretsController } from '../src/game/SecretsController.js';
import { SECRET_SITES, NIGHT_TRAIL, SECRET_CLEARINGS, nearSecret, freshSecrets, normalizeSecrets, tideAt, advanceTide, secretNight, secretHint } from '../src/game/Secrets.js';
import { Rocks } from '../src/world/Rocks.js';
import { VegSite } from '../src/world/vegetation/Scatter.js';
import { DebrisPlacer } from '../src/world/debris/DebrisPlacement.js';
import { mulberry32 } from '../src/util/Noise.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
assert.equal( tideAt( 0 ), 0.65 ); assert.equal( tideAt( 6 ), - 0.65 ); assert.equal( tideAt( 12 ), 0.65 ); assert.equal( tideAt( 18 ), - 0.65 );
for ( const dt of [ NaN, Infinity, - 1, 0 ] ) assert.equal( advanceTide( 0.2, 18, dt ), 0.2 );
assert.ok( Math.abs( advanceTide( 0.65, 18, 10 ) - 0.65 ) <= 0.004001, 'a time slider jump cannot suddenly move the sea or kick a boat' );
assert.equal( secretNight( 20 ), true ); assert.equal( secretNight( 4.99 ), true ); assert.equal( secretNight( 5 ), false ); assert.equal( secretNight( 19.99 ), false );
for ( const s of SECRET_SITES ) assert.match( secretHint( s.id, freshSecrets() ), /H/, 'environment hints use the real settings shortcut' );
assert.deepEqual( normalizeSecrets( null ), freshSecrets() );
assert.deepEqual( normalizeSecrets( { found: [ 'night', 'night', '<script>' ], nightStep: 99, stormCleared: true } ), { found: [ 'night' ], nightStep: 4, stormSeen: false, stormCleared: false } );
const values = new Map(), storage = { setItem( k, v ) { values.set( k, v ); }, getItem: k => values.get( k ) };
const state = new GameState( storage );
const legacy = new GameState( storage ); assert.ok( legacy.fromJSON( { v: 2, money: 12 } ) ); assert.deepEqual( legacy.secrets, freshSecrets() );
const broken = new GameState( { setItem() { throw new Error( 'quota' ); } } );
assert.equal( broken.secretEvent( 'record', { id: 'tide' } ), false ); assert.deepEqual( broken.secrets, freshSecrets() );
assert.equal( broken.secretEvent( 'trail', { index: 0 } ), false ); assert.equal( broken.secrets.nightStep, 0 );
assert.equal( broken.secretEvent( 'storm-seen' ), true, 'weather can still change without writable storage' );
assert.equal( state.secretEvent( 'record', { id: 'storm' } ), false ); assert.equal( state.secretEvent( 'trail', { index: 3 } ), false );

const scene = new Scene(), terrain = new TerrainData(), colliders = new Colliders(), camera = new PerspectiveCamera( 62, 16 / 10, 0.05, 500 );
const vegetation = Object.create( VegSite.prototype ), debris = new DebrisPlacer( { terrain } ); vegetation.setObstacles( [], [] );
const rocks = Rocks.prototype._place.call( { terrainData: terrain, village: null }, mulberry32( 4242 ) );
assert.ok( rocks.length > 100 );
for ( const r of rocks ) assert.equal( nearSecret( r.x, r.z, r.size ), false, 'procedural boulders leave the secret approaches clear' );
for ( const p of SECRET_CLEARINGS ) {

	assert.ok( vegetation.obstacleDist( p.x, p.z ) < 0 ); assert.equal( debris.clear( p.x, p.z, 0.5 ), false, 'clutter cannot spawn over a discovery' );

}
const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, sensitivity: 1, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 } } );
const query = { allocate: () => 0, cpuValid: true, cpu: new Float32Array( 4 ), setPoint() {} };
const player = new Player( { camera, input, terrain, colliders, query } );
const app = { scene, terrainData: terrain, colliders, camera, player, input, settings: { timeOfDay: 12 }, weather: { thunderstorm: false }, ui: { ui: {} } };
const game = Object.assign( Object.create( Game.prototype ), { app, state, rod: { equipped: false }, messages: [], toast( s ) { this.messages.push( s ); } } );
G.seaLevel.value = 0;
const controller = new SecretsController( game ); game.secrets = controller;
const tick = ( dt = 1 / 60, press = false ) => {

	controller.prepare( dt ); query.cpu[ 0 ] = G.seaLevel.value;
	player.update( dt ); if ( press ) input.pressed.add( 'KeyG' ); controller.update(); input.endFrame();

};
const wait = ( seconds, fps = 30 ) => { for ( let i = 0; i < seconds * fps; i ++ ) tick( 1 / fps ); };
function visit( point, floor = null ) {

	input.keys.clear(); player.velocity.set( 0, 0, 0 ); player.position.copy( point ).add( V( 0, 0, 1.5 ) );
	player.position.y = floor ?? player.groundAt( player.position.x, player.position.z, 10 );
	player.mode = 'walk'; player.floating = false; player._camY = null;
	const eye = player.position.clone().add( V( 0, 1.62, 0 ) ), dir = point.clone().sub( eye ).normalize();
	player.yaw = Math.atan2( - dir.x, - dir.z ); player.pitch = Math.asin( dir.y ); tick();

}

wait( 18 ); assert.ok( controller.tide > 0.64 );
visit( controller.point( 'tide' ), controller.world.cave.position.y ); tick( 1 / 60, true );
assert.equal( state.secrets.found.length, 0 ); assert.match( player.prompt.text, /等待退潮/ );
app.settings.timeOfDay = 18; wait( 34 );
assert.ok( controller.tide < - 0.64 && controller.world.tideClue.visible );
for ( const fps of [ 12, 60, 144 ] ) {

	const cave = controller.world.cave.position;
	player.position.copy( cave ).add( V( 0, 0, 5 ) ); player.position.y = player.groundAt( player.position.x, player.position.z, 10 );
	player.mode = 'walk'; player.velocity.set( 0, 0, 0 ); player._camY = null; player.yaw = 0; player.pitch = 0;
	input.keys.add( 'KeyW' ); wait( 1.6, fps ); input.keys.clear();
	assert.ok( player.position.z < cave.z + 1.5, fps + ' FPS: walk from the low-tide shore through the real cave opening' );
	assert.ok( Math.abs( player.position.y - cave.y ) < 0.1 && player.mode === 'walk', 'the exposed shelf supports the actual player' );
	const clear = player.position.clone(); colliders.resolveCapsule( clear, 0.3, 1.75 );
	assert.ok( clear.distanceTo( player.position ) < 0.001, 'rock walls and roof leave body and head clearance' );

}
visit( controller.point( 'tide' ), controller.world.cave.position.y ); tick( 1 / 60, true );
assert.deepEqual( state.secrets.found, [ 'tide' ] ); tick( 1 / 60, true ); assert.equal( state.secrets.found.length, 1 );

visit( controller.point( 'night' ) ); tick( 1 / 60, true ); assert.equal( state.secrets.nightStep, 0, 'daylight cannot record an invisible trail' );
app.settings.timeOfDay = 21; tick(); assert.ok( controller.world.glow.visible );
visit( controller.point( 'night' ) );
for ( const [ object, key, value ] of [ [ app, 'freeCam', true ], [ app.ui.ui, '_photo', true ], [ app.ui.ui, 'helpOpen', true ], [ app.ui.ui, 'panelOpen', true ], [ input, 'enabled', false ], [ input, 'focused', false ], [ input, 'interrupted', true ], [ player, 'busy', true ], [ game.rod, 'equipped', true ] ] ) {

	const old = object[ key ]; object[ key ] = value; input.pressed.add( 'KeyG' ); controller.update(); input.endFrame(); object[ key ] = old;
	assert.equal( state.secrets.nightStep, 0, key + ': menu/free-camera/focus states cannot collect discoveries' );

}
for ( let i = 0; i < NIGHT_TRAIL.length; i ++ ) {

	visit( controller.point( 'night' ) ); tick( 1 / 60, true ); assert.equal( state.secrets.nightStep, i + 1 );
	if ( i === 1 ) { app.settings.timeOfDay = 12; tick(); assert.equal( controller.world.glow.visible, false ); assert.equal( state.secrets.nightStep, 2 ); app.settings.timeOfDay = 21; }

}
assert.ok( state.secrets.found.includes( 'night' ) );

app.weather.thunderstorm = true; app.freeCam = true; wait( 11 ); assert.equal( state.secrets.stormSeen, false );
app.freeCam = false; wait( 11 ); assert.ok( state.secrets.stormSeen ); assert.equal( controller.world.opening, 0 );
app.weather.thunderstorm = false; wait( 2 ); assert.ok( state.secrets.stormCleared && controller.world.opening > 0.99 );
const cabin = controller.world.cabin.position;
for ( const fps of [ 12, 30, 60, 144 ] ) {

	app.weather.thunderstorm = false; wait( 2, fps );
	player.position.copy( cabin ).add( V( 0, 0.35, 7 ) ); player.velocity.set( 0, 0, 0 ); player.mode = 'swim'; player.floating = false; player._camY = null;
	player.yaw = 0; player.pitch = 0; input.keys.add( 'KeyW' ); wait( 7, fps ); input.keys.clear();
	assert.ok( player.position.z < cabin.z + 0.5, fps + ' FPS: the actual swimmer can enter the revealed side cabin' );
	app.weather.thunderstorm = true; wait( 2, fps );
	assert.ok( controller.world.opening > 0.99, 'a new storm cannot close the hatch around a player inside' );
	input.keys.add( 'KeyS' ); wait( 9, fps ); input.keys.clear(); wait( 2, fps );
	assert.ok( player.position.z > cabin.z + 7.2, 'the player can swim out while the storm returns' );
	assert.ok( controller.world.opening < 0.05, 'the hatch closes only after the player and door swing zone are clear' );

}
app.weather.thunderstorm = false; wait( 2 );
// Aim from inside the real cabin. Swim eye height is low, so look using the
// actual final camera after Player.update instead of a walking-camera fixture.
player.position.copy( cabin ).add( V( 0, 0.35, - 1.3 ) ); player.mode = 'swim'; player.velocity.set( 0, 0, 0 ); player.floating = false; player._camY = null;
const point = controller.point( 'storm' ), eye = player.position.clone().add( V( 0, 0.162, 0 ) ), dir = point.clone().sub( eye ).normalize();
player.yaw = Math.atan2( - dir.x, - dir.z ); player.pitch = Math.asin( dir.y ); tick( 1 / 60, true );
assert.ok( state.secrets.found.includes( 'storm' ), 'read the actual nameplate after entering the side cabin' );
const saved = GameState.load( storage ); assert.deepEqual( saved.secrets, state.secrets ); assert.equal( state.money, 0, 'discoveries never duplicate currency or quest rewards' );
const locations = mapLocations( { state, app, secrets: controller } );
assert.equal( locations.filter( p => p.id.startsWith( 'secret-' ) ).length, 3 );
const markup = GameHUD.prototype.secretsMarkup.call( { game } );
for ( const s of SECRET_SITES ) assert.ok( markup.includes( s.keepsake ) ); assert.ok( markup.includes( '追潮寻迹者' ) );
const meshes = []; for ( const group of controller.world.groups ) group.traverse( o => { if ( o.isMesh ) meshes.push( o ); } );
assert.ok( meshes.length <= 7, 'all three secrets use a small fixed number of merged meshes' );
assert.ok( meshes.reduce( ( n, m ) => n + m.geometry.index.count / 3, 0 ) < 20000 );
console.log( 'Environment secrets passed: old/corrupt saves, atomic discovery/trail progress, smooth real seaLevel, tide and night gates, input interruptions, real storm aftermath, 12/30/60/144 FPS cabin entry/escape, persistent keepsakes, map/journal and geometry budget.' );

if ( process.argv.includes( '--render' ) ) {

	const { setupLife, groundMesh } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const { mkdirSync } = await import( 'node:fs' ); const { resolve } = await import( 'node:path' );
	const L = await setupLife( { W: 1440, H: 900, ground: null } ), errors = [];
	GPU.device.addEventListener( 'uncapturederror', e => errors.push( e.error.message ) );
	for ( const g of controller.world.groups ) L.scene.add( g );
	for ( const [ x, z, size ] of [ [ - 165, - 15, 32 ], [ 185, - 10, 42 ], [ 135, 190, 35 ] ] ) L.scene.add( groundMesh( terrain, x, z, size ) );
	const out = resolve( '../environment-secrets' ); mkdirSync( out, { recursive: true } );
	const shots = [ [ 'low-tide-cave', controller.world.cave.position, V( 9, 6, 13 ), { low: true, night: false, revealed: false } ],
		[ 'night-trail', controller.world.trail[ 1 ], V( 10, 9, 12 ), { low: false, night: true, revealed: false } ],
		[ 'storm-side-cabin', cabin, V( 8, 5, 13 ), { low: false, night: false, revealed: true } ] ];
	for ( const [ name, centre, offset, conditions ] of shots ) {

		L.camera.position.copy( centre ).add( offset ); L.camera.lookAt( centre.clone().add( V( 0, 0.9, 0 ) ) );
		L.sky = conditions.night ? [ 0.004, 0.012, 0.02, 1 ] : [ 0.18, 0.28, 0.36, 1 ];
		G.sunColor.value.setRGB( ...( conditions.night ? [ 0.06, 0.09, 0.14 ] : [ 3.2, 3.0, 2.7 ] ) );
		G.skyIrradiance.value.setRGB( ...( conditions.night ? [ 0.02, 0.04, 0.06 ] : [ 0.22, 0.3, 0.42 ] ) );
		await L.run( 100, dt => controller.world.update( dt, conditions, player, L.camera ) ); await L.save( out + '/' + name + '.png' );

	}
	assert.deepEqual( errors, [], 'all secret geometry and night markings compile in native main/shadow passes' );
	console.log( 'Native secrets draws:', L.mr.stats ); await L.exit();

}

if ( process.argv.includes( '--ocean' ) ) {

	const { makeOceanScene } = await import( './ocean-scene.mjs' );
	const { groundMesh } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const { readBuffer } = await import( '../src/engine/gpu/Readback.js' );
	const { WaterQuery } = await import( '../src/ocean/WaterQuery.js' );
	const { BoatModel } = await import( '../src/world/BoatModel.js' );
	const { BoatController } = await import( '../src/player/BoatController.js' );
	const { mkdirSync } = await import( 'node:fs' ); const { resolve } = await import( 'node:path' );
	const O = await makeOceanScene( { W: 1280, H: 800, terrain: false, floor: false, caustics: false } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', e => errors.push( e.error.message ) );
	O.surface.amplitude.value = 0; // controlled tide measurement with the actual ocean/query shaders
	const waterQuery = new WaterQuery( null, O.surface ), model = new BoatModel();
	const boat = new BoatController( { model, terrain: { heightAt: () => - 100 }, colliders: new Colliders(), query: waterQuery } ); boat.moored = false;
	O.scene.add( controller.world.cave ); O.scene.add( groundMesh( terrain, - 165, - 15, 45 ) );
	O.camera.position.copy( controller.world.cave.position ).add( V( 10, 5, 13 ) ); O.camera.lookAt( controller.world.cave.position.clone().add( V( 0, 0.8, 0 ) ) );
	O.before.push( () => { G.cameraWaterHeight.value = G.seaLevel.value; G.cameraUnderwater.value = 0; boat.queueQueries(); waterQuery.update(); } );
	const out = resolve( '../environment-secrets' ); mkdirSync( out, { recursive: true } );
	const heights = []; let simulationTime = 0, simulatedLevel = 0;
	for ( const [ hour, name ] of [ [ 0, 'high-tide-ocean' ], [ 6, 'low-tide-ocean' ] ] ) {

		const level = tideAt( hour ); G.seaLevel.value = level;
		controller.world.update( 0.1, { low: level <= - 0.35, night: false, revealed: false }, player, O.camera );
		O.frame(); await GPU.queue.onSubmittedWorkDone();
		const samples = new Float32Array( await readBuffer( waterQuery.results, 64 * 16 ) );
		for ( let i = 0; i < waterQuery.count; i ++ ) assert.ok( Math.abs( samples[ i * 4 ] - level ) < 0.00001, 'real GPU camera and hull water queries follow the same tide as the surface' );
		for ( let frame = 0; frame < 3000; frame ++ ) {

			const dt = 1 / 60; simulationTime += dt; simulatedLevel = advanceTide( simulatedLevel, hour, dt );
			waterQuery.cpu.set( samples ); for ( let i = 0; i < waterQuery.count; i ++ ) waterQuery.cpu[ i * 4 ] = simulatedLevel;
			boat.queueQueries(); waterQuery.resultInputs.set( waterQuery.inputs ); waterQuery.cpuValid = true; waterQuery.resultTime = simulationTime; waterQuery.version ++;
			boat.update( dt );

		}
		assert.equal( boat.capsized, false, 'smooth tide transitions never capsize the real boat controller' ); heights.push( boat.position.y );
		O.frame(); await GPU.queue.onSubmittedWorkDone(); await O.save( out + '/' + name + '.png' );

	}
	assert.ok( Math.abs( heights[ 0 ] - heights[ 1 ] - 1.3 ) < 0.06, 'the same rigid boat floats 1.3 metres higher at high tide' );
	assert.deepEqual( errors, [], 'actual ocean material, refraction-facing surface and water-query compute compile with varying seaLevel' );
	console.log( 'Native tides passed: GPU water-query heights ±0.65 m, real boat buoyancy difference', heights[ 0 ] - heights[ 1 ] );
	process.exit( 0 );

}
