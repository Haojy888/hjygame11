import assert from 'node:assert/strict';
import { WorldMap, mapPoint, mapLocations, mapSelection, navigationInfo, locationGroup } from '../src/game/WorldMap.js';
import { MAP_BOUNDS } from '../src/game/Minimap.js';
import { GameState } from '../src/game/GameState.js';
import { Input } from '../src/core/Input.js';
import { UI } from '../src/ui/UI.js';
import { Vector3 } from '../src/engine/index.js';

const calls = [];
const ctx = Object.fromEntries( [ 'clearRect', 'drawImage', 'fillRect', 'fillText', 'save', 'translate', 'beginPath', 'arc', 'fill', 'stroke', 'rotate', 'restore', 'moveTo', 'lineTo', 'setLineDash' ].map( ( key ) => [ key, ( ...args ) => calls.push( [ key, ...args ] ) ] ) );
class Element extends EventTarget {

	constructor() { super(); this.hidden = false; this.nodes = {}; this.dataset = {}; this.value = ''; }
	append() {}
	querySelector( key ) { return this.nodes[ key ] ||= new Element(); }
	querySelectorAll() { return [ this.nodes.button, this.nodes.select, this.nodes[ '.gm-map-clear' ], this.nodes.input ].filter( ( node ) => node && ! node.disabled ); }
	setAttribute( key, value ) { this[ key ] = value; }
	contains( node ) { return !! node && ( node === this || Object.values( this.nodes ).some( ( child ) => child.contains( node ) ) ); }
	getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
	focus() { document.activeElement = this; }
	blur() { document.activeElement = null; }
	getContext() { return ctx; }

}
const previousWindow = globalThis.window, previousDocument = globalThis.document;
const close = new Element(), list = new Element(), canvas = new Element(), filter = new Element();
filter.value = 'all';
let unlocks = 0, panelClosed = 0;
globalThis.window = new EventTarget();
globalThis.document = Object.assign( new EventTarget(), {

	head: new Element(), pointerLockElement: {}, activeElement: null,
	exitPointerLock() { unlocks ++; this.pointerLockElement = null; },
	createElement() { const element = new Element(); element.nodes = { button: close, ul: list, canvas, select: filter }; return element; },

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
	assert.equal( document.activeElement, filter, 'Tab reaches the location filter' );
	assert.equal( key( 'ArrowDown', { target: { tagName: 'SELECT' } } ).stopped, true, 'Native select keys cannot leak into gameplay' );
	assert.equal( key( 'Tab', { shiftKey: true } ).prevented, true );
	assert.equal( document.activeElement, close );
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
	game.seaJournalTarget = new Vector3( - 20, - 19, 406 );
	const journalLocation = mapLocations( game ).find( ( entry ) => entry.id === 'seaJournal' );
	assert.equal( journalLocation.icon, '◎' );
	assert.equal( journalLocation.z, 406, 'the journal can guide to the actual northern gateway separately from the fixed ruin marker' );
	assert.match( journalLocation.label, /水下约 19 米/ );
	game.seaJournalTarget.z = 443;
	assert.equal( mapLocations( game ).find( ( entry ) => entry.id === 'seaJournal' ).z, 443, 'live observation target follows the patrol' );
	assert.equal( mapLocations( game ).find( ( entry ) => entry.id === 'story' ).x, 24, 'independent stories retain their own routes' );
	game.seaJournalTarget = null;
	assert.equal( mapLocations( game ).some( ( entry ) => entry.id === 'seaJournal' ), false, 'completed memories leave no stale target' );
	game.app.boatCtl.position.set( 3000, 0, 3000 );
	map.toggle( true );
	assert.match( list.querySelector( '[data-map-distance="boat"]' ).textContent, /图外/ );
	assert.equal( mapLocations( game ).find( ( entry ) => entry.id === 'player' ).x, 55, 'Follow the player, not the free camera' );
	assert.ok( mapPoint( { x: 0, z: - 100 } ).y < mapPoint( { x: 0, z: 100 } ).y );
	assert.equal( mapPoint( { x: MAP_BOUNDS.x + MAP_BOUNDS.extent / 2, z: MAP_BOUNDS.z + MAP_BOUNDS.extent / 2 } ).x, 320 );
	assert.equal( mapPoint( { x: 55, z: 450 } ).edge, false, 'Known deep-water ground is within the chart' );
	assert.deepEqual( mapPoint( { x: 3000, z: 3000 } ), { x: 628, y: 628, edge: true } );
	assert.equal( map.selectDestination( 'missing' ), false );
	assert.equal( map.selectDestination( 'player' ), false );
	assert.equal( map.selectDestination( 'boat' ), true );
	assert.equal( map.navigation.destination.x, 3000 );
	assert.ok( calls.some( ( call ) => call[ 0 ] === 'setLineDash' ), 'A selected destination draws a bearing line' );
	assert.equal( list.querySelector( '[data-map-id="boat"]' )[ 'aria-pressed' ], 'true' );
	const beforeRefresh = list.innerHTML;
	game.app.boatCtl.position.x = 2500;
	map.update( 1 );
	assert.equal( list.innerHTML, beforeRefresh, 'Moving positions update metrics without rebuilding controls' );
	assert.equal( map.navigation.destination.x, 2500 );
	filter.value = 'tasks'; filter.onchange();
	assert.doesNotMatch( list.innerHTML, /data-map-id="boat"/ );
	assert.equal( map.selectedId, 'boat', 'Filtering does not cancel navigation' );
	filter.value = 'all'; filter.onchange();
	map.toggle( false );
	game.app.boatCtl.position.x = 2000;
	map.update( 1 );
	assert.equal( map.navigation.destination.x, 2000, 'Closed-map navigation follows a drifting boat' );
	game.seaJournalTarget = new Vector3( - 20, - 19, 406 );
	map.selectDestination( 'seaJournal' );
	game.seaJournalTarget = null;
	map.update( 1 );
	assert.equal( map.selectedId, null, 'Completed/disappearing objectives cannot leave a stale waypoint' );
	assert.equal( map.navigation, null );
	state.orderIndex = 0;
	assert.equal( map.selectDestination( 'deep' ), false, 'Navigation respects fishing-ground unlocks' );
	map.toggle( true );
	const coast = mapPoint( mapLocations( game ).find( ( entry ) => entry.id === 'coast' ) );
	canvas.onclick( { clientX: coast.x, clientY: coast.y } );
	assert.equal( map.selectedId, 'coast', 'Canvas markers select the same destinations as the list' );
	map.clearButton.onclick();
	assert.equal( map.navigation, null );
	map.search.tagName = 'INPUT'; map.search.value = '不存在的地点'; map.search.oninput();
	assert.match( list.innerHTML, /没有匹配地点/ );
	assert.match( map.countLabel.textContent, /^0 \/ / );
	const typedM = key( 'KeyM', { target: map.search } );
	assert.equal( map.open, true, 'M remains text while editing a search' );
	assert.equal( typedM.prevented, false ); assert.equal( typedM.stopped, true );
	key( 'KeyM', { target: map.search, isComposing: true } );
	assert.equal( map.open, true, 'IME input cannot trigger a map shortcut' );
	key( 'Escape', { target: map.search } );
	assert.equal( map.search.value, '' ); assert.equal( map.open, true, 'The first Escape clears a search' );
	assert.match( list.innerHTML, /你的船/ );
	map.search.value = '<img src=x onerror=alert(1)>'; map.search.oninput();
	assert.doesNotMatch( list.innerHTML, /<img/ );
	map.search.value = ''; map.search.oninput();
	game.minimap._bake.done = false;
	assert.doesNotThrow( () => map.update( 1 ), 'Map can open before terrain baking finishes' );
	map.toggle( false );
	state.orderIndex = 1; state.orderDelivered = 1;
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'task' ).hint, /条纹鲻鱼 ≥ 0.4 公斤 · 还需钓 1 条/ );
	state.addFish( 'mullet', 0.5 );
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'task' ).hint, /渔获已齐/ );
	state.story = { stage: 3, route: 'chart', ending: null };
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'story' ).hint, /17:00–20:00/ );
	state.story.route = 'shore';
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'story' ).hint, /06:00–18:00/ );
	state.orderIndex = 4; state.seaJournal.stage = 2; game.seaJournalTarget = new Vector3( 0, - 20, 450 );
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'seaJournal' ).hint, /停留 6 秒/ );
	state.expedition.stage = 2; game.expeditionTarget = new Vector3( - 48, - 15, 205 );
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'expedition' ).hint, /货舱.*G 阅读/ );
	state.voyage.station = 5; game.app.terrainData = { heightAt: () => - 16 };
	assert.equal( navigationInfo( mapLocations( game ).find( ( p ) => p.id === 'salvage-bell' ), game.app.player.position ).depth, 15 );
	state.voyage.hooked = 'bell'; state.boatId = 'offshore'; game.voyageTarget = new Vector3( - 35, - 15, 300 );
	for ( const id of [ 'salvage-bell', 'voyage' ] ) {

		const target = mapLocations( game ).find( ( p ) => p.id === id );
		assert.equal( navigationInfo( target, game.app.player.position ).depth, null, 'Both navigation paths guide hooked salvage from the surface' );
		assert.match( target.hint, /12 米内.*长按 G 起吊/ );

	}
	game.app.weather = { thunderstorm: true };
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'salvage-bell' ).hint, /等雷暴过去/ );
	state.boatId = 'coastal';
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'salvage-bell' ).hint, /换远海大船/ );
	state.voyage.event = { type: 'supply', accepted: true, site: 0, serial: 1, remaining: 125 };
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'radio-event' ).hint, /剩余 2:05.*5 升/ );
	state.fieldPhotos.starfish = { image: 'already recorded' };
	assert.match( mapLocations( game ).find( ( p ) => p.id === 'survey-starfish' ).label, /已收录/ );

} finally {

	globalThis.window = previousWindow;
	globalThis.document = previousDocument;

}

