import assert from 'node:assert/strict';
import { AdaptiveResolution, QUALITY_PRESETS, loadGraphics, saveGraphics, normalizeGraphics, renderScale } from '../src/core/RenderQuality.js';
import { App } from '../src/App.js';
import { Engine } from '../src/engine/Engine.js';
import { Timer } from '../src/engine/math/Timer.js';

assert.deepEqual( normalizeGraphics( null ), { preset: 'balanced', renderScale: 1, targetFPS: 60 } );
assert.equal( normalizeGraphics( { preset: '__proto__' } ).preset, 'balanced' );
assert.equal( normalizeGraphics( { preset: 'native', renderScale: 0.5 } ).renderScale, 1 );
for ( const [ value, expected ] of [ [ NaN, 1 ], [ Infinity, 1 ], [ - 9, 0.5 ], [ 5, 1 ], [ 0.76, 0.75 ] ] ) assert.equal( renderScale( value ), expected );
const badStorage = { getItem() { throw Error( 'blocked' ); }, setItem() { throw Error( 'quota' ); } };
assert.equal( loadGraphics( badStorage ).preset, 'balanced' );
assert.doesNotThrow( () => saveGraphics( {}, badStorage ) );
assert.equal( loadGraphics( { getItem: () => '{broken' } ).preset, 'balanced' );

const controller = new AdaptiveResolution(), changes = [];
let scale = 1;
for ( let frame = 0; frame < 900; frame ++ ) {

	const next = controller.update( 1 / 30, scale, 60, 0.65, 1 );
	if ( next !== scale ) changes.push( frame / 30 );
	scale = next;

}
assert.equal( scale, 0.65, 'Sustained low frame rate reaches the balanced floor' );
assert.ok( changes.every( ( time, index ) => ! index || time - changes[ index - 1 ] >= 3.9 ), 'Allocation changes are separated by settling and measurement windows' );
for ( let frame = 0; frame < 720; frame ++ ) scale = controller.update( 1 / 60, scale, 60, 0.65, 1 );
assert.equal( scale, 0.7, 'Good performance restores resolution slowly' );
const stable = new AdaptiveResolution(); let stableScale = 0.8;
for ( let frame = 0; frame < 2400; frame ++ ) stableScale = stable.update( 1 / 60, stableScale, 60, 0.5, 0.85 );
assert.equal( stableScale, 0.85, 'The smooth preset respects its upper bound' );
const lowTarget = new AdaptiveResolution(); let targetScale = 1;
for ( let frame = 0; frame < 900; frame ++ ) targetScale = lowTarget.update( 1 / 30, targetScale, 30, 0.65, 1 );
assert.equal( targetScale, 1, 'A stable 30 FPS satisfies a chosen 30 FPS target' );
const hitch = new AdaptiveResolution(); let hitchScale = 1;
for ( let frame = 0; frame < 1200; frame ++ ) hitchScale = hitch.update( frame === 200 ? 0.2 : 1 / 60, hitchScale, 60, 0.65, 1 );
assert.equal( hitchScale, 1, 'One isolated hitch cannot lower resolution' );
for ( const dt of [ NaN, - 1, 0, 2 ] ) assert.equal( hitch.update( dt, 0.8, 60, 0.65, 1 ), 0.8 );

