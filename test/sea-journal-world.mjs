// Exercise the real interaction methods with engine cameras, input and world geometry; no DOM or GPU.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Ray, Vector3 } from '../src/engine/index.js';
import { Input } from '../src/core/Input.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { Vendor } from '../src/game/Vendor.js';
import { AbyssScene } from '../src/world/AbyssScene.js';
import { DeepBeast } from '../src/world/DeepBeast.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { WORLD } from '../src/world/WorldLayout.js';

const terrain = new TerrainData(), scene = new Scene(), colliders = new Colliders();
const abyssScene = new AbyssScene( { scene, terrain, colliders } );
const deepBeast = new DeepBeast( { scene, terrain } );
const copy = ( value ) => JSON.parse( JSON.stringify( value ) );

function harness( stage = 2 ) {

	const state = new GameState( null );
	state.orderIndex = 4;
	state.seaJournal = { stage, ending: null };
	const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set() } );
	const player = { mode: 'swim', position: new Vector3(), velocity: new Vector3(), busy: false, prompt: null };
	const vendor = ( kind, x ) => Object.assign( Object.create( Vendor.prototype ), { kind, position: new Vector3( x, 1, - 70 ), radius: 3 } );
	const joe = vendor( 'buyer', 50 ), marta = vendor( 'shop', 85 );
	const hud = { standOpen: false, invOpen: false, catchOpen: false, vendor: joe };
	const ui = { helpOpen: false, panelOpen: false, _photo: false, _start: false };
	const camera = new PerspectiveCamera();
	const game = Object.assign( Object.create( Game.prototype ), {
		state, hud, stand: { vendor: joe }, chandlery: { vendor: marta },
		rod: { equipped: false }, fight: null, landing: null, guide: { open: false }, worldMap: { open: false }, rescueHold: 0,
		messages: [], toast( text ) { this.messages.push( text ); },
		app: { input, player, camera, terrainData: terrain, abyssScene, deepBeast, freeCam: false, ui: { ui }, boatCtl: { capsized: false } },
	} );
	const tick = ( dt = 0.1, press = false ) => {

		player.prompt = null;
		if ( press ) input.pressed.add( 'KeyG' );
		game.updateSeaJournal( dt );
		input.endFrame();

	};
	const arrive = ( distance = 12 ) => {

		const target = game.seaJournalTarget.clone();
		player.mode = 'swim'; player.velocity.set( 0, 0, 0 );
		player.position.copy( target ).add( new Vector3( 0, - 1.5, - distance ) );
		camera.position.copy( player.position ).add( new Vector3( 0, 1.5, 0 ) );
		camera.lookAt( target );

	};
	const watch = ( seconds = 6 ) => { for ( let frame = 0; frame < Math.round( seconds * 10 ); frame ++ ) tick(); };
	if ( stage === 1 || stage === 2 ) arrive( stage === 1 ? 0 : 12 );
	return { game, state, input, player, camera, hud, ui, joe, marta, tick, arrive, watch };

}

