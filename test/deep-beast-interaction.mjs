import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { DeepBeast } from '../src/world/DeepBeast.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { LocalLights } from '../src/materials/LocalLights.js';
import { Input } from '../src/core/Input.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { FieldCamera, subjectVisible } from '../src/game/FieldCamera.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const terrain = new TerrainData(), colliders = new Colliders(), scene = new Scene();
const beast = new DeepBeast( { scene, terrain, colliders } ), camera = new PerspectiveCamera( 58, 16 / 10, 0.05, 500 );
const lights = new LocalLights(), actor = { mode: 'swim', position: V(), velocity: V(), busy: false };
const world = p => p.clone().applyQuaternion( beast.mesh.quaternion ).add( beast.creaturePosition );
const original = beast.model.geometry.attributes.position.array, inkGeometry = beast.inkMesh.geometry;
function tick( local = V( 0, 6, 12 ), seconds = 2, { away = false, free = false, fps = 60 } = {} ) {

	for ( let i = 0; i < seconds * fps; i ++ ) {

		actor.position.copy( world( local ) ); camera.position.copy( actor.position ).add( V( 0, 0.162, 0 ) );
		camera.lookAt( away ? camera.position.clone().add( V( 0, 0, 10 ) ) : world( V( 0, 4.55, 3.3 ) ) ); camera.updateMatrixWorld( true );
		lights.update( camera, 1 / fps ); beast.update( 1 / fps, camera, free ? null : actor, lights );

	}

}
tick( V( - 5, 6, 12 ) ); assert.ok( beast.reaction.x < - 0.4, 'eyes follow a visitor on the left' );
tick( V( 5, 8, 12 ) ); assert.ok( beast.reaction.x > 0.4 && beast.reaction.y > 0.25, 'eyes follow right/up without snapping' );
assert.ok( beast.reaction.w < 0.01 && beast.ink.bursts === 0, 'normal observation distance is calm' );
const before = beast.reaction.clone(); tick( V( - 5, 6, 12 ), 1 / 60 );
assert.deepEqual( beast.material.uniforms.previousReaction.value, before, 'eye/fold changes preserve the previous pose for temporal rendering' );

lights.toggleFlashlight( true ); tick();
assert.ok( beast.reaction.z > 0.8, 'an actual held torch aimed at the face produces a response' );
tick( V( 0, 6, 12 ), 3, { away: true } ); assert.ok( beast.reaction.z < 0.01, 'a torch aimed elsewhere does not trigger a response' );
tick(); assert.ok( beast.reaction.z > 0.8 );
const obstruction = colliders.addBox( camera.position.clone().lerp( beast._focus, 0.5 ), V( 1, 1, 1 ) );
tick( V( 0, 6, 12 ), 3 ); assert.ok( beast.reaction.z < 0.01, 'the beam cannot pass through a stone obstruction' );
colliders.boxes.splice( colliders.boxes.indexOf( obstruction ), 1 );
lights.enabled = false; tick(); assert.ok( beast.reaction.z < 0.01, 'disabled local lights produce no beam stimulus' );
lights.enabled = true; tick( V( 0, 6, 45 ) ); assert.ok( beast.reaction.z < 0.01, 'a distant torch is out of range' );
tick( V( 0, 3.8, 5.2 ), 3, { free: true } );
assert.ok( beast.reaction.w < 0.01 && beast.ink.bursts === 0, 'a free camera cannot startle the creature' );
lights.toggleFlashlight( false );

for ( const fps of [ 12, 30, 60, 144 ] ) {

	// Reset the encounter between independent frame-rate runs, retaining the
	// actual terrain, skin and pre-allocated collision/ink meshes.
	beast.ink.age = - 1; beast.ink.cooldown = 0; beast._inkArmed = true; beast._closeTime = 0;
	tick( V( 0, 3.8, 5.2 ), 1, { fps } );
	assert.ok( beast.reaction.w > 0.7 && beast.ink.age < 0, fps + ' FPS: arms warn before spraying' );
	const bursts = beast.ink.bursts;
	tick( V( 0, 3.8, 5.2 ), 1, { fps } );
	assert.equal( beast.ink.bursts, bursts + 1 ); assert.ok( beast.inkMesh.visible && beast.ink.density > 0.2 );
	assert.equal( beast.inkMesh.parent, scene, 'the emitted cloud stays in world space instead of following the patrol' );
	tick( V( 0, 3.8, 5.2 ), 20, { fps } );
	assert.equal( beast.ink.bursts, bursts + 1, 'remaining beside the creature cannot spam new clouds' );
	assert.equal( beast.inkMesh.visible, false, 'a cloud fully disperses while the visitor stays nearby' );
	tick( V( 0, 6, 12 ), 4, { fps } ); assert.ok( beast.reaction.w < 0.01, 'retreat restores calm' );

}

