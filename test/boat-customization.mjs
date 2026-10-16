import assert from 'node:assert/strict';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { BoatWorkshop } from '../src/game/BoatWorkshop.js';
import { defaultBoatCustomization, normalizeBoatCustomization } from '../src/game/BoatCustomization.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { Color, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { fuelBurn } from '../src/game/Gear.js';

const store = () => { const data = new Map(); return { getItem: k => data.get( k ), setItem: ( k, v ) => data.set( k, v ) }; };
const near = ( a, b ) => assert.ok( Math.abs( a - b ) < 1e-8, `${ a } vs ${ b }` );
const storage = store(), state = new GameState( storage );
state.fromJSON( { v: 2, money: 1800, upgrades: { stability: 900, propeller: - 8, engine: 'oops' } } );
assert.equal( state.upgrades.stability, 2 );
assert.equal( state.upgrades.propeller, 0 );
assert.equal( state.upgrades.engine, 0 );
assert.deepEqual( state.boatCustomization, defaultBoatCustomization() );
assert.deepEqual( normalizeBoatCustomization( { hull: 'red', stripe: '#aBcDeF', finish: '__proto__', rodRack: 'yes', extra: 3 } ),
	{ ...defaultBoatCustomization(), stripe: '#abcdef' } );
const red = { ...state.boatCustomization, hull: '#d14333', cabin: '#2f90bc', rodRack: true, finish: 'matte' };
assert.equal( state.customizeBoat( red ), true );
state.boatId = 'offshore';
assert.deepEqual( state.boatCustomization, defaultBoatCustomization( 'offshore' ) );
state.customizeBoat( { ...state.boatCustomization, stripe: '#2ab6aa', fenders: true } );
const restored = GameState.load( storage );
assert.equal( restored.boatId, 'offshore' );
assert.equal( restored.boatCustomization.fenders, true );
restored.boatId = 'coastal';
assert.equal( restored.boatCustomization.hull, red.hull );
assert.equal( restored.boatCustomization.rodRack, true );
const before = JSON.stringify( restored.toJSON() );
restored.storage = { setItem() { throw new Error( 'full' ); } };
assert.equal( restored.customizeBoat( { hull: '#000000' } ), false );
assert.equal( JSON.stringify( restored.toJSON() ), before, 'Failed persistence rolls back the entire exterior change' );
restored.reset();
assert.deepEqual( restored.boatCustomization, defaultBoatCustomization() );

// Only a tiny DOM surface is needed to exercise the real panel bindings and draft lifecycle.
class Panel {

