// Game.update with a real fight and a small app shell: overlays pause fishing, not the world.
import { Game } from '../src/game/Game.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { Input } from '../src/core/Input.js';

const assert = ( condition, message ) => {

	if ( ! condition ) throw new Error( message );
	console.log( 'ok  ', message );

};

function harness( state = 'floating' ) {

	const input = { enabled: true, focused: true, interrupted: false, mouseDown: false, rightDown: false, hit: () => false };
	const ui = { helpOpen: false, panelOpen: false, _start: false };
	const player = { mode: 'walk', surface: 'wood', position: { x: 0, z: 0 }, prompt: null };
	const hud = { invOpen: false, standOpen: false, catchOpen: false, update: () => {} };
	const rod = {
		state, equipped: true, power: 0.6, dip: 0, t: 0, elapsed: 0, releases: 0, windups: 0, crankRate: 1,
		get lineInWater() { return [ 'floating', 'fighting', 'flying', 'retrieving' ].includes( this.state ); },
		setState( next ) { this.state = next; this.t = 0; },
		startWindup() { this.windups ++; this.setState( 'windup' ); },
		release() { this.releases ++; this.setState( 'flick' ); },
		update( dt ) { this.t += dt; this.elapsed += dt; },
	};
	const game = Object.create( Game.prototype );
	game.app = { player, input, ui: { ui }, freeCam: false, settings: { timeOfDay: 12 }, audio: null };
	game.hud = hud;
	game.rod = rod;
	game.bite = { phase: 'wait', t: 10 };
	game.fight = null;
	game.landing = null;
	game.display = { shown: false };
	game.vendors = [];
	game.updateBoat = () => {};
	game.updateVendors = () => {};
	game.checkFishingAccess = () => true;
	game.habitat = () => ( { shallows: 1, reef: 0, pier: 0, bay: 0, deep: 0 } );
	return { game, input, ui, player, hud, rod };

}

{

	const { game, ui, player, rod } = harness();
	game.update( 1 );
	assert( game.bite.t === 9 && rod.elapsed === 1, 'bite and float advance during ordinary play' );
	ui.helpOpen = true;
	player.prompt = null;
	game.update( 5 );
	assert( game.bite.t === 9 && rod.elapsed === 1 && rod.crankRate === 0 && player.prompt?.text.includes( '钓鱼已暂停' ),
		'help pauses bite and rod time and shows a pause prompt' );
	ui.helpOpen = false;
	game.update( 1 );
	assert( game.bite.t === 8 && rod.elapsed === 2, 'closing help resumes the bite timer' );
	ui.panelOpen = true;
	game.update( 1 );
	assert( game.bite.t === 7 && rod.elapsed === 3, 'settings panel keeps fishing and world time live' );

}
{

	const { game, hud, rod } = harness( 'fighting' );
	game.bite = null;
	game.fight = new CatchMinigame( { species: 'grunt', kg: 0.8, distance: 15, rng: () => 0.5 } );
	game.update( 0.25 );
	const before = game.fight.time, distance = game.fight.distance;
	hud.invOpen = true;
	game.update( 8 );
	assert( game.fight.time === before && game.fight.distance === distance && rod.elapsed === 0.25,
		'inventory freezes a real fish fight without letting the fish escape' );
	hud.invOpen = false;
	game.update( 0.25 );
	assert( game.fight.time > before && rod.elapsed === 0.5, 'fish fight resumes after inventory closes' );

}
{

	const { game, hud, input, rod } = harness( 'windup' );
	game.bite = null;
	game._lmb = true;
	input.mouseDown = true;
	hud.standOpen = true;
	game.update( 2 );
	assert( rod.state === 'idle' && rod.power === 0 && rod.releases === 0 && rod.elapsed === 0,
		'opening the shop cancels a pending cast without releasing it' );
	hud.standOpen = false;
	game.update( 1 );
	assert( rod.state === 'idle' && rod.releases === 0 && rod.windups === 0 && ! input.mouseDown,
		'resuming requires a fresh click even if the old mouse button was held' );
	input.mouseDown = true;
	game.update( 0.1 );
	input.mouseDown = false;
	game.update( 0.1 );
	assert( rod.windups === 1 && rod.releases === 1, 'a new press and release can still cast normally' );

}
{

	const { game, input, rod } = harness( 'flying' );
	input.focused = false;
	input.interrupted = true;
	game.update( 10 );
	assert( rod.elapsed === 0 && game._fishingPaused, 'window blur freezes a flying bobber' );
	input.focused = true;
	input.interrupted = false;
	game.update( 0.2 );
	assert( rod.elapsed === 0.2 && ! game._fishingPaused, 'returning to the window resumes the cast' );

}
{

	const { game, input, rod } = harness( 'windup' );
	game.bite = null;
	game._lmb = true;
	// No hidden animation frame ran, but Input.clear left its interruption flag for this frame.
	input.interrupted = true;
	input.mouseDown = false;
	game.update( 0.2 );
	assert( rod.state === 'idle' && rod.releases === 0 && rod.power === 0,
		'a hidden tab cannot turn cleared mouse input into an accidental cast on the first visible frame' );

}