const origin = { x: 0, y: 0, z: 0 };
for ( const [ x, z, expected ] of [ [ 0, - 10, '北 0°' ], [ 10, 0, '东 90°' ], [ 0, 10, '南 180°' ], [ - 10, 0, '西 270°' ], [ 10, - 10, '东北 45°' ] ] ) assert.ok( navigationInfo( { x, z }, origin ).metrics.includes( expected ) );
assert.equal( navigationInfo( { x: NaN, z: 0 }, origin ), null );
assert.equal( navigationInfo( { x: 0, z: 0 }, null ), null );
const dive = { x: 0, y: - 20, z: 0 };
assert.equal( navigationInfo( dive, origin ).arrived, false, 'Being over a dive site is not underwater arrival' );
assert.match( navigationInfo( dive, origin ).hint, /C 下潜/ );
assert.match( navigationInfo( dive, { ...origin, y: - 25 } ).hint, /Space 上浮/ );
assert.equal( navigationInfo( dive, { ...origin, y: - 19 } ).arrived, true );
assert.equal( navigationInfo( { ...dive, underwater: false }, origin ).depth, null, 'A surface boat in a wave trough is not a dive target' );
assert.equal( navigationInfo( { x: 8.01, z: 0 }, origin ).arrived, false );
assert.equal( locationGroup( { id: 'restore-report' } ), 'tasks' );
assert.equal( locationGroup( { id: 'survey-starfish' } ), 'explore' );
assert.equal( locationGroup( { id: 'boat' } ), 'harbor' );
const overlapping = [ { id: 'joe', x: 0, z: 0 }, { id: 'story', x: 0, z: 0 }, { id: 'player', x: 0, z: 0 } ], hit = mapPoint( overlapping[ 0 ] );
assert.equal( mapSelection( overlapping, hit.x, hit.y, null ), 'joe' );
assert.equal( mapSelection( overlapping, hit.x, hit.y, 'joe' ), 'story' );
assert.equal( mapSelection( overlapping, hit.x, hit.y, 'story' ), 'joe' );
assert.equal( mapSelection( overlapping.slice( 0, 1 ), hit.x, hit.y, 'joe' ), null );
assert.equal( mapSelection( overlapping, - 100, - 100, 'joe' ), undefined );
console.log( 'PASS: map/modal isolation, real terrain, unlock gates, selected routes, compass/depth guidance, moving and completed targets, filtering, focus and loading.' );
