// CPU regression: real boat/player rescue, actual pier colliders, and saved game ownership.
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { Input } from '../src/core/Input.js';
import { BoatController } from '../src/player/BoatController.js';
import { Player } from '../src/player/Player.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { FishingRod } from '../src/game/FishingRod.js';
import { Colliders } from '../src/world/Colliders.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { buildPier } from '../src/world/Pier.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Rand } from '../src/world/Props.js';
import { WORLD } from '../src/world/WorldLayout.js';

const terrain = { heightAt: () => - 4 };
const colliders = new Colliders();
buildPier( { B: new Builder(), terrain, colliders, rand: new Rand( () => 0.5 ), lights: [], inst: { add() {} } } );
const roll = ( boat, degrees ) => boat.quaternion.setFromAxisAngle( new Vector3( 0, 0, 1 ), degrees * Math.PI / 180 );
const tickCapsize = ( boat, frames ) => { for ( let i = 0; i < frames; i ++ ) boat.updateCapsize( 0.1 ); };

function harness() {

	const query = {
		count: 0, cpuValid: false, version: 0, resultTime: 0, latency: 0.05,
		points: new Float32Array( 256 ), cpu: new Float32Array( 256 ), resultInputs: new Float32Array( 256 ),
		allocate( name, count ) { const start = this.count; this.count += count; return start; },
		setPoint( slot, x, z ) { this.points[ slot * 4 ] = x; this.points[ slot * 4 + 1 ] = z; },
		reply( points = this.points, height = 0 ) {

			this.resultInputs.set( points );
			for ( let i = 0; i < this.count; i ++ ) this.cpu[ i * 4 ] = height;
			this.cpuValid = true;
			this.version ++;
			this.resultTime += 1 / 60;

		},
	};
	const model = new BoatModel();
	const input = Object.assign( Object.create( Input.prototype ), {
		keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 }, wheel: 0,
		enabled: true, focused: true, interrupted: false, mouseDown: false, rightDown: false,
	} );
	const boat = new BoatController( { model, query, terrain, colliders } );
	const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
	const player = new Player( { camera, input, boat, query, terrain, colliders } );
	return { boat, query, input, player, model };

}

{
	const { boat } = harness();
	roll( boat, 70 );
	tickCapsize( boat, 40 );
	assert.equal( boat.capsized, false, 'heavy but recoverable heel does not trigger rescue mode' );
	roll( boat, 180 );
	tickCapsize( boat, 19 );
	assert.equal( boat.capsized, false, 'a brief inversion does not trigger' );
	roll( boat, 0 );
	tickCapsize( boat, 1 );
	roll( boat, 180 );
	tickCapsize( boat, 19 );
	assert.equal( boat.capsized, false, 'upright frames interrupt the inversion timer' );
	boat.driven = true;
	boat.throttle = boat.throttleTarget = boat.rpm = boat.thrust = 1;
	tickCapsize( boat, 2 );
	assert.equal( boat.capsized, true, 'continuous inversion enters capsize mode' );
	boat.setInput( 1, 1, 1 );
	assert.deepEqual( [ boat.driven, boat.throttle, boat.throttleTarget, boat.rpm, boat.thrust, boat.steer ], [ false, 0, 0, 0, 0, 0 ], 'capsized engine stops and ignores throttle' );
	roll( boat, 60 );
	tickCapsize( boat, 20 );
	assert.equal( boat.capsized, true, 'partial righting does not flicker the state' );
	roll( boat, 0 );
	tickCapsize( boat, 9 );
	assert.equal( boat.capsized, true, 'righting requires sustained stability' );
	tickCapsize( boat, 2 );
	assert.equal( boat.capsized, false );
	roll( boat, 180 );
	boat.updateCapsize( 60 );
	assert.equal( boat.capsized, false, 'a stalled/background frame cannot skip the full inversion timer' );
}