{
	const { game, state, player, camera, tick } = harness( 1 );
	const target = game.seaJournalTarget.clone(), gate = abyssScene.gateways[ 0 ];
	assert.equal( target.x, WORLD.abyss.center.x + gate.x );
	assert.equal( target.z, WORLD.abyss.center.z + gate.z );
	assert.equal( target.y, gate.floor + 2.5 );
	assert.ok( target.y > terrain.heightAt( target.x, target.z ) + 1 && target.y < - 4, 'the objective is underwater and above the actual seabed' );
	const forward = new Vector3( Math.sin( gate.yaw ), 0, Math.cos( gate.yaw ) );
	const start = target.clone().addScaledVector( forward, - 5 );
	const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
	const ruin = abyssScene.group.children[ 1 ].geometry, p = ruin.attributes.position, index = ruin.index.array;
	const localStart = start.clone().sub( abyssScene.group.position ), ray = new Ray( localStart, forward );
	for ( let i = 0; i < index.length; i += 3 ) {

		a.fromBufferAttribute( p, index[ i ] ); b.fromBufferAttribute( p, index[ i + 1 ] ); c.fromBufferAttribute( p, index[ i + 2 ] );
		assert.ok( ! ray.intersectTriangle( a, b, c, false, hit ) || hit.distanceTo( localStart ) > 10, 'the real doorway has an open approach' );

	}
	for ( let step = 0; step <= 20; step ++ ) {

		const point = start.clone().addScaledVector( forward, step / 2 );
		point.y = terrain.heightAt( point.x, point.z ) + 2.5;
		assert.ok( point.y > terrain.heightAt( point.x, point.z ) + 0.6 );
		assert.ok( point.y < - 4, 'the sloping-floor approach remains fully underwater' );
		assert.equal( colliders.resolveCapsule( point, 0.3, 1.75 ), false, 'the actual doorway approach is free of collision cores' );

	}
	player.position.copy( target ); camera.position.copy( target ).add( new Vector3( 0, 1.5, 0 ) );
	tick();
	assert.equal( state.seaJournal.stage, 1, 'arrival alone never records the doorway' );
	assert.equal( player.prompt.key, 'G' );
	player.position.x += 10; tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 1, 'G outside doorway range has no effect' );
	player.position.copy( target ).y += 5.6; tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 1, 'G outside the doorway elevation has no effect' );
	player.position.copy( target ); tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 2 );
	assert.equal( game.messages.length, 1 );
	assert.deepEqual( game.seaObservation, { progress: 0, eligible: false, ready: false } );
}

{
	const { game, state, player, camera } = harness();
	const initial = game.seaJournalTarget.clone();
	for ( let frame = 0; frame < 300; frame ++ ) deepBeast.update( 0.1, camera, player );
	const movingTarget = game.seaJournalTarget.clone();
	assert.ok( initial.distanceTo( movingTarget ) > 0.1, 'the objective follows the patrol instead of a fixed origin' );
	assert.ok( movingTarget.distanceTo( deepBeast.creaturePosition.clone().add( new Vector3( 0, 6, 0 ) ) ) < 1e-6 );
	state.seaJournal.stage = 4;
	assert.equal( game.seaJournalTarget, null, 'completed memories no longer point to a world objective' );
}

{
	const { game, state, player, hud, ui, input, joe, marta } = harness( 0 );
	player.mode = 'walk'; player.position.copy( joe.position );
	assert.equal( game.talkSeaJournal( 'accept' ), false, 'a closed panel cannot act remotely' );
	hud.standOpen = true;
	const blocked = [ [ game.app, 'freeCam', true ], [ game.worldMap, 'open', true ], [ ui, 'helpOpen', true ], [ ui, 'panelOpen', true ], [ ui, '_photo', true ], [ ui, '_start', true ], [ game.guide, 'open', true ],
		[ hud, 'invOpen', true ], [ hud, 'catchOpen', true ], [ game, 'fight', {} ], [ game, 'landing', {} ], [ game, 'rescueHold', 0.1 ], [ input, 'enabled', false ], [ input, 'focused', false ], [ input, 'interrupted', true ], [ player, 'mode', 'swim' ] ];
	for ( const [ object, key, value ] of blocked ) {

		const old = object[ key ]; object[ key ] = value;
		assert.equal( game.talkSeaJournal( 'accept' ), false, `${ key } blocks NPC progression` );
		assert.equal( state.seaJournal.stage, 0 ); object[ key ] = old;

	}
	player.position.x += 3;
	assert.equal( game.talkSeaJournal( 'accept' ), false, 'a stale button cannot act outside Joe\'s actual radius' );
	player.position.copy( joe.position ).y += 2.5;
	assert.equal( game.talkSeaJournal( 'accept' ), false, 'a different elevation is not in vendor range' );
	hud.vendor = marta; player.position.copy( marta.position );
	assert.equal( game.talkSeaJournal( 'accept' ), false, 'Marta cannot accept Joe\'s rumor' );
	hud.vendor = Object.assign( Object.create( Vendor.prototype ), joe );
	player.position.copy( joe.position );
	assert.equal( game.talkSeaJournal( 'accept' ), false, 'another buyer object cannot impersonate Joe' );
	hud.vendor = joe;
	assert.equal( game.talkSeaJournal( 'wonder' ), false, 'a stale ending button cannot skip the voyage' );
	assert.equal( game.talkSeaJournal( 'accept' ), true );
	assert.equal( game.talkSeaJournal( 'accept' ), false );
	for ( const choice of [ 'ruins', 'witness', 'wonder', 'peace' ] ) assert.equal( game.talkSeaJournal( choice ), false, 'NPC buttons cannot fake world evidence' );
	state.seaJournal.stage = 3;
	assert.equal( game.talkSeaJournal( 'accept' ), false );
	assert.equal( game.talkSeaJournal( 'peace' ), true );
	assert.equal( game.talkSeaJournal( 'wonder' ), false, 'another click cannot rewrite the completed memory' );
	assert.equal( state.money, 0 );
}

