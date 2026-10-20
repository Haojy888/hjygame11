import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { Colliders } from '../src/world/Colliders.js';
import { ExplorationWorld } from '../src/world/ExplorationWorld.js';
import { Player } from '../src/player/Player.js';
import { Input } from '../src/core/Input.js';
import { GameState } from '../src/game/GameState.js';
import { LandmarksController } from '../src/game/LandmarksController.js';
import { LIGHTHOUSE as L, COASTAL_SITES, normalizeLandmarks } from '../src/game/ExplorationLandmarks.js';
import { G } from '../src/core/Globals.js';
import { fieldSubjects } from '../src/game/FieldCamera.js';
import { mapLocations } from '../src/game/WorldMap.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const colliders = new Colliders(), terrain = { heightAt: () => - 12 };
const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 2000 );
const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, sensitivity: 1, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 }, wheel: 0 } );
const query = { count: 0, cpuValid: false, allocate( _, n ) { const slot = this.count; this.count += n; return slot; }, setPoint() {} };
const player = new Player( { camera, input, terrain, colliders, query } );
const lights = { sources: [], add( light ) { this.sources.push( light ); }, flashlight: { on: false } };
const app = { scene: new Scene(), terrainData: terrain, camera, colliders, input, player, localLights: lights };
const world = new ExplorationWorld( app );
const store = new Map(), storage = { setItem: ( k, v ) => store.set( k, v ), getItem: k => store.get( k ) };
const state = new GameState( storage );
let available = true;
const game = { app, state, rod: { equipped: false }, secrets: { available: () => available, point: () => V(), hint: () => '' }, toast() {} };
const controller = new LandmarksController( game, world ); game.landmarks = controller;
assert.deepEqual( normalizeLandmarks( { lighthouseLit: 'true' } ), { lighthouseLit: false } );
assert.equal( new GameState().fromJSON( { v: 2 } ), true );
assert.deepEqual( GameState.load( storage ).landmarks, { lighthouseLit: false } );

