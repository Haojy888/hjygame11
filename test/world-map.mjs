import assert from 'node:assert/strict';
import { WorldMap, mapPoint, mapLocations } from '../src/game/WorldMap.js';
import { MAP_BOUNDS } from '../src/game/Minimap.js';
import { GameState } from '../src/game/GameState.js';
import { Input } from '../src/core/Input.js';
import { UI } from '../src/ui/UI.js';
import { Vector3 } from '../src/engine/index.js';

const calls = [];
const ctx = Object.fromEntries( [ 'clearRect', 'drawImage', 'fillRect', 'fillText', 'save', 'translate', 'beginPath', 'arc', 'fill', 'stroke', 'rotate', 'restore', 'moveTo', 'lineTo' ].map( ( key ) => [ key, ( ...args ) => calls.push( [ key, ...args ] ) ] ) );
class Element extends EventTarget {

	constructor() { super(); this.hidden = false; }
	append() {}
	querySelector( key ) { return this.nodes[ key ]; }
	focus() { document.activeElement = this; }
	blur() { document.activeElement = null; }
	getContext() { return ctx; }

}
const previousWindow = globalThis.window, previousDocument = globalThis.document;
const close = new Element(), list = new Element(), canvas = new Element();
let unlocks = 0, panelClosed = 0;
globalThis.window = new EventTarget();
globalThis.document = Object.assign( new EventTarget(), {

	head: new Element(), pointerLockElement: {}, activeElement: null,
	exitPointerLock() { unlocks ++; this.pointerLockElement = null; },
	createElement() { const element = new Element(); element.nodes = { button: close, ul: list, canvas }; return element; },

} );
try {

	const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, sensitivity: 1, keys: new Set( [ 'KeyW' ] ), pressed: new Set( [ 'KeyW' ] ), look: { x: 400, y: 100 }, mouseDown: true, rightDown: true, wheel: 3 } );
	const ui = { root: new Element(), helpOpen: false, _photo: false, _start: false, togglePanel( value ) { assert.equal( value, false ); panelClosed ++; } };
	const state = new GameState( null );
	const game = { state, app: { input, player: { mode: 'walk', yaw: 0, position: new Vector3( 55, 2.3, 40 ) }, boatCtl: { position: new Vector3( 64.5, 0, 36.5 ), getYaw: () => 0 } },
		hud: { invOpen: true, standOpen: true, catchOpen: false, toggleInventory() { this.invOpen = false; }, closeStand() { this.standOpen = false; } }, guide: { open: false } };
	game.minimap = { _bake: { done: true }, canvas: {}, _goalPos: { x: 55, z: 43 } };
	const map = game.worldMap = new WorldMap( ui, game, game.minimap );
	const key = ( code, options = {} ) => {

		const event = { code, repeat: false, target: {}, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...options };
		map.onKey( event ); return event;

	};
	assert.equal( map.open, false );
	for ( const options of [ { target: { tagName: 'INPUT' } }, { ctrlKey: true }, { repeat: true } ] ) assert.equal( key( 'KeyM', options ).stopped, false );
	assert.equal( map.open, false );
	const opened = key( 'KeyM' );
	assert.ok( opened.prevented && opened.stopped );
	assert.equal( map.open, true );
	assert.equal( input.enabled, false );
	assert.ok( ! input.down( 'KeyW' ) && ! input.mouseDown && ! input.rightDown && ! input.wheel );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 } );
	assert.equal( unlocks, 1 );
	// A pending raw/fallback lock can finish after M; keep the map cursor and focus usable.
	document.pointerLockElement = {};
	document.activeElement = null;
	document.dispatchEvent( new Event( 'pointerlockchange' ) );
	assert.equal( unlocks, 2 );
	assert.equal( document.pointerLockElement, null );
	assert.equal( document.activeElement, close );
	document.dispatchEvent( new Event( 'pointerlockchange' ) );
	assert.equal( unlocks, 2, 'An unlock notification must not start a lock/unlock loop' );
	assert.equal( panelClosed, 1 );
	assert.equal( game.hud.invOpen || game.hud.standOpen, false );
	assert.equal( document.activeElement, close );
	assert.equal( Object.getOwnPropertyDescriptor( UI.prototype, 'isPointerOverUI' ).get.call( ui ), true );
	assert.ok( calls.some( ( entry ) => entry[ 0 ] === 'drawImage' && entry[ 1 ] === game.minimap.canvas ), 'Reuse the real terrain bake' );
	assert.match( list.innerHTML, /你的位置/ );
	assert.match( list.innerHTML, /你的船/ );
	assert.match( list.innerHTML, /港口码头/ );
	assert.doesNotMatch( list.innerHTML, /珊瑚礁钓场|远海深水钓场/ );
	for ( const code of [ 'KeyR', 'KeyF', 'KeyH', 'KeyV' ] ) assert.equal( key( code ).stopped, true );
	assert.equal( key( 'Tab' ).prevented, true );
	assert.equal( key( 'KeyM', { repeat: true } ).stopped, true );
	assert.equal( map.open, true, 'Holding M cannot flicker the map' );
	assert.equal( key( 'Escape' ).stopped, true );
	assert.equal( map.open, false );
	assert.equal( input.enabled, true );
	assert.equal( input.interrupted, true, 'Closing requires a fresh mouse press before fishing' );
	assert.equal( document.activeElement, null );
	assert.equal( key( 'KeyM' ).stopped, true );
	close.onclick();
	assert.equal( map.open, false, 'The close button works independently of keyboard input' );
	for ( const [ object, field ] of [ [ ui, '_start' ], [ ui, 'helpOpen' ], [ ui, '_photo' ], [ game.guide, 'open' ], [ game.hud, 'catchOpen' ] ] ) {

		object[ field ] = true;
		assert.equal( map.toggle( true ), false, 'Do not steal an existing modal' );
		object[ field ] = false;

	}
	input.enabled = false;
	assert.equal( map.toggle( true ), false );
	assert.equal( input.enabled, false, 'Do not enable somebody else\'s disabled input' );
	input.enabled = true;
	input.focused = false;
	assert.equal( map.toggle( true ), false );
	input.focused = true;
	assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'reef' ), false );
	state.orderIndex = 2;
	assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'reef' ), true );
	assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'deep' ), false );
	state.orderIndex = 4;
	assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'deep' ), true );
	game.storyTarget = new Vector3( 24, 0.6, - 50 );
	assert.equal( mapLocations( game ).find( ( entry ) => entry.id === 'story' ).x, 24 );
	game.app.boatCtl.position.set( 3000, 0, 3000 );
	map.toggle( true );
	assert.match( list.innerHTML, /图外/ );
	assert.equal( mapLocations( game ).find( ( entry ) => entry.id === 'player' ).x, 55, 'Follow the player, not the free camera' );
	assert.ok( mapPoint( { x: 0, z: - 100 } ).y < mapPoint( { x: 0, z: 100 } ).y );
	assert.equal( mapPoint( { x: MAP_BOUNDS.x + MAP_BOUNDS.extent / 2, z: MAP_BOUNDS.z + MAP_BOUNDS.extent / 2 } ).x, 320 );
	assert.equal( mapPoint( { x: 55, z: 450 } ).edge, false, 'Known deep-water ground is within the chart' );
	assert.deepEqual( mapPoint( { x: 3000, z: 3000 } ), { x: 628, y: 628, edge: true } );
	game.minimap._bake.done = false;
	assert.doesNotThrow( () => map.update( 1 ), 'Map can open before terrain baking finishes' );
	map.toggle( false );

} finally {

	globalThis.window = previousWindow;
	globalThis.document = previousDocument;

}
console.log( 'PASS: map shortcut/modal isolation, terrain reuse, known fishing grounds, live positions, chart bounds and loading.' );
