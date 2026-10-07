import assert from 'node:assert/strict';
import { Input } from '../src/core/Input.js';

const previousWindow = globalThis.window, previousDocument = globalThis.document;
const previousStorage = Object.getOwnPropertyDescriptor( globalThis, 'localStorage' );
const stored = new Map();
let storageWrites = 0;
Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: {
	getItem: key => stored.get( key ) ?? null,
	setItem: ( key, value ) => { storageWrites ++; stored.set( key, value ); },
} } );
const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
doc.hidden = false;
doc.hasFocus = () => true;
globalThis.window = win;
globalThis.document = doc;
const emit = ( target, type, fields = {} ) => target.dispatchEvent( Object.assign( new Event( type ), fields ) );
try {

	const input = new Input( canvas );
	const press = () => {

		emit( win, 'keydown', { code: 'KeyW' } );
		emit( canvas, 'mousedown', { button: 0, clientX: 100, clientY: 100 } );
		emit( canvas, 'mousedown', { button: 2, clientX: 100, clientY: 100 } );
		emit( win, 'mousemove', { clientX: 112, clientY: 106, movementX: 12, movementY: 6 } );
		emit( canvas, 'wheel', { deltaY: 1 } );
		assert.equal( input.down( 'KeyW' ), true );
		assert.equal( input.mouseDown, true );

	};
	const cleared = () => {

		assert.equal( input.focused, false );
		assert.equal( input.interrupted, true );
		assert.equal( input.down( 'KeyW' ), false );
		assert.equal( input.hit( 'KeyW' ), false );
		assert.equal( input.mouseDown, false );
		assert.equal( input.rightDown, false );
		assert.deepEqual( input.consumeLook(), { x: 0, y: 0 } );
		assert.equal( input.consumeWheel(), 0 );

	};
	press();
	emit( win, 'blur' );
	cleared();
	emit( win, 'focus' );
	assert.equal( input.focused, true );
	assert.equal( input.mouseDown, false, 'returning to the window does not resume holding the reel' );
	press();
	doc.hidden = true;
	emit( doc, 'visibilitychange' );
	cleared();
	emit( win, 'focus' );
	assert.equal( input.focused, false, 'a hidden tab stays inactive' );
	doc.hidden = false;
	emit( doc, 'visibilitychange' );
	assert.equal( input.focused, true );
	assert.equal( input.interrupted, true, 'the resumed frame can detect a hidden tab even without background frames' );
	assert.equal( input.mouseDown, false );
	press();
	input.endFrame();
	assert.equal( input.interrupted, false, 'interruption clears after the game consumes the frame' );
	assert.equal( input.hit( 'KeyW' ), false );
	assert.equal( input.down( 'KeyW' ), true, 'ordinary held keys still work across frames' );
	emit( win, 'keydown', { code: 'KeyX' } );
	assert.equal( input.down( 'KeyX' ), true );
	input.clear();
	input.endFrame();
	emit( win, 'keydown', { code: 'KeyX', repeat: true } );
	assert.equal( input.down( 'KeyX' ), false, 'OS key repeat cannot request another rescue after input was cleared' );
	emit( win, 'keyup', { code: 'KeyX' } );
	emit( win, 'keydown', { code: 'KeyX', repeat: false } );
	assert.equal( input.down( 'KeyX' ), true, 'a fresh physical press can request rescue again' );
	input.clear();
	input.endFrame();
	const move = ( x, y ) => emit( win, 'mousemove', { movementX: x, movementY: y } );
	const lock = element => {

		doc.pointerLockElement = element;
		emit( doc, 'pointerlockchange' );

	};
	assert.equal( input.sensitivity, 1, 'existing users keep the original sensitivity' );

	// Unlocked dragging uses continuous CSS coordinates, independent of movementX's browser units.
	emit( canvas, 'mousedown', { button: 0, clientX: 30, clientY: 40 } );
	emit( win, 'mousemove', { clientX: 42, clientY: 44, movementX: 2400, movementY: - 1200 } );
	assert.deepEqual( input.consumeLook(), { x: 12, y: 4 } );
	emit( win, 'mousemove', { clientX: 2500, clientY: 2500 } );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'a discontinuous drag is discarded' );
	emit( win, 'mousemove', { clientX: 2505, clientY: 2498 } );
	assert.deepEqual( input.consumeLook(), { x: 5, y: - 2 }, 'drag resumes from the new location without a deferred jump' );
	emit( win, 'mouseup', { button: 0 } );
	emit( win, 'mousemove', { clientX: 3000, clientY: 3000 } );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 } );
	emit( canvas, 'mousedown', { button: 2, clientX: 400, clientY: 500 } );
	emit( win, 'mousemove', { clientX: 401, clientY: 502 } );
	assert.deepEqual( input.consumeLook(), { x: 1, y: 2 }, 'each new drag establishes its own baseline' );

	// Entering and leaving pointer lock must not replay motion or keep a drag held.
	emit( win, 'mousemove', { clientX: 491, clientY: 502 } );
	lock( canvas );
	assert.equal( input.rightDown, false );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 } );
	move( 300, - 200 );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'first locked motion may be pointer recentering' );
	move( 12, 3 );
	move( 2400, - 1200 );
	move( NaN, 3 );
	move( 3, Infinity );
	move( undefined, 4 );
	assert.deepEqual( input.consumeLook(), { x: 12, y: 3 }, 'broken events cannot poison or add to valid input' );
	for ( let i = 0; i < 20; i ++ ) move( 32, - 16 );
	assert.deepEqual( input.consumeLook(), { x: 640, y: - 320 }, 'normal fast events accumulate without a frame-dependent cap' );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'no smoothing tail continues turning after mouse movement stops' );
	assert.equal( storageWrites, 0, 'moving the mouse never writes settings' );
	emit( canvas, 'mousedown', { button: 0 } );
	move( 90, 0 );
	lock( null );
	assert.equal( input.mouseDown, false );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 } );

	// UI movement and inactive frames clear the old drag as well as the pending deltas.
	emit( canvas, 'mousedown', { button: 0, clientX: 1, clientY: 1 } );
	emit( win, 'mousemove', { clientX: 5, clientY: 5 } );
	win.closest = () => ( {} );
	emit( win, 'mousemove', { clientX: 25, clientY: 25 } );
	delete win.closest;
	assert.equal( input.mouseDown, false );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'moving over interactive UI cannot rotate the scene' );
	canvas.closest = () => ( {} );
	emit( canvas, 'mousedown', { button: 0, clientX: 1, clientY: 1 } );
	delete canvas.closest;
	assert.equal( input.mouseDown, false );
	lock( canvas );
	move( 0, 0 );
	move( 40, 10 );
	input.enabled = false;
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'disabling input discards already accumulated motion' );
	move( 50, 10 );
	input.enabled = true;
	move( 500, 500 );
	move( 2, 3 );
	assert.deepEqual( input.consumeLook(), { x: 2, y: 3 }, 're-enabled locked input ignores its first recentering event' );
	emit( win, 'blur' );
	move( 60, 20 );
	emit( canvas, 'mousedown', { button: 2 } );
	assert.equal( input.rightDown, false );
	emit( win, 'focus' );
	move( 500, 500 );
	move( 3, 4 );
	assert.deepEqual( input.consumeLook(), { x: 3, y: 4 }, 'focus restoration never replays motion from the inactive window' );

	// One shared multiplier applies after validation and survives a new Input instance.
	assert.equal( input.setSensitivity( 0.5 ), 0.5 );
	move( 12, - 8 );
	assert.deepEqual( input.consumeLook(), { x: 6, y: - 4 } );
	assert.equal( new Input( new EventTarget() ).sensitivity, 0.5 );
	for ( const invalid of [ NaN, Infinity, - Infinity, '2', null, undefined, {} ] ) {

		assert.equal( input.setSensitivity( invalid ), 0.5 );

	}
	assert.equal( storageWrites, 1, 'invalid settings neither change sensitivity nor write storage' );
	assert.equal( input.setSensitivity( 20 ), 3 );
	assert.equal( input.setSensitivity( - 20 ), 0.1 );
	assert.equal( stored.get( 'tidewater.mouseSensitivity.v1' ), '0.1' );
	const storageKey = 'tidewater.mouseSensitivity.v1';
	for ( const invalid of [ 'garbage', 'null', '"2"', '{}' ] ) {

		stored.set( storageKey, invalid );
		assert.equal( new Input( new EventTarget() ).sensitivity, 1 );

	}
	stored.set( storageKey, '20' );
	assert.equal( new Input( new EventTarget() ).sensitivity, 3 );
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, get() { throw new Error( 'Storage blocked' ); } } );
	assert.equal( new Input( new EventTarget() ).sensitivity, 1 );
	assert.equal( input.setSensitivity( 1.25 ), 1.25, 'storage failure does not prevent adjusting the camera' );
	console.log( 'Input passed: focus/lock/UI transitions clear mouse state, spikes are rejected without a frame cap, and sensitivity persists safely.' );

} finally {

	if ( previousWindow === undefined ) delete globalThis.window;
	else globalThis.window = previousWindow;
	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;
	if ( previousStorage ) Object.defineProperty( globalThis, 'localStorage', previousStorage );
	else delete globalThis.localStorage;

}
