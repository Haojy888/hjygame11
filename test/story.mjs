// CPU regression of the optional harbor story: saves, choices, rewards and real world interactions.
import assert from 'node:assert/strict';
import { Group, Vector3 } from '../src/engine/index.js';
import { Input } from '../src/core/Input.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { Vendor } from '../src/game/Vendor.js';
import { STORY_TITLE, storyObjective, storyDialogue, storyJournal } from '../src/game/Story.js';
import { StoryWorld, STORY_SPOTS } from '../src/game/StoryWorld.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Colliders } from '../src/world/Colliders.js';
import { buildPier } from '../src/world/Pier.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Rand } from '../src/world/Props.js';

const fresh = { stage: 0, route: null, ending: null };
const events = [ 'accept', 'bottle', 'chart', 'shore', 'survey', 'names', 'home', 'light', 'unknown' ];
const clone = ( value ) => JSON.parse( JSON.stringify( value ) );
function stateHarness() {

	const saved = new Map();
	const storage = { getItem: ( key ) => saved.get( key ) ?? null, setItem: ( key, value ) => saved.set( key, value ) };
	const state = new GameState( storage );
	state.orderIndex = 2;
	state.upgrades.line = 1;
	state.money = 235;
	state.fuel = 7.5;
	state.addFish( 'grunt', 0.7, 11 );
	return { state, storage };

}

function reject( state, event, payload ) {

	const before = clone( state.toJSON() );
	assert.equal( state.storyEvent( event, payload ), false, `stage ${ state.story.stage } rejects ${ event }` );
	assert.deepEqual( state.toJSON(), before, 'rejected story input cannot mutate money, progress or property' );

}

assert.equal( STORY_TITLE, '最后一盏归航灯' );
for ( const version of [ 1, 2 ] ) {

	const { state } = stateHarness();
	const old = clone( state.toJSON() );
	old.v = version;
	delete old.story;
	assert.equal( state.fromJSON( old ), true );
	assert.deepEqual( state.story, fresh, `v${ version } saves without a story begin at the optional introduction` );
	assert.equal( state.money, old.money );
	assert.deepEqual( state.inventory, old.inventory );
	assert.equal( state.fuel, old.fuel );
	assert.ok( state.orderIndex >= old.orderIndex, 'migration retains earned main campaign access' );
	assert.equal( state.upgrades.line, 1 );

}

{
	const { state } = stateHarness();
	state.orderIndex = 0;
	assert.deepEqual( storyDialogue( state, 'buyer' ).choices, [] );
	reject( state, 'accept' );
	state.orderIndex = 1;
	assert.deepEqual( storyDialogue( state, 'buyer' ).choices.map( ( choice ) => choice.id ), [ 'accept' ] );
	assert.equal( state.storyEvent( 'accept' ), true );
	assert.equal( state.storyEvent( 'bottle' ), true );
	assert.deepEqual( storyDialogue( state, 'shop' ).choices, [] );
	reject( state, 'chart' );
	reject( state, 'shore' );
	state.orderIndex = 2;
	assert.deepEqual( storyDialogue( state, 'shop' ).choices.map( ( choice ) => choice.id ), [ 'chart', 'shore' ] );
}