	constructor() { const classes = new Set(); this.classList = { add: k => classes.add( k ), remove: k => classes.delete( k ), contains: k => classes.has( k ) }; }
	set innerHTML( html ) {

		this.html = html;
		this.nodes = [ ...html.matchAll( /<(button|input|select|code|div)\b([^>]*)>/g ) ].map( match => {

			const attrs = Object.fromEntries( [ ...match[ 2 ].matchAll( /([\w-]+)(?:="([^"]*)")?/g ) ].map( attr => [ attr[ 1 ], attr[ 2 ] ?? '' ] ) );
			return { attrs, dataset: Object.fromEntries( Object.entries( attrs ).filter( ( [ k ] ) => k.startsWith( 'data-' ) ).map( ( [ k, v ] ) => [ k.slice( 5 ).replace( /-([a-z])/g, ( _, c ) => c.toUpperCase() ), v ] ) ),
				value: attrs.value, disabled: Object.hasOwn( attrs, 'disabled' ), focus() {}, addEventListener( name, fn ) { this[ 'on' + name ] = fn; },
				setPointerCapture() {}, getBoundingClientRect() { const width = globalThis.innerWidth || 1280, full = Math.min( 1180, width - 56 ); return { left: ( width - full ) / 2, width: full - 386, height: 640 }; } };

		} );

	}
	querySelectorAll( selector ) {

		if ( selector.startsWith( '.' ) ) return this.nodes.filter( n => n.attrs.class?.split( ' ' ).includes( selector.slice( 1 ) ) );
		const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec( selector );
		return m ? this.nodes.filter( n => Object.hasOwn( n.attrs, m[ 1 ] ) && ( m[ 2 ] === undefined || n.attrs[ m[ 1 ] ] === m[ 2 ] ) ) : [];

	}
	querySelector( selector ) { return this.querySelectorAll( selector )[ 0 ] || null; }

}

for ( const Boat of [ BoatModel, OffshoreBoatModel ] ) {

	const state = new GameState( store() ), model = new Boat(), panel = new Panel();
	state.boatId = model.profileId;
	state.money = 2000;
	state.fuel = 20;
	const vendor = { kind: 'shop', inRange: p => p.length() < 3 };
	const b = { maxThrust: 100, pitchSpeed: 5, rollDampingScale: 2, driven: true, rpm: 0.8 };
	const game = Object.assign( Object.create( Game.prototype ), {
		state, _engineBase: { maxThrust: 100, pitchSpeed: 5 }, _rollDampingBase: 2, floods: [], rod: { setGear() {} },
		chandlery: { vendor }, messages: [], toast( text ) { this.messages.push( text ); },
		app: { boat: model, boatCtl: b, camera: new PerspectiveCamera( 62, 16 / 9, 0.1, 60000 ),
			input: { enabled: true, focused: true, clear() {} }, player: { mode: 'walk', position: new Vector3() },
			post: { taau: { _needsRestart: false } }, ui: { ui: {} } },
	} );
	const hud = game.hud = Object.assign( Object.create( GameHUD.prototype ), { game, stand: panel, standOpen: true, vendor } );
	const workshop = hud.workshop = new BoatWorkshop( hud );
	state.onChange( () => game.applyGear() );
	game.applyGear();
	const materialVersion = model.materials.hull.version;
	const accessoryGeometry = model.outfitting.parts.rodRack.geometry;
	const hydro = JSON.stringify( model.hydro ), mask = model.createHullVolumeGeometry().attributes.position.array.slice();
	assert.equal( workshop.show(), true );
	const hullInput = panel.querySelector( '[data-paint="hull"]' );
	hullInput.value = '#e96c21'; hullInput.oninput();
	assert.equal( state.boatCustomization.hull, '#f2efe6', 'Preview does not mutate the saved customization' );
	assert.deepEqual( model.materials.hull.uniforms.paintHull.value.toArray(), new Color( '#e96c21' ).toArray() );
	assert.equal( model.materials.hull.version, materialVersion, 'Changing paint updates uniforms without recompiling the material' );
	assert.equal( model.outfitting.parts.rodRack.geometry, accessoryGeometry, 'Preview reuses built attachment geometry' );
	game.buy( 'stability' ); game.buy( 'propeller' );
	for ( let i = 0; i < 20; i ++ ) game.applyGear();
	near( b.rollDampingScale, 2 * 1.18 );
	assert.equal( model.outfitting.parts.stability.visible, true );
	assert.equal( model.outfitting.parts.propeller.visible, true );
	assert.deepEqual( model.materials.hull.uniforms.paintHull.value.toArray(), new Color( '#e96c21' ).toArray(), 'Gear application keeps an unsaved paint preview' );
	game.updateBoat( 1 );
	near( state.fuelL, 20 - fuelBurn( 0.8 ) * 0.88 );
	assert.equal( state.money, 1620 );
	assert.equal( game.saveBoatCustomization( workshop.draft ), true );
	workshop.draft.hull = '#12aacc'; workshop.preview();
	hud.closeStand();
	assert.equal( workshop.isOpen, false );
	assert.deepEqual( model.materials.hull.uniforms.paintHull.value.toArray(), new Color( '#e96c21' ).toArray(), 'Closing via the real HUD discards the later draft' );
	assert.equal( GameState.load( state.storage ).boatCustomization.hull, '#e96c21' );
	hud.standOpen = true;
	workshop.show();
	panel.querySelector( '[data-workshop-tab="parts"]' ).onclick();
	panel.querySelector( '[data-part="rodRack"]' ).onclick();
	assert.equal( model.outfitting.parts.rodRack.visible, true );
	assert.equal( game.saveBoatCustomization( workshop.draft ), true );
	assert.equal( state.boatCustomization.rodRack, true );
	game.app.player.position.x = 30;
	assert.equal( game.saveBoatCustomization( { hull: '#000000' } ), false, 'A stale panel cannot commit away from Marta' );
	game.app.player.position.x = 0;
	for ( const width of [ 1280, 1366, 1920 ] ) {

		const previous = globalThis.innerWidth;
		globalThis.innerWidth = width;
		game.app.camera.aspect = width / 720;
		game.app.camera.updateProjectionMatrix();
		workshop.updateCamera();
		assert.ok( game.app.camera.position.y > 2 );
		const screen = new Vector3( 0, 0.8, 0 ).project( game.app.camera );
		assert.ok( screen.x > - 0.8 && screen.x < 0, `Boat is framed left of the controls at desktop width ${ width }` );
		if ( previous === undefined ) delete globalThis.innerWidth; else globalThis.innerWidth = previous;

	}
	game.app.ui.ui.helpOpen = true;
	workshop.updateCamera();
	assert.equal( workshop.isOpen, false, 'Opening another screen exits the customizer cleanly' );
	assert.equal( JSON.stringify( model.hydro ), hydro, 'Outfitting preserves hull mass and buoyancy' );
	assert.deepEqual( model.createHullVolumeGeometry().attributes.position.array, mask, 'Water exclusion geometry is unchanged' );
	assert.equal( state.buy( 'toString' ), null );
	state.money = 0;
	assert.equal( state.buy( 'propeller' ), null );
	model.dispose();

}
console.log( 'Boat customization passed: per-hull saves, old saves, rollback, paint preview/cancel, live gear, exact prices, fuel economy, roll damping, desktop framing and unchanged hull geometry.' );