const saved = Object.fromEntries( [ 'document', 'location', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame' ].map( ( key ) => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
const visibility = new EventTarget(); visibility.hidden = false;
const timer = new Timer(); timer.connect( visibility ); timer.update( performance.now() );
visibility.hidden = true; timer.update( performance.now() + 10000 ); assert.equal( timer.getDelta(), 0 );
visibility.hidden = false; visibility.dispatchEvent( new Event( 'visibilitychange' ) );
timer.update( performance.now() + 16 ); assert.ok( timer.getDelta() >= 0 && timer.getDelta() < 0.05, 'Returning to a tab discards hidden time' ); timer.disconnect();
const data = new Map( [ [ 'tidewater.save.v1', 'existing game progress' ] ] );
let writes = 0, focused = true;
try {

	globalThis.location = { search: '' };
	globalThis.document = { hidden: false, hasFocus: () => focused, getElementById: () => null };
	globalThis.localStorage = { getItem: ( key ) => data.get( key ), setItem( key, value ) { writes ++; data.set( key, value ); } };
	const app = new App(), sizeWrites = [];
	app.post = { scale: 1, setScale( value ) { this.scale = value; sizeWrites.push( value ); } };
	app.clouds = { resolutionScale: 1 }; app.engine = { frameDelta: 0.25 };
	app.ui = { ui: {} }; app.game = { hud: {}, worldMap: {} }; app._renderStarted = true;
	const run = ( seconds, fps = 30 ) => { for ( let i = 0; i < seconds * fps; i ++ ) app.updateRenderQuality( 1 / fps ); };
	app.setQualityPreset( 'smooth' ); assert.equal( app.post.scale, 0.8 );
	const explicitWrites = writes; run( 16 );
	assert.ok( app.post.scale < 0.8 ); assert.equal( app.clouds.resolutionScale, app.post.scale );
	assert.equal( writes, explicitWrites, 'Automatic steps do not write preferences every frame' );
	app.setQualityPreset( 'native' ); run( 20, 5 ); assert.equal( app.post.scale, 1 );
	assert.equal( app.setQualityPreset( '__proto__' ), false ); assert.equal( app.setTargetFPS( 144 ), false );
	app.setRenderScale( 0.65, true ); assert.equal( app.settings.qualityPreset, 'manual' );
	app.setTargetFPS( 30 );
	const loaded = new App(); assert.equal( loaded.settings.renderScale, 0.65 ); assert.equal( loaded.settings.targetFPS, 30 );
	app.ui.ui._photo = true; app.updateRenderQuality( 1 / 60 );
	assert.equal( app.post.scale, 1 );
	const photoWrites = sizeWrites.length; run( 1, 60 ); assert.equal( sizeWrites.length, photoWrites );
	app.persistRenderQuality(); assert.equal( loadGraphics().renderScale, 0.65, 'Temporary native photos do not overwrite the manual preference' );
	app.ui.ui._photo = false; app.updateRenderQuality( 1 / 60 ); assert.equal( app.post.scale, 0.65 );
	app.ui.ui._photo = true; app.updateRenderQuality( 1 / 60 ); app.ui.ui._photo = false;
	app.setQualityPreset( 'native' ); app.updateRenderQuality( 1 / 60 );
	assert.equal( app.post.scale, 1, 'Changing a preset while leaving photo mode cannot restore an obsolete scale' );
	app.setQualityPreset( 'balanced' );
	for ( const [ object, key ] of [ [ document, 'hidden' ], [ app.ui.ui, '_start' ], [ app.ui.ui, 'panelOpen' ], [ app.ui.ui, 'helpOpen' ], [ app.game.worldMap, 'open' ], [ app.game.hud, 'invOpen' ], [ app.game.hud, 'standOpen' ], [ app.game.hud, 'catchOpen' ] ] ) {

		object[ key ] = true; run( 10 ); assert.equal( app.post.scale, 1, key + ' cannot bias automatic quality' ); object[ key ] = false;

	}
	focused = false; run( 10 ); assert.equal( app.post.scale, 1 ); focused = true;
	app.qs.set( 'bench', '' ); run( 10 ); assert.equal( app.post.scale, 1 ); app.qs.delete( 'bench' );
	app._renderStarted = false; run( 10 ); assert.equal( app.post.scale, 1 ); app._renderStarted = true;
	app._frame = ( dt, frameTime ) => { assert.equal( dt, 0.1 ); assert.equal( frameTime, 0.25 ); };
	app.frame( 0.1 );
	for ( let i = 0; i < 4; i ++ ) app.updateFPS( 0.25 );
	assert.equal( app.fps, 4, 'FPS uses real frame intervals even when physics is capped at 100 ms' );
	app.updateFPS( 0 ); app.updateFPS( NaN ); assert.equal( app._fps.n, 0, 'Hidden timer ticks do not inflate FPS' );
	assert.equal( data.get( 'tidewater.save.v1' ), 'existing game progress' );
	let callback, primed = 0, physicsDelta;
	globalThis.requestAnimationFrame = ( fn ) => { callback = fn; return 1; };
	globalThis.cancelAnimationFrame = () => {};
	const engine = new Engine( null );
	engine.clock = { reset() { primed ++; }, update() {}, getDelta: () => 0.25, getElapsed: () => 1 };
	engine.start( ( dt ) => { physicsDelta = dt; } ); callback( 1000 ); engine.stop();
	assert.equal( primed, 1 ); assert.equal( physicsDelta, 0.1 ); assert.equal( engine.frameDelta, 0.25 );

} finally {

	for ( const [ key, descriptor ] of Object.entries( saved ) ) if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ];

}
console.log( 'Render quality passed: pacing/hysteresis, scale bounds, presets, real frame time, focus/menu/benchmark guards, native photo restore, preferences, blocked storage and preserved game saves.' );