// Both routes and both endings remain completable across a save at every step.
for ( const route of [ 'chart', 'shore' ] ) for ( const ending of [ 'names', 'home' ] ) {

	const { state, storage } = stateHarness();
	const initial = clone( state.toJSON() );
	const path = [ 'accept', 'bottle', route, 'survey', ending, 'light' ];
	const locations = [ 'joe', 'bottle', 'marta', route === 'chart' ? 'reef' : 'shore', 'joe', 'beacon', null ];
	let current = state, changes = 0;
	for ( let stage = 0; stage < path.length; stage ++ ) {

		assert.equal( storyObjective( current ).location, locations[ stage ] );
		assert.equal( storyJournal( current ).length, stage, 'journal reveals only completed steps' );
		const allowed = stage === 2 ? [ 'chart', 'shore' ] : stage === 4 ? [ 'names', 'home' ] : [ path[ stage ] ];
		for ( const event of events.filter( ( event ) => ! allowed.includes( event ) ) ) reject( current, event, { hour: 19 } );
		if ( stage === 3 || stage === 5 ) {

			const wrongHours = stage === 5 ? [ 6, 12, 17.999 ] : route === 'chart' ? [ 0, 16.999, 20, 23 ] : [ 0, 5.999, 18, 23 ];
			for ( const hour of [ ...wrongHours, - 1, 24, NaN, Infinity, '19', null, undefined ] ) reject( current, path[ stage ], { hour } );

		}
		current.onChange( () => changes ++ );
		assert.equal( current.storyEvent( path[ stage ], { hour: stage === 5 ? 18 : route === 'chart' ? 17 : 6 } ), true );
		assert.equal( current.story.stage, stage + 1 );
		assert.equal( changes, stage + 1, 'each accepted event emits once' );
		assert.equal( current.money, initial.money + ( stage === 5 ? 150 : 0 ) );
		const roundTrip = new GameState( storage );
		assert.equal( roundTrip.load(), true );
		assert.deepEqual( roundTrip.story, current.story );
		assert.equal( roundTrip.orderIndex, initial.orderIndex );
		assert.deepEqual( roundTrip.inventory, initial.inventory );
		assert.deepEqual( roundTrip.log, initial.log );
		assert.deepEqual( roundTrip.upgrades, initial.upgrades );
		assert.equal( roundTrip.fuel, initial.fuel );
		current = roundTrip;

	}
	assert.equal( storyObjective( current ).location, null );
	assert.equal( storyJournal( current ).length, 6 );
	assert.equal( current.story.route, route );
	assert.equal( current.story.ending, ending );
	assert.deepEqual( storyDialogue( current, 'buyer' ).choices, [] );
	assert.deepEqual( storyDialogue( current, 'shop' ).choices, [] );
	for ( const event of events ) reject( current, event, { hour: 19 } );
	assert.equal( current.money, initial.money + 150, 'completed save never replays the reward' );
	const completed = clone( current.toJSON() );
	delete completed.story.route;
	delete completed.story.ending;
	assert.equal( current.fromJSON( completed ), true );
	assert.equal( current.story.stage, 6, 'a completed save with missing choices does not fall back into a rewardable stage' );
	reject( current, 'light', { hour: 19 } );
	current.reset();
	const reset = new GameState( storage );
	assert.equal( reset.load(), true );
	assert.deepEqual( reset.story, fresh );
	assert.equal( reset.orderIndex, 0 );
	assert.equal( reset.money, 0 );
	assert.deepEqual( reset.inventory, [] );

}

// The upper edge of each time window is excluded, including the midnight crossing.
for ( const [ route, hours ] of [ [ 'chart', [ 17, 19.999 ] ], [ 'shore', [ 6, 17.999 ] ] ] ) for ( const hour of hours ) {

	const state = new GameState( null );
	state.story = { stage: 3, route, ending: null };
	assert.equal( state.storyEvent( 'survey', { hour } ), true );

}
for ( const hour of [ 18, 23.999, 0, 5.999 ] ) {

	const state = new GameState( null );
	state.story = { stage: 5, route: 'chart', ending: 'home' };
	assert.equal( state.storyEvent( 'light', { hour } ), true );
	assert.equal( state.money, 150 );

}

const terrain = new TerrainData();
const lights = [];
const colliders = new Colliders();
buildPier( { B: new Builder(), terrain, colliders, rand: new Rand( () => 0.5 ), lights: [], inst: { add() {} } } );
const world = new StoryWorld( { scene: new Group(), terrainData: terrain, colliders, settings: { timeOfDay: 12 }, localLights: { add: ( light ) => lights.push( light ) } } );
assert.equal( lights.length, 1, 'the story reuses the existing local lighting system' );
for ( const place of [ 'bottle', 'shore' ] ) assert.ok( world[ place ].position.y > 0, `${ place } is reachable on dry terrain` );
assert.ok( terrain.heightAt( STORY_SPOTS.reef.x, STORY_SPOTS.reef.z ) < - 5, 'survey destination is in navigable water outside the shallow reef' );
assert.equal( world.beacon.position.y, WORLD.pier.deckHeight );
assert.equal( colliders.groundHeightAt( world.beacon.position.x, world.beacon.position.z, 3 ), WORLD.pier.deckHeight, 'lamp base rests on the real pier deck' );
const lampApproach = new Vector3( 55, WORLD.pier.deckHeight, 36.5 );
assert.ok( lampApproach.distanceTo( world.beacon.position ) < 3 );
assert.equal( colliders.resolveCapsule( lampApproach.clone(), 0.3, 1.75, 0.4 ), false, 'a player can reach the lamp without standing in a pier prop or the new lamp post' );
for ( const stage of [ 0, 1, 2, 5, 6, 0 ] ) {

	const restored = new GameState( null );
	restored.fromJSON( { v: 2, story: { stage, route: 'shore', ending: 'names' } } );
	world.update( restored.story, 22, 0 );
	assert.equal( world.bottle.visible, stage === 1, 'loading and resetting immediately restores pickup visibility' );
	assert.equal( world.light.enabled, stage === 6 );
	assert.equal( world.light.scale > 0, stage === 6, 'only a completed story lights the night harbor' );

}
world.update( { stage: 6, ending: 'names' }, 12, 0 );
assert.equal( world.light.scale, 0, 'completed beacon turns off during daytime' );
world.update( { stage: 6, ending: 'names' }, 22, 0.5 );
assert.equal( world.light.scale, 1 );
world.update( { stage: 6, ending: 'home' }, 22, 0.5 );
assert.ok( world.light.scale > 0 && world.light.scale < 1, 'the homecoming ending has a distinct, persistent lamp behavior' );

