// Real HUD/UI methods with only the DOM surface they use; no browser or GPU required.
import assert from 'node:assert/strict';
import { UI, sailingReadout } from '../src/ui/UI.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { GameState } from '../src/game/GameState.js';
import { navigationInfo } from '../src/game/WorldMap.js';

const classList = { add() {}, remove() {}, toggle() {} };
const previousDocument = globalThis.document;
let releases = 0;
let focused = false;
globalThis.document = { pointerLockElement: {}, exitPointerLock() { releases ++; } };
try {

	const help = { hidden: true, classList, querySelector: () => ( { focus() { focused = true; } } ) };
	const ui = { _help: false, helpEl: help, _closeMenu() {}, _hideTip() {}, _activity() {} };
	assert.equal( UI.prototype.toggleHelp.call( ui, true ), true );
	assert.equal( releases, 1, 'F1 help releases the game pointer lock' );
	assert.equal( focused, true, 'help receives focus while pointer-lock release is still pending' );
	assert.equal( help.hidden, false );
	UI.prototype.toggleHelp.call( ui, true );
	assert.equal( releases, 1, 'opening existing help does not release again' );

} finally {

	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;

}

class Panel {
	classList = classList;

	set innerHTML( html ) {

		this.html = html;
		this.nodes = { '.gm-list': { scrollTop: 0 }, '[data-close]': { focus: () => this.onCloseFocus?.() }, '[data-all]': {} };
		if ( html.includes( '<details' ) ) this.nodes[ 'details.gm-journey' ] = { open: false };
		const fuel = html.match( /<button[^>]*data-fuel([^>]*)>([^<]*)<\/button>/ );
		if ( fuel ) this.nodes[ '[data-fuel]' ] = { disabled: fuel[ 1 ].includes( 'disabled' ), textContent: fuel[ 2 ] };

	}

	querySelector( selector ) { return this.nodes?.[ selector ] || null; }
	querySelectorAll() { return []; }

}

function makeHUD( state ) {

	const hud = Object.assign( Object.create( GameHUD.prototype ), {
		game: { state, refuel: () => state.refuel() }, _last: {},
		moneyEl: {}, coolerLabel: {}, coolerKg: {}, coolerBar: { style: {} }, coolerEl: { classList }, purse: { classList }, orderCard: {},
		inv: new Panel(), stand: new Panel(), invOpen: false, standOpen: false,
		workshop: { hide() {} },
		vendor: { kind: 'shop', name: '玛尔塔', greeting: '欢迎' },
	} );
	state.onChange( () => hud.refresh() );
	return hud;

}

const state = new GameState( null );
state.money = 2000;
const fish = [ state.addFish( 'grunt', 0.9 ), state.addFish( 'mullet', 0.8 ) ];
const hud = makeHUD( state );
hud.invOpen = true;
hud.refresh();
let inputClears = 0; hud.game.app = { player: { mode: 'walk' }, input: { clear() { inputClears ++; } } };
let panelVisible = false, closeFocuses = 0;
hud.inv.classList = { toggle( name, on ) { panelVisible = on; } };
hud.inv.onCloseFocus = () => { assert.equal( panelVisible, true, 'inventory becomes visible before keyboard focus is placed inside it' ); closeFocuses ++; };
globalThis.document = { pointerLockElement: null };
try {

	hud.toggleInventory( true ); assert.equal( inputClears, 1, 'opening the inventory releases held movement, mouse buttons and queued look input' );
	assert.equal( closeFocuses, 1 );

} finally {

	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;

}
const oldList = hud.inv.querySelector( '.gm-list' );
oldList.scrollTop = 240;
hud.inv.querySelector( 'details.gm-journey' ).open = true;
state.release( fish[ 0 ].id );
assert.notEqual( hud.inv.querySelector( '.gm-list' ), oldList, 'the real inventory renderer replaced its DOM' );
assert.equal( hud.inv.querySelector( '.gm-list' ).scrollTop, 240, 'release keeps the inventory scroll position' );
assert.equal( hud.inv.querySelector( 'details.gm-journey' ).open, true, 'release keeps the voyage expanded' );

hud.invOpen = false;
hud.standOpen = true;
hud.vendor.kind = 'buyer';
hud.renderStand();
hud.stand.querySelector( '.gm-list' ).scrollTop = 130;
state.sell( [ fish[ 1 ].id ] );
assert.equal( hud.stand.querySelector( '.gm-list' ).scrollTop, 130, 'sale keeps the stand scroll position' );
hud.vendor.kind = 'shop';
hud.renderShop();
hud.stand.querySelector( '.gm-list' ).scrollTop = 90;
state.buy( 'rod' );
assert.equal( hud.stand.querySelector( '.gm-list' ).scrollTop, 90, 'purchase keeps the shop scroll position' );