// The full map uses the same fishing pause as the inventory, including a real fight.
{

	const { game, input, rod } = harness( 'fighting' );
	game.bite = null;
	game.worldMap = { open: false, update() {} };
	game.fight = new CatchMinigame( { species: 'grunt', kg: 0.8, distance: 15, rng: () => 0.5 } );
	game.update( 0.25 );
	const before = game.fight.time, distance = game.fight.distance;
	game.worldMap.open = true;
	input.enabled = false;
	game.update( 8 );
	assert( game.fight.time === before && game.fight.distance === distance && rod.elapsed === 0.25,
		'viewing the map freezes fish struggle and line time' );
	game.worldMap.open = false;
	input.enabled = true;
	game.update( 0.25 );
	assert( game.fight.time > before && rod.elapsed === 0.5, 'closing the map resumes the existing fish fight' );

}
{

	const { game, input, rod } = harness( 'windup' );
	game.bite = null;
	game._lmb = true;
	input.mouseDown = true;
	input.enabled = false;
	game.worldMap = { open: true, update() {} };
	game.update( 1 );
	assert( rod.state === 'idle' && rod.releases === 0 && rod.power === 0,
		'opening the map during charging cancels the cast without releasing it' );
	game.worldMap.open = false;
	input.enabled = true;
	game.update( 0.1 );
	assert( rod.windups === 0 && rod.releases === 0 && ! input.mouseDown,
		'closing the map requires a fresh mouse press before casting' );
	input.mouseDown = true;
	game.update( 0.1 );
	input.mouseDown = false;
	game.update( 0.1 );
	assert( rod.windups === 1 && rod.releases === 1, 'casting works normally after closing the map' );

}

// Exercise actual mouse events: dropping pointer lock or dragging onto UI must
// cancel a held cast, not look like the deliberate mouseup that releases it.
{

	const previousWindow = globalThis.window, previousDocument = globalThis.document;
	const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
	doc.hidden = false;
	doc.hasFocus = () => true;
	globalThis.window = win;
	globalThis.document = doc;
	const emit = ( target, type, fields = {} ) => target.dispatchEvent( Object.assign( new Event( type ), fields ) );
	try {

		const input = new Input( canvas );
		const { game, rod, ui } = harness( 'idle' );
		game.app.input = input;
		game.bite = null;
		const frame = () => { input.consumeLook(); game.update( 0.1 ); input.endFrame(); };
		const press = () => emit( canvas, 'mousedown', { button: 0, clientX: 20, clientY: 30 } );
		doc.pointerLockElement = canvas;
		emit( doc, 'pointerlockchange' );
		press();
		frame();
		assert( rod.state === 'windup', 'a fresh locked mouse press starts charging' );
		emit( win, 'keydown', { code: 'KeyH' } );
		ui.panelOpen = true;
		doc.pointerLockElement = null;
		emit( doc, 'pointerlockchange' );
		assert( input.interrupted && input.hit( 'KeyH' ), 'unlock marks the cancelled mouse hold without clearing keyboard input' );
		frame();
		assert( rod.state === 'idle' && rod.releases === 0, 'opening settings while charging cancels the cast instead of releasing it' );
		frame();
		assert( ! game._fishingPaused, 'settings keep fishing live after the single interruption frame' );

		ui.panelOpen = false;
		press();
		frame();
		win.closest = () => ( {} );
		emit( win, 'mousemove', { clientX: 40, clientY: 50 } );
		frame();
		assert( rod.state === 'idle' && rod.releases === 0, 'dragging a charged cast onto UI cancels safely' );
		emit( win, 'mousemove', { clientX: 41, clientY: 51 } );
		assert( ! input.interrupted, 'hovering UI without a held button does not repeatedly interrupt fishing' );
		delete win.closest;
		frame();
		press();
		frame();
		emit( win, 'mouseup', { button: 0 } );
		frame();
		assert( rod.releases === 1, 'a fresh charge and physical release still casts after returning from UI' );

		rod.state = 'fighting';
		game.fight = {};
		let reeling = null;
		game.updateFight = ( dt, held ) => { reeling = held; };
		press();
		frame();
		assert( reeling === true, 'holding a fresh press still reels the fish' );
		doc.pointerLockElement = canvas;
		emit( doc, 'pointerlockchange' );
		frame();
		frame();
		assert( reeling === false, 'cancelled mouse hold does not leave reeling stuck on' );
		press();
		frame();
		assert( reeling === true, 'reeling resumes on a new physical press after a lock transition' );

	} finally {

		if ( previousWindow === undefined ) delete globalThis.window;
		else globalThis.window = previousWindow;
		if ( previousDocument === undefined ) delete globalThis.document;
		else globalThis.document = previousDocument;

	}

}
