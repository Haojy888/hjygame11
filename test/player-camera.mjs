// CPU-only camera regression: real player camera math and AppUI control bindings.
import assert from 'node:assert/strict';
import { PerspectiveCamera, Quaternion, Vector3 } from '../src/engine/index.js';
import { Player } from '../src/player/Player.js';
import { FlyCamera } from '../src/player/FlyCamera.js';
import { Input } from '../src/core/Input.js';
import { AppUI } from '../src/ui/AppUI.js';

const pressed = new Set();
const input = Object.assign( Object.create( Input.prototype ), {
	enabled: true, focused: true, sensitivity: 1, look: { x: 0, y: 0 }, wheel: 0,
	pressed, keys: new Set(),
} );
const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
const boat = {
	position: new Vector3( 50, 0, 30 ), quaternion: new Quaternion(), speed: 0,
	model: {
		helmEye: new Vector3( 0.4, 1.85, 0.3 ), boardPoint: new Vector3(), colliders: [], exitPoints: [],
		lines: { deckY: 1, zAft: - 3, shell: 0.1, halfBreadth: () => 2, tAtSheerZ: ( z ) => z },
	},
	getYaw: () => 0, setInput() {},
	toWorld( local, out ) { return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position ); },
	forward( out ) { return out.set( 0, 0, 1 ); },
};
let groundHeight = 0;
const player = new Player( {
	camera, input, boat, terrain: { heightAt: () => groundHeight },
	colliders: { groundHeightAt: () => groundHeight, resolveCapsule() {} }, query: { allocate: () => 0, setPoint() {} },
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

// V and mouse motion in the same frame must use the newly selected camera's rate.
player.setCameraMode( 'first' );
player.orbitYaw = 0;
input.look.x = 400;
pressed.add( 'KeyV' );
frame();
assert.ok( Math.abs( player.orbitYaw ) <= Math.PI / 15 + 1e-9, 'switching to chase does not amplify the input turn budget' );
player.setCameraMode( 'first' );

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
			_default: options.object?.[ options.key ],
			get value() { return this.object?.[ this.key ]; },
			setEnabled( enabled ) { this.enabled = enabled; return this; },
			setVisible() { return this; },
			reset() { this.choose( this._default ); },
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
	player, camera, input, boatCtl: boat, freeCam: false,
	settings: { timeOfDay: 12, timeSpeed: 0, renderScale: 1 },
	fft: { local: { windSpeed: 7, windDirection: 0, fetch: 100 }, choppiness: uniform(), swell: { scale: 1 } },
	shore: Object.fromEntries( [ 'amplitude', 'period', 'gamma', 'curl' ].map( ( key ) => [ key, uniform() ] ) ),
	post: { aaMode: 'none', scale: 1, params: Object.fromEntries( [ 'aoStrength', 'bloom', 'vignette', 'saturation', 'contrast', 'grain', 'sharpen' ].map( ( key ) => [ key, uniform() ] ) ) },
	setFreeCam( enabled ) { this.freeCam = enabled; },
};
player.mode = 'walk';
input.setSensitivity( 0.65 );
const appUI = new AppUI( app, ui );
const sensitivityControl = controls.find( ( control ) => control.key === 'sensitivity' );
assert.ok( sensitivityControl, 'camera settings expose sensitivity' );
assert.equal( sensitivityControl.min, 0.1 );
assert.equal( sensitivityControl.max, 3 );
assert.equal( sensitivityControl.step, 0.05 );
assert.equal( sensitivityControl.value, 0.65, 'settings start from the saved Input preference' );
sensitivityControl.choose( 0.4 );
assert.equal( input.sensitivity, 0.4, 'slider updates the shared mouse input' );
sensitivityControl.reset();
assert.equal( input.sensitivity, 1, 'reset restores the factory default rather than the saved value' );
assert.equal( sensitivityControl.value, 1 );
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

// The shared Input scale reaches each camera exactly once, without residual rotation.
const near = ( actual, expected, label ) => assert.ok( Math.abs( actual - expected ) < 1e-9, `${ label }: ${ actual } vs ${ expected }` );
for ( const sensitivity of [ 0.25, 1, 2 ] ) {
	input.setSensitivity( sensitivity );
	for ( const mode of [ 'walk', 'swim', 'deck', 'first', 'third', 'fly' ] ) {
		boat.speed = 0;
		groundHeight = mode === 'swim' ? - 10 : 0;
		player.mode = mode === 'first' || mode === 'third' ? 'boat' : mode;
		player.setCameraMode( mode === 'third' ? 'third' : 'first' );
		player.yaw = player.deckYaw = player.helmYaw = player.orbitYaw = 0;
		player.pitch = player.helmPitch = 0;
		player.orbitPitch = 0.3;
		player.deckPos.set( 0, 1, - 1 );
		player.position.set( 0, 0, 0 );
		const fly = new FlyCamera( camera, null, input );
		const update = () => mode === 'fly' ? fly.update( 1 / 60 ) : player.update( 1 / 60 );
		input.look.x = 20;
		input.look.y = 5;
		update();
		const yaw = () => mode === 'fly' ? fly.yaw : player[ { walk: 'yaw', swim: 'yaw', deck: 'deckYaw', first: 'helmYaw', third: 'orbitYaw' }[ mode ] ];
		const pitch = () => mode === 'fly' ? fly.pitch : player[ mode === 'first' ? 'helmPitch' : mode === 'third' ? 'orbitPitch' : 'pitch' ];
		const rate = mode === 'third' ? 0.003 : 0.0022;
		near( yaw(), - 20 * rate * sensitivity, `${ mode } yaw at ${ sensitivity }x` );
		near( pitch(), mode === 'third' ? 0.3 + 5 * rate * sensitivity : - 5 * rate * sensitivity, `${ mode } pitch at ${ sensitivity }x` );
		const beforeYaw = yaw(), beforePitch = pitch();
		for ( let i = 0; i < 120; i ++ ) update();
		near( yaw(), beforeYaw, `${ mode } stops rotating after mouse stops` );
		near( pitch(), beforePitch, `${ mode } stops pitching after mouse stops` );
	}
}

// Even vertical-only or subpixel manual input takes priority over the moving boat's follow camera.
player.mode = 'boat';
player.setCameraMode( 'third' );
boat.speed = 3;
player.orbitYaw = 0;
input.setSensitivity( 1 );
for ( let i = 0; i < 120; i ++ ) {
	input.look.y = 0.1;
	frame();
}
near( player.orbitYaw, 0, 'vertical looking does not also turn the chase camera sideways' );
input.look.x = 0.1;
frame();
near( player.orbitYaw, - 0.0003, 'small horizontal adjustments retain their exact direction' );
const manualYaw = player.orbitYaw;
for ( let i = 0; i < 60; i ++ ) frame();
near( player.orbitYaw, manualYaw, 'camera does not immediately pull back when the mouse stops' );
for ( let i = 0; i < 90; i ++ ) frame();
assert.ok( Math.abs( player.orbitYaw - manualYaw ) > 0.1, 'gentle heading follow resumes after manual looking settles' );
boat.speed = 0;
input.setSensitivity( 1 );

// Exercise the orbit independently of mouse filtering: a queued half-turn used to
// send the camera straight across the boat and flip it nearly 180 degrees overhead.
const target = boat.toWorld( new Vector3( 0, 1.4, 0 ), new Vector3() );
for ( const degrees of [ 170, 180, - 179 ] ) {
	player.setCameraMode( 'third' );
	player.orbitYaw = 0;
	player.orbitPitch = 0.22;
	player.orbitDist = 13;
	player.updateBoat( 1 / 30 );
	player.orbitYaw = degrees * Math.PI / 180;
	const previous = camera.quaternion.clone();
	for ( let i = 0; i < 30; i ++ ) {
		player.updateBoat( 1 / 30 );
		near( camera.position.distanceTo( target ), 13, 'a fast orbit preserves its distance instead of cutting through the boat' );
		assert.ok( previous.angleTo( camera.quaternion ) <= Math.PI / 9 + 1e-6, 'orbit smoothing cannot flip the view overhead' );
		previous.copy( camera.quaternion );
	}
}

// Numeric wraparound must take the short arc rather than orbiting almost a full turn.
player.setCameraMode( 'third' );
player.orbitYaw = Math.PI - 0.04;
player.updateBoat( 1 / 60 );
const beforeWrap = camera.quaternion.clone();
player.orbitYaw = - Math.PI + 0.04;
for ( let i = 0; i < 60; i ++ ) {
	const previous = camera.quaternion.clone();
	player.updateBoat( 1 / 60 );
	assert.ok( previous.angleTo( camera.quaternion ) < 0.01, 'crossing ±pi uses the shortest yaw arc' );
	near( camera.position.distanceTo( target ), 13, 'yaw wrap preserves the orbit radius' );
}
assert.ok( Math.abs( beforeWrap.angleTo( camera.quaternion ) - 0.08 ) < 0.001, 'the total wrapped orbit is only 0.08 radians' );

// After sustained fast looking the eased camera trails its target. A slow frame
// cannot suddenly consume that entire angular gap, even though the mouse has stopped.
player.setCameraMode( 'third' );
player.orbitYaw = 0;
player.updateBoat( 1 / 60 );
for ( let i = 0; i < 30; i ++ ) {
	input.look.x = 1000;
	player.updateBoat( 1 / 60 );
}
const beforeSlowFrame = camera.quaternion.clone();
player.updateBoat( 0.1 );
assert.ok( beforeSlowFrame.angleTo( camera.quaternion ) <= Math.PI / 9 + 1e-6, 'a slow frame keeps camera-follow rotation within 20 degrees' );
near( camera.position.distanceTo( target ), 13, 'slow-frame catch-up also preserves the orbit radius' );

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

console.log( 'Player camera passed: first/third positions, V and UI bindings, six-mode sensitivity/reset, idle stability, manual-look priority, fixed-radius fast orbits and shortest yaw wrap.' );