{
	const { game, state, player, tick, watch } = harness();
	tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 2, 'G before observation is ready never advances' );
	watch( 5.8 );
	assert.equal( game.seaObservation.ready, false );
	tick();
	assert.equal( game.seaObservation.ready, true, 'six real observed seconds are required' );
	assert.equal( state.seaJournal.stage, 2, 'six seconds alone never auto-records' );
	assert.equal( player.prompt.key, 'G' );
	tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 3 );
	assert.deepEqual( game.seaObservation, { progress: 0, eligible: false, ready: false } );
	assert.equal( game.messages.length, 1 );
	watch(); tick( 0.1, true );
	assert.equal( state.seaJournal.stage, 3 );
	assert.equal( game.messages.length, 1, 'repeated G cannot record twice' );
}

// Every interruption clears the accumulated observation, including a ready record and held G.
for ( const stage of [ 1, 2 ] ) {

	const { game, state, input, player, camera, hud, ui, tick, watch, arrive } = harness( stage );
	const blocked = [ [ game.app, 'freeCam', true ], [ game.worldMap, 'open', true ], [ ui, 'helpOpen', true ], [ ui, 'panelOpen', true ], [ ui, '_photo', true ], [ ui, '_start', true ], [ game.guide, 'open', true ],
		[ hud, 'invOpen', true ], [ hud, 'standOpen', true ], [ hud, 'catchOpen', true ], [ game, '_cardDismissed', true ], [ input, 'enabled', false ], [ input, 'focused', false ], [ input, 'interrupted', true ],
		[ game, 'rescueHold', 0.1 ], [ game.app.boatCtl, 'capsized', true ], [ player, 'mode', 'walk' ], [ player, 'mode', 'deck' ], [ player, 'mode', 'boat' ], [ player, 'busy', true ], [ game.rod, 'equipped', true ], [ game, 'fight', {} ], [ game, 'landing', {} ] ];
	for ( const [ object, key, value ] of blocked ) {

		game.seaObservation = { progress: 1, eligible: true, ready: true };
		const old = object[ key ]; object[ key ] = value; tick( 0.1, true );
		assert.equal( state.seaJournal.stage, stage, `${ key } blocks diving evidence` );
		assert.deepEqual( game.seaObservation, { progress: 0, eligible: false, ready: false }, `${ key } clears observation` );
		object[ key ] = old;

	}
	for ( const change of [ () => input.keys.add( 'KeyX' ), () => { player.position.y = - 4; }, () => { camera.position.y = - 2; } ] ) {

		arrive( stage === 1 ? 0 : 12 ); game.seaObservation.progress = 1;
		change(); tick( 0.1, true );
		assert.equal( state.seaJournal.stage, stage );
		assert.equal( game.seaObservation.progress, 0 ); input.keys.clear();

	}
	if ( stage === 1 ) continue;
	for ( const interrupt of [ () => player.velocity.set( 1.31, 0, 0 ), () => camera.lookAt( camera.position.clone().add( new Vector3( 0, 0, - 1 ) ) ), () => { player.position.z -= 50; } ] ) {

		arrive(); watch( 3 ); assert.ok( game.seaObservation.progress > 0.49 );
		interrupt(); tick( 0.1, true );
		assert.equal( state.seaJournal.stage, 2 );
		assert.equal( game.seaObservation.progress, 0, 'moving, looking away or leaving resets the continuous observation' );
		assert.equal( game.seaObservation.ready, false );

	}
}