function frame( dt ) { player.update( dt ); input.endFrame(); }
function walkTo( target, fps ) {

	for ( let tick = 0; tick < fps * 12; tick ++ ) {

		const dx = target.x - player.position.x, dz = target.z - player.position.z;
		if ( Math.hypot( dx, dz ) < ( fps < 20 ? 0.24 : 0.14 ) && Math.abs( target.y - player.position.y ) < 0.46 ) return;
		player.yaw = Math.atan2( - dx, - dz ); input.keys.add( 'KeyW' ); frame( 1 / fps );

	}
	throw Error( fps + ' FPS cannot walk to ' + JSON.stringify( target ) + ' from ' + JSON.stringify( player.position ) );

}
for ( const fps of [ 12, 60, 144 ] ) {

	player.climbing = null; player.mode = 'swim'; player.position.copy( world.ladderPoint ); player.velocity.set( 0, 0, 0 ); input.keys.add( 'Space' );
	for ( let i = 0; i < fps * 5 && player.mode !== 'walk'; i ++ ) frame( 1 / fps );
	input.keys.clear(); assert.equal( player.mode, 'walk', fps + ' FPS: climb from sea to dock' );
	assert.ok( player.position.distanceTo( world.ladder.climbTo ) < 0.01 );
	const route = [ V( L.x, L.deckY, L.z + 10.6 ), ...world.routes, V( L.x, L.baseY, L.z + 4.5 ), ...world.spiral ];
	for ( const point of route ) walkTo( point, fps );
	walkTo( V( L.x, world.galleryY, L.z + 3.9 ), fps ); input.keys.clear();
	assert.ok( Math.abs( player.position.y - world.galleryY ) < 0.25, fps + ' FPS: actual walk reaches the gallery' );
	for ( const point of [ ...world.spiral ].reverse() ) walkTo( point, fps );
	walkTo( V( L.x, L.baseY, L.z + 4.5 ), fps );
	for ( const point of [ ...world.routes ].reverse() ) walkTo( point, fps );
	walkTo( world.ladder.climbTo, fps ); input.keys.clear();
	assert.ok( Math.abs( player.position.y - L.deckY ) < 0.01, 'the same stairs also allow a normal return' );

}
player.mode = 'walk'; player.position.set( L.x + 3.1, world.galleryY, L.z + 0.2 );
camera.position.copy( player.position ).add( V( 0, 1.62, 0 ) ); camera.lookAt( world.panel ); camera.updateMatrixWorld();
input.pressed.add( 'KeyG' ); available = false; controller.update(); assert.equal( state.landmarks.lighthouseLit, false );
available = true; game.rod.equipped = true; controller.update(); assert.equal( state.landmarks.lighthouseLit, false );
game.rod.equipped = false; controller.update(); assert.equal( state.landmarks.lighthouseLit, true ); input.endFrame();
assert.equal( GameState.load( storage ).landmarks.lighthouseLit, true );
assert.equal( state.repairLighthouse(), false, 'repair is idempotent' );
const blocked = new GameState( { setItem() { throw Error( 'full' ); } } );
assert.equal( blocked.repairLighthouse(), false ); assert.equal( blocked.landmarks.lighthouseLit, false );
const oldNight = G.night.value; G.night.value = 1; controller.prepare( 0.1 ); assert.equal( world.beacon.enabled, true );
G.night.value = 0; controller.prepare( 0.1 ); assert.equal( world.beacon.enabled, false ); G.night.value = oldNight;
camera.position.copy( world.life.dolphins[ 0 ].pos ); controller.prepare( 0 );
assert.deepEqual( [ ...new Set( fieldSubjects( app ).map( s => s.id ) ) ].sort(), [ 'dolphin', 'moray', 'seahorse', 'whalebones' ].sort() );
assert.ok( mapLocations( game ).some( p => p.id === 'lighthouse' && /电源已修复/.test( p.label ) ) );
assert.equal( controller.locations().length, 5 );

// Animals must move continuously, stay in water, and leave a nearby swimmer room.
const life = world.life, home = COASTAL_SITES.dolphin;
app.boatCtl = { position: V( home.x, 0, home.z + 10 ), velocity: V( 0, 0, 2 ), getYaw: () => 0, capsized: false };
player.position.set( 500, 0, 500 ); let followed = false, breached = false;
for ( let i = 0; i < 1000; i ++ ) {

	const before = life.dolphins.map( d => d.pos.clone() ); life.update( 1 / 30 );
	for ( let n = 0; n < 3; n ++ ) {

		const d = life.dolphins[ n ]; assert.ok( Math.hypot( d.pos.x - before[ n ].x, d.pos.z - before[ n ].z ) <= 0.201 );
		assert.ok( [ d.pos.x, d.pos.y, d.pos.z ].every( Number.isFinite ) ); followed ||= d.following; breached ||= d.breaching;
		assert.ok( d.collider.center.distanceTo( d.pos ) < 1e-8, 'moving rounded solids follow the visible body' );

	}

}
assert.ok( followed && breached );
const animal = life.dolphins[ 0 ]; player.position.copy( animal.pos );
life.update( 0.1 ); assert.ok( animal.velocity.lengthSq() > 0, 'a nearby swimmer produces a finite escape direction' );
let triangles = 0; world.group.traverse( o => { if ( o.geometry ) { assert.ok( o.geometry.attributes.position.array.every( Number.isFinite ) ); triangles += o.geometry.index.count / 3; } } );
assert.ok( triangles < 90000, 'all six additions have a bounded geometry budget' );
state.reset(); assert.equal( state.landmarks.lighthouseLit, false );
console.log( 'PASS: real ladder/exterior/spiral stairs both ways at 12/60/144 FPS, guarded repair, persistent/blocked/old saves, night beacon, map/photo subjects, dolphin steering/breach/solids and geometry budget.', { triangles } );
