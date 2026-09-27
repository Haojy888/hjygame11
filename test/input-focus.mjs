import assert from 'node:assert/strict';
import { Input } from '../src/core/Input.js';

const previousWindow = globalThis.window, previousDocument = globalThis.document;
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
		emit( canvas, 'mousedown', { button: 0 } );
		emit( canvas, 'mousedown', { button: 2 } );
		emit( win, 'mousemove', { movementX: 12, movementY: 6 } );
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
	console.log( 'Input focus passed: blur and hidden tabs clear held buttons, keys and pending camera motion.' );

} finally {

	if ( previousWindow === undefined ) delete globalThis.window;
	else globalThis.window = previousWindow;
	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;

}