{
	const { boat, query, model } = harness();
	boat.position.set( 400, - 3, 500 );
	roll( boat, 180 );
	boat.queueQueries();
	const delayedPoints = query.points.slice();
	query.reply( delayedPoints, 2 );
	boat.readQueries();
	boat.driven = boat.capsized = true;
	boat.velocity.set( 7, - 3, 4 );
	boat.angular.set( 2, 1, 3 );
	boat.throttle = boat.rpm = boat.speed = 1;
	boat.reset();
	assert.ok( boat.position.equals( WORLD.boatDock.position ) );
	assert.equal( boat.moored, true );
	assert.equal( boat.driven, false );
	assert.equal( boat.capsized, false );
	assert.equal( boat.velocity.lengthSq() + boat.angular.lengthSq() + boat.rpm + model._rpm + boat.speed, 0 );
	assert.equal( boat.hasWater, false );
	query.reply( delayedPoints, 3 );
	boat.update( 0.1 );
	assert.equal( boat.hasWater, false, 'late water from the overturned location is ignored' );
	assert.ok( boat.position.equals( WORLD.boatDock.position ), 'boat stays at the berth while waiting for fresh water' );
	query.reply();
	boat.update( 1 / 60 );
	assert.equal( boat.hasWater, true, 'fresh berth samples resume buoyancy' );
	for ( let i = 0; i < 180; i ++ ) { boat.queueQueries(); query.reply(); boat.update( 1 / 60 ); }
	assert.ok( boat.isFinite() && boat.position.distanceTo( WORLD.boatDock.position ) < 0.8, 'rescued hull remains afloat and moored with real pier collisions' );
	boat.quaternion.x = NaN;
	boat.update( 1 / 60 );
	assert.ok( boat.isFinite(), 'nonfinite quaternion components recover before physics runs' );
}

{
	const { boat, player, query } = harness();
	boat.position.set( 70, - 3, 36.5 );
	roll( boat, 180 );
	boat.capsized = true;
	for ( const mode of [ 'boat', 'deck' ] ) {

		player.mode = mode;
		player.busy = true;
		player.update( 1 / 60 );
		assert.equal( player.mode, 'swim', `capsize releases the player from ${ mode } even with a fishing line out` );
		assert.ok( player.position.y > - 0.3, 'player emerges at the sea surface instead of the sunken boat origin' );
		assert.equal( player.nearBoat(), false );
		player.boardBoat();
		player.takeHelm();
		assert.equal( player.mode, 'swim', 'neither boarding nor taking the helm works on an overturned hull' );

	}
	player.velocity.set( 2, 3, 4 );
	player.deckVel.set( 1, 2, 3 );
	player.camInit = true;
	player.rescueToHarbor();
	assert.equal( player.mode, 'walk' );
	assert.equal( player.velocity.lengthSq() + player.deckVel.lengthSq(), 0 );
	assert.equal( player.busy, false );
	assert.equal( player.camInit, false );
	assert.equal( colliders.groundHeightAt( player.position.x, player.position.z, 3 ), player.position.y );
	assert.equal( colliders.resolveCapsule( player.position.clone(), 0.3, 1.75, 0.4 ), false, 'rescue landing point is clear in the actual pier collider geometry' );
	const oldPlayerPoints = query.points.slice();
	oldPlayerPoints[ player.slot * 4 ] += 200;
	query.reply( oldPlayerPoints, 6 );
	player.update( 1 / 60 );
	assert.equal( player.mode, 'walk', 'an old offshore wave sample cannot pull the rescued player off the pier' );
	assert.equal( player.waterH, 0 );
	query.reply();
	player.update( 1 / 60 );
	assert.equal( player.mode, 'walk', 'the next player frame stays safely on the pier' );
	assert.ok( player.camera.position.y > WORLD.pier.deckHeight + 1.5 );
}

function gameHarness() {

	const h = harness();
	const saved = new Map();
	const state = new GameState( { setItem: ( key, value ) => saved.set( key, value ), getItem: ( key ) => saved.get( key ) } );
	state.money = 235;
	state.fuel = 7.5;
	state.addFish( 'grunt', 0.7 );
	state.orderIndex = 3;
	state.orderDelivered = 1;
	state.upgrades.line = 1;
	const ui = { panelOpen: false, helpOpen: false, _photo: false, _start: false };
	const hud = {
		invOpen: false, standOpen: false, catchOpen: false, notices: [],
		toggleInventory( open ) { this.invOpen = open; }, closeStand() { this.standOpen = false; }, hideCatch() { this.catchOpen = false; },
		toast( text ) { this.notices.push( text ); }, update( value ) { this.last = value; },
	};
	const game = Object.assign( Object.create( Game.prototype ), {
		state, hud, vendors: [], _pier: WORLD.pier,
		rod: Object.assign( Object.create( FishingRod.prototype ), { state: 'stowed', equipped: false, power: 0, dip: 0, t: 0, update() {} } ),
		fight: null, bite: null, landing: null,
		display: { shown: false, hide() { this.shown = false; } },
		app: {
			player: h.player, boatCtl: h.boat, camera: h.player.camera, input: h.input, ui: { ui }, terrainData: terrain,
			freeCam: false, setFreeCam( enabled ) { this.freeCam = enabled; }, settings: { timeOfDay: 12 },
		},
	} );
	const frame = ( dt = 0.1 ) => {

		h.boat.update( dt );
		h.player.update( dt );
		game.update( dt );
		h.boat.queueQueries();
		h.query.reply();
		h.input.endFrame();

	};
	return { ...h, game, ui, hud, state, saved, frame };

}

