// CPU-only camera regression: real player camera math and AppUI control bindings.
import assert from 'node:assert/strict';
import { PerspectiveCamera, Quaternion, Vector3 } from '../src/engine/index.js';
import { Player } from '../src/player/Player.js';
import { AppUI } from '../src/ui/AppUI.js';

const pressed = new Set();
const input = {
	hit: ( key ) => pressed.has( key ), down: () => false,
	consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0,
};
const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
const boat = {
	position: new Vector3( 50, 0, 30 ), quaternion: new Quaternion(), speed: 0,
	model: { helmEye: new Vector3( 0.4, 1.85, 0.3 ) },
	getYaw: () => 0, setInput() {},
	toWorld( local, out ) { return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position ); },
	forward( out ) { return out.set( 0, 0, 1 ); },
};
const player = new Player( {
	camera, input, boat, terrain: { heightAt: () => 0 },
	colliders: { groundHeightAt: () => 0 }, query: { allocate: () => 0 },
} );
player.takeHelm();
const frame = () => { player.updateBoat( 1 / 60 ); pressed.clear(); };
const helm = () => boat.toWorld( boat.model.helmEye, new Vector3() );
const expectFirst = () => assert.ok( camera.position.distanceTo( helm() ) < 1e-8, 'first person is at the helm eye' );
const expectThird = () => assert.ok( camera.position.distanceTo( helm() ) > 6, 'third person is outside the boat' );

for ( const mode of [ 'first', 'third', 'first' ] ) {
	player.camInit = true;
	player.setCameraMode( mode );
	assert.equal( player.camMode, mode );
	assert.equal( player.camInit, false, 'each camera selection resets the chase position' );
	frame();
	if ( mode === 'first' ) expectFirst();
	else expectThird();
}

const cameraRequests = [];
const setMode = player.setCameraMode.bind( player );
player.setCameraMode = ( mode ) => { cameraRequests.push( mode ); return setMode( mode ); };
for ( const mode of [ 'third', 'first', 'third', 'first' ] ) {
	pressed.add( 'KeyV' );
	frame();
	assert.equal( cameraRequests.at( - 1 ), mode, 'V routes through the shared setter' );
	assert.equal( player.camMode, mode );
	if ( mode === 'first' ) expectFirst();
	else expectThird();
}

// Capture the real AppUI configuration; unrelated UI controls need no DOM.
const controls = [];
const folder = {
	addFolder() { return this; },
	addPresets() {},
};
for ( const method of [ 'addSelect', 'addSlider', 'addToggle', 'addButton', 'addInfo', 'addTimeOfDay' ] ) {
	folder[ method ] = ( options ) => {
		const control = {
			...options, enabled: true,
			get value() { return this.object?.[ this.key ]; },
			setEnabled( enabled ) { this.enabled = enabled; return this; },
			setVisible() { return this; },
			choose( value ) {
				if ( ! this.enabled || this.value === value ) return;
				// Control.setValue writes the object before onChange; retain that ordering.
				this.object[ this.key ] = value;
				this.onChange?.( value, this );
			},
		};
		controls.push( control );
		return control;
	};
}
const ui = { addTab: () => folder, setStats() {}, setMode() {}, setPrompt() {}, setBoatGauges() {}, setDepth() {}, toast() {} };
const uniform = () => ( { value: 1 } );
const app = {
	player, camera, boatCtl: boat, freeCam: false,
	settings: { timeOfDay: 12, timeSpeed: 0, renderScale: 1 },
	fft: { local: { windSpeed: 7, windDirection: 0, fetch: 100 }, choppiness: uniform(), swell: { scale: 1 } },
	shore: Object.fromEntries( [ 'amplitude', 'period', 'gamma', 'curl' ].map( ( key ) => [ key, uniform() ] ) ),
	post: { aaMode: 'none', scale: 1, params: Object.fromEntries( [ 'aoStrength', 'bloom', 'vignette', 'saturation', 'contrast', 'grain', 'sharpen' ].map( ( key ) => [ key, uniform() ] ) ) },
	setFreeCam( enabled ) { this.freeCam = enabled; },
};
player.mode = 'walk';
const appUI = new AppUI( app, ui );
const drivingView = controls.find( ( control ) => control.key === 'camMode' );
assert.ok( drivingView );
assert.equal( drivingView.object, player, 'the setting binds the player rather than a duplicate UI value' );
assert.equal( drivingView.enabled, false, 'the driving selector is disabled on foot' );
const originalMode = player.camMode;
drivingView.choose( 'third' );
assert.equal( player.camMode, originalMode, 'a disabled land control cannot change the driving preference' );

player.mode = 'boat';
appUI.update( 1 / 60 );
assert.equal( drivingView.enabled, true );
pressed.add( 'KeyV' );
frame();
assert.equal( drivingView.value, 'third', 'the control reads a V-key change immediately' );
pressed.add( 'KeyV' );
frame();
assert.equal( drivingView.value, 'first' );
player.camInit = true;
drivingView.choose( 'third' );
assert.equal( cameraRequests.at( - 1 ), 'third', 'the UI callback uses the same setter as V' );
assert.equal( player.camInit, false, 'the UI callback resets camera state even though the bound value was already written' );
frame();
expectThird();
drivingView.choose( 'first' );
frame();
expectFirst();

for ( const mode of [ 'deck', 'walk', 'swim' ] ) {
	player.mode = mode;
	appUI.update( 1 / 60 );
	assert.equal( drivingView.enabled, false, `${ mode } does not offer an inapplicable driving camera` );
}
player.mode = 'boat';
app.freeCam = true;
appUI.update( 1 / 60 );
assert.equal( drivingView.enabled, false, 'free camera disables the driving selector' );
app.freeCam = false;
appUI.update( 1 / 60 );
assert.equal( drivingView.enabled, true, 'returning to the helm re-enables the selector' );

console.log( 'Player camera passed: first/third positions, repeated V switches, live UI binding, shared setter and mode-specific availability.' );