{
	const { game, state, player, camera, tick, arrive, watch } = harness();
	for ( const [ distance, eligible ] of [ [ 17.999, true ], [ 18.001, false ] ] ) {

		arrive( Math.sqrt( distance * distance - 1.5 * 1.5 ) ); tick();
		assert.equal( game.seaObservation.eligible, eligible, 'the 18 m observation limit uses actual player distance' );

	}
	for ( const [ degrees, eligible ] of [ [ 29.9, true ], [ 30.1, false ] ] ) {

		arrive(); const angle = degrees * Math.PI / 180;
		camera.lookAt( camera.position.clone().add( new Vector3( Math.sin( angle ), 0, Math.cos( angle ) ) ) ); tick();
		assert.equal( game.seaObservation.eligible, eligible, 'engine camera direction enforces the 30 degree viewing cone' );

	}
	arrive(); watch( 3 );
	const heightAt = terrain.heightAt;
	try {

		// A controlled ridge on the real TerrainData instance proves that the runtime samples occlusion.
		terrain.heightAt = function ( x, z ) { return Math.max( heightAt.call( this, x, z ), camera.position.y + 1 ); };
		tick( 0.1, true );
		assert.equal( game.seaObservation.eligible, false );
		assert.equal( game.seaObservation.progress, 0, 'terrain occlusion clears partial observation' );
		assert.equal( state.seaJournal.stage, 2 );

	} finally { terrain.heightAt = heightAt; }
	arrive(); watch( 3 );
	try {

		terrain.heightAt = () => NaN;
		tick( 0.1, true );
		assert.equal( game.seaObservation.progress, 0, 'invalid terrain data cannot claim clear visibility' );
		assert.equal( state.seaJournal.stage, 2 );

	} finally { terrain.heightAt = heightAt; }
	arrive(); tick( 60, true );
	assert.ok( Math.abs( game.seaObservation.progress - 0.1 / 6 ) < 1e-10, 'a long frame contributes at most 0.1 seconds' );
	const progress = game.seaObservation.progress;
	for ( const dt of [ NaN, Infinity, - 1 ] ) { tick( dt, true ); assert.equal( game.seaObservation.progress, progress, 'invalid time does not advance observation' ); }
	assert.equal( state.seaJournal.stage, 2 );
}

for ( const stage of [ 1, 2 ] ) {

	const { game, state, player, camera, tick } = harness( stage );
	for ( const object of [ player.position, camera.position ] ) for ( const axis of [ 'x', 'y', 'z' ] ) {

		const before = object[ axis ]; object[ axis ] = NaN;
		tick( 0.1, true );
		assert.equal( state.seaJournal.stage, stage, 'nonfinite position cannot fake a dive or doorway visit' );
		assert.equal( game.seaObservation.progress, 0 ); object[ axis ] = before;

	}
}

{
	const { game, state, player, hud, joe } = harness( 0 );
	player.mode = 'walk'; player.position.copy( joe.position ); hud.standOpen = true;
	assert.equal( game.talkStory( 'accept' ), true );
	assert.deepEqual( state.seaJournal, { stage: 0, ending: null } );
	const story = copy( state.story );
	assert.equal( game.talkSeaJournal( 'accept' ), true );
	assert.deepEqual( state.story, story, 'accepting deep-sea exploration leaves the old harbor clue active' );
	state.seaJournal.stage = 3;
	assert.equal( game.talkSeaJournal( 'wonder' ), true );
	assert.deepEqual( state.story, story, 'the personal memory does not resolve the harbor story' );
	assert.equal( state.money, 0 );
}

console.log( 'Sea journal world passed: real doorway geometry, colliders and terrain, moving patrol target, Joe dialogue gates, actual underwater camera and G, 6-second observation, range/cone/time boundaries, all interruption resets, occlusion and independent stories.' );
