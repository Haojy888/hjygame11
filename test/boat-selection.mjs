// Real persistence, shop action and HUD rendering; no browser or GPU required.
import assert from 'node:assert/strict';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { Vendor } from '../src/game/Vendor.js';
import { BOATS } from '../src/game/Boats.js';
import { Group, Vector3 } from '../src/engine/index.js';

function harness() {

	const saved = new Map();
	const storage = { getItem: ( key ) => saved.get( key ) ?? null, setItem: ( key, value ) => saved.set( key, value ) };
	const state = GameState.load( storage );
	state.addFish( 'grunt', 0.9 );
	state.money = 723;
	state.upgrades.line = 1;
	state.upgrades.engine = 2;
	state.orderIndex = 2;
	state.story = { stage: 3, route: 'chart', ending: null };
	state.fuel = 21.75;
	state.save();
	state.burn( 0.75 ); // Fuel used since the last ordinary save must survive changing boats.
	const vendor = Object.assign( Object.create( Vendor.prototype ), { kind: 'shop', position: new Vector3( 85, 1, - 60 ), radius: 3 } );
	const input = { enabled: true, focused: true, clears: 0, clear() { this.clears ++; } };
	const ui = { helpOpen: false, panelOpen: false, _photo: false, _start: false };
	const game = Object.assign( Object.create( Game.prototype ), {
		state, chandlery: { vendor }, hud: { standOpen: true, invOpen: false, catchOpen: false, vendor },
		guide: { open: false }, worldMap: { open: false }, fight: null, landing: null,
		app: { input, player: { mode: 'walk', position: vendor.position.clone() }, freeCam: false, ui: { ui } },
		messages: [], cancellations: 0, cancelLine() { this.cancellations ++; }, endLanding() {},
		toast( message ) { this.messages.push( message ); },
	} );
	return { state, game, input, ui, storage, saved };

}

for ( const boatId of [ undefined, null, '', 'old-boat', 'toString', '__proto__', 1, {}, { toString: null } ] ) {

	const state = new GameState( null );
	assert.equal( state.fromJSON( { v: 2, boatId } ), true );
	assert.equal( state.boatId, 'coastal', 'missing or invalid boat IDs load the original boat' );

}
{

	const state = new GameState( null );
	state.fromJSON( { v: 1, orderIndex: 1 } );
	assert.equal( state.boatId, 'coastal', 'v1 migration retains the original boat' );
	assert.equal( state.orderIndex, 2, 'the existing campaign migration still runs' );
	state.boatId = 'offshore';
	state.reset();
	assert.equal( state.boatId, 'coastal', 'reset restores the default boat' );
	assert.equal( state.save(), false, 'missing storage is an explicit failed save' );
	assert.equal( new GameState( { setItem() { throw new Error( 'blocked' ); } } ).save(), false );

}

const previousWindow = globalThis.window;
let reloads = 0;
globalThis.window = { location: { reload() { reloads ++; } } };
try {

	{

		const { game, state, storage, input } = harness();
		const expected = JSON.parse( JSON.stringify( state.toJSON() ) );
		assert.equal( game.selectBoat( 'offshore' ), true );
		assert.equal( reloads, 1 );
		assert.equal( input.clears, 1 );
		assert.equal( game.cancellations, 1 );
		expected.boatId = 'offshore';
		const restored = GameState.load( storage );
		assert.deepEqual( restored.toJSON(), expected, 'all current fuel, money, catch, upgrades and story survive the reload' );
		assert.equal( restored.fuelL, 21, 'changing boats never fills the fuel tank' );
		assert.equal( game.selectBoat( 'coastal' ), false, 'a second click cannot change the selection during reload' );
		assert.equal( reloads, 1 );
		const back = harness();
		back.game.state = restored;
		assert.equal( back.game.selectBoat( 'coastal' ), true );
		expected.boatId = 'coastal';
		assert.deepEqual( GameState.load( storage ).toJSON(), expected, 'switching back preserves the same shared progress' );

	}
	{

		const { game, state, input } = harness();
		const expected = JSON.stringify( state.toJSON() ), before = reloads;
		for ( const storage of [ null, { setItem() { throw new Error( 'full' ); } } ] ) {

			state.storage = storage;
			assert.equal( game.selectBoat( 'offshore' ), false );
			assert.equal( JSON.stringify( state.toJSON() ), expected, 'save failure rolls back the selection and preserves the active game' );
			assert.match( game.messages.at( - 1 ), /无法保存/ );

		}
		assert.equal( reloads, before );
		assert.equal( input.clears, 0 );
		assert.equal( game.cancellations, 0, 'a failed save does not interrupt the ongoing game' );

	}
	{

		const { game, state, storage } = harness();
		const expected = JSON.parse( JSON.stringify( state.toJSON() ) );
		window.location.reload = () => { throw new Error( 'navigation blocked' ); };
		assert.equal( game.selectBoat( 'offshore' ), false );
		assert.equal( game._changingBoat, false );
		assert.deepEqual( state.toJSON(), expected );
		assert.deepEqual( GameState.load( storage ).toJSON(), expected, 'failed navigation also restores the saved boat selection' );
		window.location.reload = () => { reloads ++; };

	}
	{

		const { game, state, input, ui } = harness();
		const before = reloads;
		for ( const id of [ 'coastal', '', '__proto__', 'unknown', null, {} ] ) assert.equal( game.selectBoat( id ), false );
		for ( const [ object, key, value ] of [
			[ game.hud, 'standOpen', false ], [ game.hud, 'vendor', { kind: 'shop', inRange: () => true } ],
			[ game.hud, 'invOpen', true ], [ game.hud, 'catchOpen', true ],
			[ game.app, 'freeCam', true ], [ game.app.player, 'mode', 'boat' ],
			[ ui, 'helpOpen', true ], [ ui, 'panelOpen', true ], [ ui, '_photo', true ], [ ui, '_start', true ],
			[ game.guide, 'open', true ], [ game.worldMap, 'open', true ],
			[ input, 'enabled', false ], [ input, 'focused', false ], [ game, 'fight', {} ], [ game, 'landing', {} ],
		] ) {

			const previous = object[ key ];
			object[ key ] = value;
			assert.equal( game.selectBoat( 'offshore' ), false, `${ key } blocks a stale boat selection button` );
			object[ key ] = previous;

		}
		game.app.player.position.x += 20;
		assert.equal( game.selectBoat( 'offshore' ), false, 'boat selection requires being beside Marta' );
		assert.equal( state.boatId, 'coastal' );
		assert.equal( reloads, before );

	}

} finally {

	if ( previousWindow === undefined ) delete globalThis.window;
	else globalThis.window = previousWindow;

}