function gameHarness() {

	const { state } = stateHarness();
	const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set() } );
	const player = { mode: 'walk', position: new Vector3(), busy: false, prompt: null };
	const vendor = ( kind, x ) => Object.assign( Object.create( Vendor.prototype ), { kind, position: new Vector3( x, 1, - 70 ), radius: 3 } );
	const joe = vendor( 'buyer', 50 ), marta = vendor( 'shop', 85 );
	const hud = { standOpen: false, invOpen: false, catchOpen: false, vendor: joe };
	const ui = { helpOpen: false, panelOpen: false, _photo: false, _start: false };
	const game = Object.assign( Object.create( Game.prototype ), {
		state, hud, storyWorld: world, stand: { vendor: joe }, chandlery: { vendor: marta },
		rod: { equipped: false }, fight: null, guide: { open: false }, messages: [],
		toast( text ) { this.messages.push( text ); },
		app: { input, player, settings: { timeOfDay: 12 }, freeCam: false, ui: { ui }, boatCtl: { position: new Vector3(), speed: 0, capsized: false } },
	} );
	const arrive = ( stage, route = 'shore', hour = 12 ) => {

		state.story = { stage, route: stage >= 3 ? route : null, ending: stage >= 5 ? 'names' : null };
		game.app.settings.timeOfDay = hour;
		const point = game.storyTarget;
		player.position.set( point.x, point.y ?? 0, point.z );
		game.app.boatCtl.position.copy( player.position );
		player.mode = stage === 3 && route === 'chart' ? 'boat' : 'walk';
		player.prompt = null;
		input.pressed.clear();

	};
	const pressG = () => { input.pressed.add( 'KeyG' ); game.updateStory( 1 / 60 ); input.endFrame(); };
	return { game, state, input, player, hud, ui, joe, marta, arrive, pressG };

}

{
	const { game, state, hud, player, input, ui, joe, marta } = gameHarness();
	player.position.copy( joe.position );
	assert.equal( game.talkStory( 'accept' ), false, 'closed dialogue buttons cannot act remotely' );
	hud.standOpen = true;
	for ( const [ target, key, value ] of [
		[ game.app, 'freeCam', true ], [ ui, 'helpOpen', true ], [ ui, '_photo', true ],
		[ game.guide, 'open', true ], [ input, 'focused', false ], [ game, 'fight', {} ], [ player, 'mode', 'swim' ],
	] ) {

		const old = target[ key ];
		target[ key ] = value;
		assert.equal( game.talkStory( 'accept' ), false, `${ key } prevents dialogue progression` );
		assert.equal( state.story.stage, 0 );
		target[ key ] = old;

	}
	player.position.x += 20;
	assert.equal( game.talkStory( 'accept' ), false, 'a stale vendor panel cannot advance from far away' );
	player.position.copy( joe.position ).y += 3;
	assert.equal( game.talkStory( 'accept' ), false, 'a different elevation is outside vendor range' );
	hud.vendor = marta;
	player.position.copy( marta.position );
	assert.equal( game.talkStory( 'accept' ), false, 'Marta cannot accept Joe\'s introduction' );
	hud.vendor = joe;
	player.position.copy( joe.position );
	assert.equal( game.talkStory( 'accept' ), true );
	assert.equal( game.talkStory( 'accept' ), false, 'double-clicking does not advance twice' );
	assert.equal( game.talkStory( 'bottle' ), false, 'NPC dialogue cannot bypass world pickups' );
	state.storyEvent( 'bottle' );
	assert.equal( game.talkStory( 'shore' ), false, 'Joe cannot choose Marta\'s route' );
	hud.vendor = marta;
	player.position.copy( marta.position );
	assert.equal( game.talkStory( 'shore' ), true );
	assert.equal( game.talkStory( 'survey' ), false, 'NPC dialogue cannot bypass surveying' );
	state.storyEvent( 'survey', { hour: 12 } );
	assert.equal( game.talkStory( 'home' ), false, 'Marta cannot resolve Joe\'s final dialogue' );
	hud.vendor = joe;
	player.position.copy( joe.position );
	assert.equal( game.talkStory( 'home' ), true );
	assert.equal( game.talkStory( 'light' ), false, 'NPC dialogue cannot claim the final lamp reward' );
	assert.equal( state.money, 235 );
}