tick( V( 0, 3.8, 5.2 ), 2 ); assert.ok( beast.ink.age >= 0, 'returning after retreat/cooldown can provoke another response' );
const target = beast.creaturePosition.clone().add( V( 0, 6, 0 ) );
actor.position.copy( beast.inkMesh.position ); camera.position.copy( actor.position ).add( V( 0, 0.162, 0 ) );
camera.lookAt( target ); camera.updateMatrixWorld( true );
assert.ok( beast.inkOccludes( camera.position, target ) );
const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set() } );
const state = new GameState( null ); state.orderIndex = 4; state.seaJournalEvent( 'accept' ); state.seaJournalEvent( 'ruins' );
const ui = { _photo: false }, app = { player: actor, camera, input, deepBeast: beast, colliders, terrainData: terrain, ui: { ui } };
const game = Object.assign( Object.create( Game.prototype ), { app, state, rod: { equipped: false }, toast() {} } );
game.updateSeaJournal( 0.1 ); assert.equal( game.seaObservation.eligible, false ); assert.match( actor.prompt.text, /墨雾/ );
assert.equal( subjectVisible( app, target, 24 ), false, 'ink conceals the real photography subject' );
ui._photo = true; const photo = new FieldCamera( game ); input.pressed.add( 'KeyG' ); photo.update( 0.1 ); input.endFrame();
assert.equal( photo.pending, null, 'an obscured photograph is not queued' );
tick( V( 0, 6, 12 ), 7 );
camera.lookAt( game.seaJournalTarget ); camera.updateMatrixWorld( true );
input.pressed.add( 'KeyG' ); photo.update( 1 ); input.endFrame();
assert.equal( photo.pending, 'elder', 'the same target can be photographed after the cloud disperses' );
ui._photo = false;
for ( let i = 0; i < 370; i ++ ) {

	tick( V( 0, 6, 12 ), 1 / 60 ); camera.lookAt( game.seaJournalTarget ); camera.updateMatrixWorld( true ); game.updateSeaJournal( 1 / 60 );

}
assert.ok( game.seaObservation.ready ); input.pressed.add( 'KeyG' ); game.updateSeaJournal( 1 / 60 ); input.endFrame();
assert.equal( state.seaJournal.stage, 3, 'the existing story remains completable at a calm observation distance' );
assert.equal( beast.model.geometry.attributes.position.array, original, 'the interaction never rebuilds the high-resolution creature' );
assert.equal( beast.inkMesh.geometry, inkGeometry, 'all bursts reuse one small cloud mesh' );
assert.ok( inkGeometry.index.count / 3 < 3000 );
console.log( 'Deep beast interaction passed: smooth gaze, real torch direction/range/occlusion, free-camera exclusion, 12/30/60/144 FPS warning/ink/cooldown/retreat, reusable cloud, actual photograph and six-second journal recovery.' );

if ( process.argv.includes( '--render' ) ) {

	const { setupLife, groundMesh } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const { readFileSync, mkdirSync } = await import( 'node:fs' );
	const { resolve } = await import( 'node:path' );
	const L = await setupLife( { W: 1280, H: 900, ground: null, fov: 48 } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', e => errors.push( e.error.message ) );
	L.scene.add( beast.group ); L.scene.add( beast.inkMesh );
	L.scene.add( groundMesh( terrain, beast.position.x, beast.position.z, 75 ) );
	L.sky = [ 0.008, 0.026, 0.035, 1 ];
	if ( process.argv.includes( '--lux' ) ) {

		await import( './smaa-shim.mjs' );
		globalThis.__assetFile = async () => {

			const bytes = readFileSync( new URL( '../public/models/creatures/abyssal-elder.glb', import.meta.url ) );
			return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

		};
		assert.equal( await beast.loadRealistic(), true );

	} else beast.ready = Promise.resolve( false ); // exercise the original skin without a network request
	const out = resolve( process.argv.find( a => a.startsWith( '--out=' ) )?.slice( 6 ) || '../beast-interaction' ); mkdirSync( out, { recursive: true } );
	const render = async ( name, local, torch = false, close = false ) => {

		beast.ink.age = - 1; beast.ink.cooldown = 0; beast._inkArmed = true; beast._closeTime = 0;
		beast.reaction.set( 0, 0, 0, 0 ); lights.toggleFlashlight( torch );
		L.camera.position.copy( world( V( 0, 5.7, close ? 18 : 11 ) ) );
		L.camera.lookAt( world( V( 0, 4.7, 2.3 ) ) );
		await L.run( close ? 190 : 100, dt => {

			actor.position.copy( world( local ) ); lights.update( L.camera, dt ); beast.update( dt, L.camera, actor, lights );

		} );
		await L.save( out + '/' + name + '.png' );

	};
	await render( 'eyes-left', V( - 6, 5, 11 ) );
	await render( 'eyes-right', V( 6, 5, 11 ) );
	await render( 'torch-response', V( 0, 5, 11 ), true );
	await render( 'calm', V( 0, 6, 12 ), true, true );
	await render( 'defence-and-ink', V( 0, 3.8, 5.2 ), true, true );
	assert.ok( beast.inkMesh.visible );
	assert.deepEqual( errors, [], 'gaze, defensive pose, original/textured skin and transparent ink compile without GPU errors' );
	console.log( 'Native interaction draws:', L.mr.stats ); await L.exit();

}