for ( const [ money, fuel, label, litres, cost ] of [
	[ 10, 0, '加油 6 升 · $9', 6, 9 ],
	[ 100, 0, '加满 40 升 · $60', 40, 60 ],
	[ 2, 39.6, '加满 0.4 升 · $1', 0.4, 1 ],
	[ 2, 39.996, '加满 不足 0.01 升 · $1', 0.004, 1 ],
] ) {

	const s = new GameState( null );
	s.money = money;
	s.fuel = fuel;
	const shop = makeHUD( s );
	shop.standOpen = true;
	shop.renderShop();
	const button = shop.stand.querySelector( '[data-fuel]' );
	assert.equal( button.textContent, label );
	assert.equal( button.disabled, false );
	button.onclick();
	assert.ok( Math.abs( s.fuelL - fuel - litres ) < 1e-6, 'displayed litres match the actual purchase' );
	assert.equal( money - s.money, cost, 'displayed price matches the actual charge' );
	const after = shop.stand.querySelector( '[data-fuel]' );
	assert.equal( after.disabled, true, 'full tank or insufficient balance disables refuelling' );
	assert.equal( after.textContent, s.fuelL === s.stats.fuelL ? '已加满' : '余额不足' );

}

// Real chart destinations feed the helm compass; wind is reported as coming FROM a direction.
const sailing = { visible: true, heading: 0, windSpeed: 7, windVector: { x: 1, y: 0 } };
for ( const [ x, y, from, name ] of [ [ 1, 0, 270, '西' ], [ - 1, 0, 90, '东' ], [ 0, 1, 0, '北' ], [ 0, - 1, 180, '南' ] ] ) {

	const reading = sailingReadout( { ...sailing, windVector: { x, y } } );
	assert.equal( reading.windAngle, from ); assert.match( reading.windText, new RegExp( name + '来风' ) );

}
const nav = navigationInfo( { x: 100, z: 0, label: '珊瑚礁' }, { x: 0, z: 0 } );
assert.equal( sailingReadout( { ...sailing, navigation: nav } ).course, '右转约 90°' );
assert.equal( sailingReadout( { ...sailing, heading: 180, navigation: nav } ).course, '左转约 90°' );
assert.match( sailingReadout( { ...sailing, heading: 270, navigation: nav } ).course, /船后/ );
assert.match( sailingReadout( { ...sailing, heading: 359, navigation: { ...nav, bearing: 1 } } ).course, /船首/ );
assert.equal( sailingReadout( { ...sailing, heading: 10, navigation: { ...nav, bearing: 350 } } ).course, '左转约 20°' );
const dive = navigationInfo( { x: 0, y: - 18, z: 0, label: '沉船' }, { x: 1, y: 1, z: 0 } );
assert.match( sailingReadout( { ...sailing, navigation: dive } ).course, /潜点上方.*E 离舵下水/ );
assert.match( sailingReadout( { ...sailing, navigation: { ...nav, nearby: true } } ).course, /收油减速/ );
assert.match( sailingReadout( { ...sailing, thunderstorm: true } ).windText, /^雷暴/ );
assert.match( sailingReadout( { ...sailing, rain: true } ).windText, /^下雨/ );
assert.equal( sailingReadout( { ...sailing, windSpeed: 0.1 } ).windAngle, null );
assert.equal( sailingReadout( { ...sailing, windVector: { x: NaN, y: 0 } } ).windAngle, null );
assert.equal( sailingReadout( { ...sailing, navigation: { ...nav, bearing: NaN } } ).targetAngle, null );

// Exercise the production builder and updater. Unchanged frames must not keep writing the DOM.
let writes = 0;
class Instrument {

	nodes = {}; style = {}; attributes = {}; classes = new Set();
	classList = { toggle: ( key, on ) => { writes ++; if ( on ) this.classes.add( key ); else this.classes.delete( key ); } };
	set textContent( value ) { this.text = value; writes ++; }
	get textContent() { return this.text; }
	setAttribute( key, value ) { this.attributes[ key ] = value; writes ++; }
	querySelector( key ) { return this.nodes[ key ] ||= new Instrument(); }

}
globalThis.document = { createElement: () => new Instrument() };
try {

	const instruments = Object.create( UI.prototype );
	instruments.boatEl = instruments._buildBoat();
	const reading = { ...sailing, navigation: nav };
	instruments.setBoatGauges( reading );
	assert.equal( instruments.bTarget.attributes.transform, 'rotate(90.0 50 50)' );
	assert.equal( instruments.bWind.attributes.transform, 'rotate(270.0 50 50)' );
	assert.equal( instruments.bCourse.textContent, '右转约 90°' );
	assert.equal( instruments.bDestination.textContent, '◇ 珊瑚礁 · 100 米' );
	const before = writes; instruments.setBoatGauges( reading );
	assert.equal( writes, before, 'Stable readings cause no repeated DOM writes' );
	instruments.setBoatGauges( { ...reading, heading: 90 } );
	assert.equal( instruments.bTarget.attributes.transform, 'rotate(0.0 50 50)' );
	assert.equal( instruments.bWind.attributes.transform, 'rotate(180.0 50 50)' );
	assert.match( instruments.bCourse.textContent, /船首/ );
	instruments.setBoatGauges( { ...sailing, windSpeed: 0, navigation: null, thunderstorm: true } );
	assert.equal( instruments.bTarget.attributes.visibility, 'hidden' );
	assert.equal( instruments.bWind.attributes.visibility, 'hidden' );
	assert.equal( instruments.bSea.classes.has( 'is-storm' ), true );
	assert.match( instruments.bCourse.textContent, /按 M/ );
	instruments.setBoatGauges( { visible: false } );
	assert.equal( instruments.boatEl.classes.has( 'is-on' ), false );

} finally {

	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;

}

console.log( 'UI usability checks passed: panel focus/state, fuel purchases, sailing bearings/wind, dive arrival, compass rendering and cached DOM updates.' );
