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
const near = ( actual, expected, message ) => assert.ok( Math.abs( actual - expected ) < 1e-9, `${ message }: ${ actual } vs ${ expected }` );
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
	const move = ( x, y, coordinates = {} ) => emit( win, 'mousemove', { movementX: x, movementY: y, ...coordinates } );
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
	const burst = input.consumeLook();
	near( Math.hypot( burst.x, burst.y ) * 0.0022, Math.PI / 15, 'an excessive batch is bounded to 12 degrees at 60 FPS' );
	near( burst.x / burst.y, - 2, 'turn limiting preserves the requested direction' );
	for ( let i = 0; i < 5; i ++ ) move( 6, - 3 );
	assert.deepEqual( input.consumeLook(), { x: 30, y: - 15 }, 'ordinary event batches keep their exact displacement' );
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

	lock( canvas );
	input.endFrame();
	const fixed = { clientX: 640, clientY: 360 };
	move( 0, 0, fixed );
	move( 320, 0, fixed );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'a zero first packet cannot let the next recentering packet turn the camera' );
	emit( canvas, 'mousedown', { button: 0, ...fixed } );
	move( 8, 2, fixed );
	const warped = { clientX: 460, clientY: 360 };
	move( - 180, 0, warped );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'a locked coordinate warp discards this frame motion' );
	assert.equal( input.mouseDown, true, 'a coordinate warp does not cancel a held cast or reel' );
	assert.equal( input.interrupted, false );
	move( 4, 1, warped );
	assert.deepEqual( input.consumeLook(), { x: 4, y: 1 }, 'normal movement resumes at the new locked coordinate baseline' );
	emit( win, 'mouseup', { button: 0 } );
	move( 180, 0, warped );
	near( input.consumeLook().x * 0.0022, Math.PI / 15, 'a moderate constant-coordinate spike is bounded even below the single-event threshold' );
	input.setSensitivity( 3 );
	for ( let i = 0; i < 10; i ++ ) move( 60, 30, warped );
	const scaledBurst = input.consumeLook( 1 / 60, 0.003 );
	near( Math.hypot( scaledBurst.x, scaledBurst.y ) * 0.003, Math.PI / 15, 'high sensitivity and the chase camera use the same angular budget' );
	move( 400, 0, warped );
	near( input.consumeLook( 1 ).x * 0.0022, Math.PI / 9, 'a long render stall never permits more than 20 degrees at once' );
	assert.deepEqual( input.consumeLook(), { x: 0, y: 0 }, 'excess turn is discarded without a later tail' );
	input.setSensitivity( 1 );
	for ( const fps of [ 30, 60, 144 ] ) {

		let total = 0;
		for ( let frame = 0; frame < fps; frame ++ ) {

			// The same 600 pixels/s input, split into multiple native events per frame.
			for ( let event = 0; event < 3; event ++ ) move( 200 / fps, 0, warped );
			total += input.consumeLook( 1 / fps ).x;

		}
		near( total, 600, `ordinary turning retains its full displacement at ${ fps } FPS` );

	}
	for ( const dt of [ 0, NaN, Infinity, - 1 ] ) {

		move( 4, 2, warped );
		assert.deepEqual( input.consumeLook( dt ), { x: 0, y: 0 }, 'invalid frame time cannot cause a jump' );

	}

	// One shared multiplier applies after validation and survives a new Input instance.
	storageWrites = 0;
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

	// Request raw input once; only an unsupported raw-input option warrants the normal-lock fallback.
	lock( null );
	let resolveLock, requests = [];
	canvas.requestPointerLock = ( options ) => {

		requests.push( options );
		return new Promise( resolve => { resolveLock = resolve; } );

	};
	const pending = input.requestLock();
	await input.requestLock();
	assert.deepEqual( requests, [ { unadjustedMovement: true } ], 'concurrent requests share the pending raw-input attempt' );
	resolveLock();
	await pending;
	requests = [];
	canvas.requestPointerLock = ( options ) => {

		requests.push( options );
		return options ? Promise.reject( Object.assign( new Error(), { name: 'NotSupportedError' } ) ) : Promise.resolve();

	};
	await input.requestLock();
	assert.deepEqual( requests, [ { unadjustedMovement: true }, undefined ], 'unsupported raw input falls back to standard pointer lock' );
	requests = [];
	canvas.requestPointerLock = ( options ) => { requests.push( options ); throw Object.assign( new Error(), { name: 'NotAllowedError' } ); };
	await input.requestLock();
	assert.equal( requests.length, 1, 'a denied lock is not retried as a second request' );
	assert.equal( input._lockPending, false, 'failure releases the pending-request guard' );
	requests = [];
	canvas.requestPointerLock = ( options ) => { requests.push( options ); };
	await input.requestLock();
	assert.deepEqual( requests, [ { unadjustedMovement: true } ], 'legacy non-Promise pointer lock remains supported' );
	doc.pointerLockElement = canvas;
	await input.requestLock();
	assert.equal( requests.length, 1, 'the actual locked element prevents a request before the change event arrives' );
	console.log( 'Input passed: lock/focus/UI/warp isolation, raw-input fallback, bounded turns without a tail, frame-rate-independent normal motion and safe saved sensitivity.' );

} finally {

	if ( previousWindow === undefined ) delete globalThis.window;
	else globalThis.window = previousWindow;
	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;
	if ( previousStorage ) Object.defineProperty( globalThis, 'localStorage', previousStorage );
	else delete globalThis.localStorage;

}
