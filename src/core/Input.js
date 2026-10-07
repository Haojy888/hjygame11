// Keyboard / mouse input with pointer lock support.
const SENSITIVITY_KEY = 'tidewater.mouseSensitivity.v1';

export class Input {

	constructor( dom ) {

		this.dom = dom;
		this.keys = new Set();
		this.pressed = new Set();
		this.look = { x: 0, y: 0 };
		this.wheel = 0;
		this.mouseDown = false;
		this.rightDown = false;
		this.locked = false;
		this.enabled = true;
		this.focused = ! document.hidden && ( document.hasFocus?.() ?? true );
		this.interrupted = false;
		this.sensitivity = 1;
		this._mousePosition = null;
		this._skipLockedMove = false;
		try {

			const saved = JSON.parse( localStorage.getItem( SENSITIVITY_KEY ) );
			if ( Number.isFinite( saved ) ) this.sensitivity = Math.max( 0.1, Math.min( 3, saved ) );

		} catch { /* Storage may be unavailable or contain an old invalid value. */ }

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' ) ) return;
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes( e.code ) ) e.preventDefault();
			// A cleared input (focus loss or rescue) needs a fresh physical press.
			if ( e.repeat ) return;
			if ( ! this.keys.has( e.code ) ) this.pressed.add( e.code );
			this.keys.add( e.code );

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => {

			this.focused = false;
			this.clear();

		} );
		window.addEventListener( 'focus', () => { this.focused = ! document.hidden; } );
		document.addEventListener( 'visibilitychange', () => {

			this.focused = ! document.hidden && ( document.hasFocus?.() ?? true );
			if ( ! this.focused ) this.clear();

		} );

		dom.addEventListener( 'mousedown', ( e ) => {

			if ( ! this.enabled || ! this.focused || e.target?.closest?.( '.tw-interactive' ) ) return;
			if ( e.button === 0 ) this.mouseDown = true;
			if ( e.button === 2 ) this.rightDown = true;
			this._mousePosition = Number.isFinite( e.clientX ) && Number.isFinite( e.clientY ) ? { x: e.clientX, y: e.clientY } : null;

		} );
		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = false;
			if ( e.button === 2 ) this.rightDown = false;
			if ( ! this.mouseDown && ! this.rightDown ) this._mousePosition = null;

		} );
		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		window.addEventListener( 'mousemove', ( e ) => {

			if ( ! this.enabled || ! this.focused || e.target?.closest?.( '.tw-interactive' ) ) {

				this._resetMouse();
				return;

			}
			if ( ! this.locked && ! this.mouseDown && ! this.rightDown ) return;
			let dx, dy;
			if ( this.locked ) {

				// Browsers can report the pointer's recentering as the first locked motion.
				if ( this._skipLockedMove ) { this._skipLockedMove = false; return; }
				dx = e.movementX;
				dy = e.movementY;

			} else {

				const previous = this._mousePosition;
				this._mousePosition = Number.isFinite( e.clientX ) && Number.isFinite( e.clientY ) ? { x: e.clientX, y: e.clientY } : null;
				if ( ! previous || ! this._mousePosition ) return;
				// Keep dragging in CSS pixels; movementX may use a different scale without lock.
				dx = e.clientX - previous.x;
				dy = e.clientY - previous.y;

			}
			// Reject a broken event, without limiting legitimate movement accumulated over a frame.
			if ( ! Number.isFinite( dx ) || ! Number.isFinite( dy ) || Math.abs( dx ) > 512 || Math.abs( dy ) > 512 ) return;
			this.look.x += dx;
			this.look.y += dy;

		} );
		dom.addEventListener( 'wheel', ( e ) => {

			this.wheel += Math.sign( e.deltaY );
			e.preventDefault();

		}, { passive: false } );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === dom;
			this._resetMouse();

		} );

	}

	clear() {

		// Keep the interruption until a frame consumes it, even if a hidden tab ran no frames.
		this.interrupted = true;
		this.keys.clear();
		this.pressed.clear();
		this._resetMouse();
		this.wheel = 0;

	}

	_resetMouse() {

		// Cancelling a held button is not a physical release (which would cast the rod).
		if ( this.mouseDown || this.rightDown ) this.interrupted = true;
		this.mouseDown = false;
		this.rightDown = false;
		this.look.x = 0;
		this.look.y = 0;
		this._mousePosition = null;
		this._skipLockedMove = this.locked;

	}

	setSensitivity( value ) {

		if ( ! Number.isFinite( value ) ) return this.sensitivity;
		this.sensitivity = Math.max( 0.1, Math.min( 3, value ) );
		try { localStorage.setItem( SENSITIVITY_KEY, String( this.sensitivity ) ); } catch { /* Settings still work without storage. */ }
		return this.sensitivity;

	}

	requestLock() {

		if ( ! this.locked ) this.dom.requestPointerLock?.()?.catch?.( () => {} );

	}

	down( code ) {

		return this.enabled && this.keys.has( code );

	}

	// true once per physical key press
	hit( code ) {

		return this.enabled && this.pressed.has( code );

	}

	consumeLook() {

		if ( ! this.enabled || ! this.focused ) this._resetMouse();
		const l = { x: this.look.x * this.sensitivity, y: this.look.y * this.sensitivity };
		this.look.x = 0;
		this.look.y = 0;
		return l;

	}

	consumeWheel() {

		const w = this.wheel;
		this.wheel = 0;
		return w;

	}

	endFrame() {

		this.pressed.clear();
		this.interrupted = false;

	}

}