{

	const { game, state } = harness();
	const controls = { '[data-close]': {}, '[data-boats]': { focus() {} }, '[data-shop]': { focus() {} } }, buttons = [];
	const classes = new Set();
	const stand = {
		classList: { toggle( name, active ) { if ( active ) classes.add( name ); else classes.delete( name ); } },
		set innerHTML( value ) {

			this.html = value;
			buttons.length = 0;
			for ( const match of value.matchAll( /<button[^>]*data-boat="([^"]+)"([^>]*)>([^<]*)<\/button>/g ) ) {

				buttons.push( { dataset: { boat: match[ 1 ] }, disabled: match[ 2 ].includes( 'disabled' ), textContent: match[ 3 ] } );

			}

		},
		querySelector: ( selector ) => controls[ selector ] || null,
		querySelectorAll: ( selector ) => selector === '[data-boat]' ? buttons : [],
	};
	const hud = Object.assign( Object.create( GameHUD.prototype ), { game, vendor: { name: '玛尔塔', greeting: '欢迎' }, stand } );
	let selected = null;
	game.selectBoat = ( id ) => { selected = id; };
	hud.renderShop();
	assert.match( stand.html, /查看船只/ );
	assert.equal( buttons.length, 0, 'the normal shop opens a dedicated boat selection view' );
	controls[ '[data-boats]' ].onclick();
	assert.equal( hud.boatView, true );
	assert.equal( classes.has( 'gm-boats' ), true );
	assert.equal( buttons.length, 2 );
	assert.equal( buttons.find( ( b ) => b.dataset.boat === 'coastal' ).disabled, true );
	const large = buttons.find( ( b ) => b.dataset.boat === 'offshore' );
	assert.equal( large.disabled, false );
	assert.equal( large.textContent, '免费换船 · 重新载入' );
	large.onclick();
	assert.equal( selected, 'offshore', 'the rendered shop button invokes the guarded game action' );
	assert.match( stand.html, /换船后返回港口并重新载入/ );
	assert.match( stand.html, /剩余燃油/ );
	for ( const boat of Object.values( BOATS ) ) {

		assert.ok( stand.html.includes( boat.name ) );
		assert.ok( stand.html.includes( `/images/boats/${ boat.id }.png` ), 'both boat cards display their model previews' );

	}
	state.boatId = 'offshore';
	hud.renderShop();
	assert.equal( buttons.find( ( b ) => b.dataset.boat === 'offshore' ).disabled, true );
	controls[ '[data-shop]' ].onclick();
	assert.equal( hud.boatView, false );
	assert.equal( classes.has( 'gm-boats' ), false );
	assert.match( stand.html, /柴油/ );

}
{

	const group = new Group();
	group.position.set( 20, 0, 50 );
	const game = Object.assign( Object.create( Game.prototype ), { floods: [] } );
	game.addFloodlights( { add() {} }, { group, visualScale: new Vector3( 1.35, 1, 1.6 ) } );
	assert.equal( game.floods.length, 2 );
	assert.ok( game.floods[ 0 ].position.distanceTo( new Vector3( 18.92, 2.25, 48.4 ) ) < 1e-9,
		'the large boat floodlights follow its actual scaled cabin positions' );
	group.position.x += 12;
	game.floods[ 0 ].update();
	assert.ok( game.floods[ 0 ].position.distanceTo( new Vector3( 30.92, 2.25, 48.4 ) ) < 1e-9 );

}

console.log( 'Boat selection checks passed: save migration, guarded free switching, rollback, HUD and scaled lights.' );