{
	const { boat, player, input, game, hud, state, saved, frame } = gameHarness();
	const owned = JSON.stringify( state.toJSON() );
	boat.position.set( 70, - 2, 36.5 );
	roll( boat, 180 );
	tickCapsize( boat, 19 );
	boat.driven = true;
	player.mode = 'deck';
	player.busy = true;
	game.rod.equip( true );
	game.rod.setState( 'fighting' );
	game.fight = { species: 'tuna', kg: 5 };
	game.bite = { phase: 'take' };
	frame();
	assert.equal( player.mode, 'swim', 'full boat → player → game frame ejects the capsize passenger' );
	assert.equal( game.fight, null, 'the full frame cancels the active fight when thrown overboard' );
	assert.equal( game.bite, null );
	assert.equal( game.rod.state, 'stowed' );
	assert.equal( player.busy, false );
	assert.equal( hud.last.rescue.capsized, true, 'the same frame presents the rescue HUD' );
	assert.equal( player.prompt.key, 'X' );
	input.keys.add( 'KeyX' );
	for ( let i = 0; i < 19; i ++ ) frame();
	assert.equal( hud.notices.length, 0, 'a partial hold does not teleport the player' );
	frame();
	assert.equal( hud.notices.length, 1, 'two seconds triggers exactly one completed rescue' );
	assert.equal( player.mode, 'walk' );
	assert.ok( boat.position.equals( WORLD.boatDock.position ) );
	assert.equal( boat.moored, true );
	assert.equal( input.keys.size, 0 );
	assert.equal( JSON.stringify( state.toJSON() ), owned, 'rescue preserves wallet, caught fish, fish log, upgrades, fuel and campaign progress' );
	assert.equal( Array.from( saved.values() ).at( - 1 ), owned, 'the preserved game state is saved' );
	for ( let i = 0; i < 25; i ++ ) frame();
	assert.equal( hud.notices.length, 1, 'no repeat rescue occurs after the triggering key is cleared' );
	assert.equal( player.mode, 'walk' );
}

{
	const { game, input, ui, hud, state } = gameHarness();
	for ( const [ target, key, blockedValue, openValue ] of [
		[ input, 'focused', false, true ], [ input, 'enabled', false, true ], [ input, 'interrupted', true, false ],
		[ ui, 'helpOpen', true, false ], [ ui, 'panelOpen', true, false ], [ ui, '_photo', true, false ], [ ui, '_start', true, false ],
		[ game.app, 'freeCam', true, false ], [ hud, 'invOpen', true, false ], [ hud, 'standOpen', true, false ], [ hud, 'catchOpen', true, false ],
	] ) {

		input.keys.add( 'KeyX' );
		for ( let i = 0; i < 10; i ++ ) game.updateRescue( 0.1 );
		assert.ok( game.rescueHold > 0 );
		target[ key ] = blockedValue;
		game.updateRescue( 30 );
		assert.equal( game.rescueHold, 0, `${ key } interrupts an in-progress hold` );
		target[ key ] = openValue;

	}
	game.updateRescue( 60 );
	assert.ok( game.rescueHold <= 0.1, 'a long frame cannot instantly complete the rescue hold' );
	input.keys.clear();
	game.updateRescue( 0.1 );
	assert.equal( game.rescueHold, 0, 'releasing X resets progress' );
	assert.equal( hud.notices.length, 0 );
	const owned = JSON.stringify( state.toJSON() );
	game.landing = { species: 'grunt', kg: 0.7 };
	game.display.shown = true;
	hud.invOpen = hud.standOpen = hud.catchOpen = true;
	game.app.freeCam = true;
	input.mouseDown = input.rightDown = true;
	game.rescueToHarbor();
	assert.equal( game.landing, null, 'button rescue closes a caught-fish presentation' );
	assert.deepEqual( [ game.display.shown, hud.invOpen, hud.standOpen, hud.catchOpen, game.app.freeCam, input.mouseDown, input.rightDown ], Array( 7 ).fill( false ) );
	assert.equal( JSON.stringify( state.toJSON() ), owned, 'closing a caught-fish card neither removes nor duplicates the already awarded fish' );
}

console.log( 'Boat rescue passed: capsize debounce, engine stop, late GPU water, safe pier landing, full frame fight cancellation, X interruption, single rescue, and preserved save.' );
