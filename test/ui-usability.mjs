// Real HUD/UI methods with only the DOM surface they use; no browser or GPU required.
import assert from 'node:assert/strict';
import { UI } from '../src/ui/UI.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { GameState } from '../src/game/GameState.js';

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

	set innerHTML( html ) {

		this.html = html;
		this.nodes = { '.gm-list': { scrollTop: 0 }, '[data-close]': {}, '[data-all]': {} };
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

console.log( 'UI usability checks passed: help pointer lock, panel state, and accurate fuel purchases.' );