// A key near an objective only works in the correct mode, time window and unobstructed UI state.
for ( const [ stage, route, hour, wrongHour ] of [ [ 1, 'shore', 12, null ], [ 3, 'shore', 12, 20 ], [ 3, 'chart', 18, 12 ], [ 5, 'shore', 22, 12 ] ] ) {

	const { game, state, player, input, hud, ui, arrive, pressG } = gameHarness();
	arrive( stage, route, hour );
	game.updateStory( 1 / 60 );
	assert.equal( state.story.stage, stage, 'proximity alone never auto-completes an objective' );
	assert.equal( player.prompt.key, 'G' );
	const startingPosition = player.position.clone();
	player.position.x += 30;
	game.app.boatCtl.position.x += 30;
	pressG();
	assert.equal( state.story.stage, stage, 'G outside interaction range does nothing' );
	player.position.copy( startingPosition );
	game.app.boatCtl.position.copy( startingPosition );
	for ( const [ target, key, value ] of [
		[ game.app, 'freeCam', true ], [ ui, 'helpOpen', true ], [ ui, 'panelOpen', true ], [ ui, '_photo', true ], [ ui, '_start', true ],
		[ game.guide, 'open', true ], [ hud, 'invOpen', true ], [ hud, 'standOpen', true ], [ hud, 'catchOpen', true ],
		[ input, 'enabled', false ], [ input, 'focused', false ], [ input, 'interrupted', true ], [ game, '_cardDismissed', true ],
		[ player, 'busy', true ], [ game.rod, 'equipped', true ], [ game, 'fight', {} ], [ player, 'mode', 'swim' ],
	] ) {

		const old = target[ key ];
		target[ key ] = value;
		pressG();
		assert.equal( state.story.stage, stage, `${ key } blocks world interaction at stage ${ stage }` );
		target[ key ] = old;

	}
	if ( route === 'chart' ) {

		for ( const [ key, value ] of [ [ 'speed', 1.2 ], [ 'capsized', true ] ] ) {

			const boat = game.app.boatCtl, old = boat[ key ];
			boat[ key ] = value;
			pressG();
			assert.equal( state.story.stage, stage, `${ key } prevents unsafe surveying` );
			boat[ key ] = old;

		}
		player.mode = 'walk';
		pressG();
		assert.equal( state.story.stage, stage, 'standing ashore cannot complete the boat route' );
		player.mode = 'deck'; // Both the deck and helm are valid when the boat is stopped.

	} else {

		player.position.y += 3;
		pressG();
		assert.equal( state.story.stage, stage, 'G cannot reach a prop from the wrong elevation' );
		player.position.copy( startingPosition );
		player.mode = 'deck';
		pressG();
		assert.equal( state.story.stage, stage, 'land clues require leaving the boat' );
		player.mode = 'walk';

	}
	if ( wrongHour !== null ) {

		game.app.settings.timeOfDay = wrongHour;
		pressG();
		assert.equal( state.story.stage, stage, 'G obeys the actual game clock' );
		game.app.settings.timeOfDay = hour;

	}
	pressG();
	assert.equal( state.story.stage, stage + 1 );
	assert.equal( game.messages.length, 1 );
	pressG();
	assert.equal( state.story.stage, stage + 1, 'repeated G cannot skip the next NPC step or repeat a reward' );
	assert.equal( state.money, stage === 5 ? 385 : 235 );
	assert.equal( world.bottle.visible, false, 'pickup disappears in the same frame' );
	if ( stage === 5 ) assert.ok( world.light.enabled && world.light.scale > 0, 'the final action lights the lamp in the same frame' );

}

console.log( 'Story passed: legacy saves, both routes and endings, clock boundaries, single reward, retained property, NPC range and role, G focus/menu/movement gates, real terrain and pier approach, restored props and beacon.' );
