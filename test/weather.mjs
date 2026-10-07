// Real weather scheduler and effects, without GPU allocation or browser timers.
import assert from 'node:assert/strict';
import { Color, PerspectiveCamera, Vector2, Vector3 } from '../src/engine/index.js';
import { Weather } from '../src/sky/Weather.js';
import { Rain } from '../src/fx/Rain.js';
import { Lightning } from '../src/fx/Lightning.js';
import { Colliders } from '../src/world/Colliders.js';
import { AppUI } from '../src/ui/AppUI.js';
import { App } from '../src/App.js';
import { G } from '../src/core/Globals.js';

const uniform = ( value = 1 ) => ( { value } );
const near = ( actual, expected, text ) => assert.ok( Math.abs( actual - expected ) < 0.001, `${ text }: ${ actual } vs ${ expected }` );

function harness( cloudMode = 'pro' ) {

	const camera = new PerspectiveCamera( 62, 16 / 9, 0.1, 10000 );
	camera.position.set( 15, 1.6, 0 );
	const sky = { overcast: uniform( 0 ), lightningFlash: uniform( 0 ) };
	let coverage = 0.37, coverageChanges = 0;
	const clouds = cloudMode === 'none' ? null : { coverage: {
		get value() { return coverage; },
		set value( next ) { if ( next !== coverage ) coverageChanges ++; coverage = next; },
	}, invalidate() {}, resetHistory() {} };
	if ( cloudMode === 'old' ) clouds.cirrus = uniform( 0.24 );
	const haze = cloudMode === 'none' ? null : { density: uniform( 1.4 ), shafts: uniform( 0.6 ) };
	const colliders = new Colliders();
	colliders.addBox( new Vector3( 0, 3, 0 ), new Vector3( 4, 0.2, 4 ) );
	const rainFx = new Rain( { colliders, count: 8, rippleCount: 4 } );
	const lightning = new Lightning();
	const strikes = [], thunder = [], audio = {
		weather: null, cleared: 0,
		setWeather( state ) { this.weather = { ...state }; },
		thunder( state ) { thunder.push( { ...state } ); return true; },
		clearThunder() { this.cleared ++; },
	};
	const strike = lightning.strike.bind( lightning );
	lightning.strike = ( position, options ) => { strikes.push( { position: position.clone(), options } ); return strike( position, options ); };
	const environment = { timer: 3, interval: 3 };
	const weather = new Weather( { sky, clouds, haze, environment, terrain: { heightAt: () => - 5 }, rainFx, lightning, audio, random: () => 0.5 } );
	const effects = { windSpeed: 7, windDirection: new Vector2( 0.6, 0.8 ), underwater: false, boat: null };
	const tick = ( seconds, options = {} ) => {

		for ( let t = 0; t < seconds; t += 1 / 60 ) {

			weather.update( 1 / 60, camera, options );
			weather.updateEffects( 1 / 60, camera, effects );

		}

	};
	return { weather, camera, sky, clouds, haze, rainFx, lightning, strikes, thunder, audio, effects, tick, get coverageChanges() { return coverageChanges; } };

}

for ( const cloudMode of [ 'pro', 'old', 'none' ] ) {

	const h = harness( cloudMode );
	const { weather, sky, clouds, haze, tick } = h;
	tick( 0.1 );
	assert.equal( weather.rain, false );
	assert.equal( weather.thunderstorm, false );
	assert.equal( weather.flash, 0 );
	assert.equal( h.rainFx.group.visible, false, 'Initial renderer prime must be dry' );
	assert.equal( h.strikes.length, 0, 'Initial renderer prime cannot schedule lightning' );
	weather.setRain( true );
	tick( 8 );
	assert.ok( weather.rainIntensity > 0.4 && weather.overcast > 0.4 );
	assert.ok( sky.overcast.value > 0.4 );
	assert.equal( h.rainFx.group.visible, true );
	if ( clouds ) near( clouds.coverage.value, 0.82, 'Rain builds a cloud ceiling' );
	const changes = h.coverageChanges;
	tick( 2 );
	assert.equal( h.coverageChanges, changes, 'Steady weather must not repeatedly invalidate cloud panoramas' );
	assert.equal( h.strikes.length, 0, 'Rain alone has no lightning' );
	if ( clouds ) {

		weather.setCloudCoverage( 0.93 );
		tick( 0.1 );
		near( clouds.coverage.value, 0.93, 'Weather preserves a denser user cloud setting' );
		weather.setCloudCoverage( 0.28 );

	}
	if ( haze ) weather.setHaze( 0.65 );
	weather.setRain( false );
	tick( 25 );
	near( weather.rainIntensity, 0, 'Rain fades fully after switching off' );
	near( weather.overcast, 0, 'Clear sky returns' );
	if ( clouds ) near( clouds.coverage.value, 0.28, 'Closing weather restores the last user cloud choice' );
	if ( haze ) near( haze.density.value, 0.65, 'Closing weather restores the last user haze choice' );
	if ( clouds?.cirrus ) near( clouds.cirrus.value, 0.24, 'Legacy cirrus remains independent' );
	assert.equal( h.rainFx.group.visible, false );

}

const h = harness();
const { weather, camera, tick } = h;
weather.setThunderstorm( true );
tick( 1.5 );
assert.equal( weather.rain, true, 'Thunderstorm includes rainfall' );
assert.equal( weather.thunderstorm, true );
near( h.clouds.coverage.value, 0.96, 'Thunderstorm uses the darker cloud ceiling' );
weather._strikeIn = 0;
weather.update( 1 / 60, camera );
weather.updateEffects( 1 / 60, camera, h.effects );
assert.equal( h.strikes.length, 1, 'A due strike generates one bolt' );
assert.ok( weather.flash > 0 && h.sky.lightningFlash.value > 0 );
assert.equal( h.lightning.active, true );
assert.equal( h.thunder.length, 0, 'Distant thunder follows the flash, not the same frame' );
tick( 5 );
assert.equal( h.thunder.length, 1, 'The scheduled thunder plays once after travel delay' );
assert.ok( h.thunder[ 0 ].distance > 100 );
near( weather.flash, 0, 'A bolt flash does not persist in the sky' );
assert.equal( h.lightning.active, false );

// Roof and underwater behavior reach the real rain effect and the audio mixer.
camera.position.set( 0, 1.6, 0 );
weather.updateEffects( 1 / 60, camera, h.effects );
assert.equal( h.rainFx.sheltered, 1 );
assert.equal( h.audio.weather.sheltered, 1, 'Roof cover muffles rain audio' );
weather.updateEffects( 1 / 60, camera, { ...h.effects, underwater: true } );
assert.equal( h.rainFx.group.visible, false, 'Airborne rain is hidden underwater' );
assert.equal( h.audio.weather.underwater, true );

// Losing focus cancels pending thunder and the bolt without changing the user's selected weather.
weather._strikeIn = 0;
weather.update( 1 / 60, camera );
assert.ok( weather._pendingThunder.length > 0 );
const soundsBeforeBlur = h.thunder.length, strikesBeforeBlur = h.strikes.length;
weather.update( 1000, camera, { active: false } );
weather.updateEffects( 1 / 60, camera, h.effects );
assert.equal( weather.flash, 0 );
assert.equal( weather._pendingThunder.length, 0 );
assert.equal( h.lightning.active, false );
assert.equal( weather.thunderstorm, true );
assert.equal( h.audio.weather.rain, 0, 'Hidden windows do not keep the rain bed audible' );
weather.update( 1000, camera );
assert.equal( h.strikes.length, strikesBeforeBlur, 'Returning from a long pause cannot fast-forward overdue strikes' );
assert.equal( h.thunder.length, soundsBeforeBlur, 'Old thunder is not replayed after returning' );
for ( const dt of [ NaN, Infinity, - 1 ] ) weather.update( dt, camera );
assert.ok( [ weather.flash, weather.rainIntensity, weather.overcast ].every( Number.isFinite ) );
weather._strikeIn = 0;
weather.update( 1 / 60, camera );
weather.setThunderstorm( false );
assert.equal( weather.flash, 0 );
assert.equal( weather._pendingThunder.length, 0 );
assert.equal( weather.rain, true, 'Disabling thunder can keep ordinary rainfall' );
weather.setThunderstorm( true );
weather.setRain( false );
assert.equal( weather.thunderstorm, false, 'Turning all rain off also closes the thunderstorm' );
const land = harness();
land.weather.terrain = { heightAt: () => 5 };
land.weather.setThunderstorm( true );
land.weather._strikeIn = 0;
land.weather.update( 0.1, land.camera );
assert.equal( land.strikes.length, 0, 'A failed open-water search cannot put a bolt on land' );
assert.equal( land.weather._pendingThunder.length, 0 );

// Fresh atmosphere readbacks are independent each frame; flash cannot enter baked cloud lighting.
weather.setRain( true );
tick( 8 );
const frame = () => ( {
	sunColor: uniform( new Color( 2, 2, 2 ) ), skyIrradiance: uniform( new Color( 0.3, 0.4, 0.6 ) ),
	horizonColor: uniform( new Color( 0.6, 0.7, 0.8 ) ), envIntensity: uniform( 1 ), night: uniform( 0 ),
} );
const normal = frame();
weather.applyLighting( normal );
assert.ok( normal.sunColor.value.r < 2, 'Rain softens the direct sun' );
weather.flash = 1;
const flash = frame();
weather.applyLighting( flash );
assert.deepEqual( flash.sunColor.value.toArray(), normal.sunColor.value.toArray(), 'Flash cannot contaminate the cloud sun-light input' );
assert.deepEqual( flash.skyIrradiance.value.toArray(), normal.skyIrradiance.value.toArray(), 'Flash cannot contaminate the cloud ambient input' );
assert.deepEqual( flash.horizonColor.value.toArray(), normal.horizonColor.value.toArray() );
assert.ok( flash.envIntensity.value >= normal.envIntensity.value, 'Flash is applied to live material lighting' );
weather.flash = 0;

// Exercise the actual App integration, including prime frames before the first GPU readback.
const lightingApp = Object.assign( Object.create( App.prototype ), {
	weather, atmosphere: { sunDir: uniform( new Vector3( 0, 1, 0 ) ), sunTransmittance: null,
		skyIrradiance: [ 0.3, 0.4, 0.6 ], horizon: [ 0.6, 0.7, 0.8 ] },
} );
const lightSnapshot = () => [ ...G.sunColor.value.toArray(), ...G.skyIrradiance.value.toArray(), ...G.horizonColor.value.toArray() ];
const prime = lightSnapshot();
for ( let i = 0; i < 10; i ++ ) lightingApp.applyAtmosphereReadback();
assert.deepEqual( lightSnapshot(), prime, 'Missing initial readback must not repeatedly darken old light values' );
lightingApp.atmosphere.sunTransmittance = [ 0.8, 0.9, 1 ];
lightingApp.applyAtmosphereReadback();
const readback = lightSnapshot();
for ( let i = 0; i < 60; i ++ ) lightingApp.applyAtmosphereReadback();
assert.deepEqual( lightSnapshot(), readback, 'The App rebuilds weather lighting from the atmosphere every frame' );
weather.flash = 1;
lightingApp.applyAtmosphereReadback();
assert.deepEqual( lightSnapshot(), readback, 'An actual App flash leaves the baked cloud inputs unchanged' );
assert.ok( G.envIntensity.value > 1 );
weather.flash = 0;
lightingApp.applyAtmosphereReadback();
assert.equal( G.envIntensity.value, 1, 'Live reflection brightness resets as soon as the flash ends' );

// Real AppUI callback ordering: UI writes the bound property before invoking onChange.
const controls = [], folder = { addFolder() { return this; }, addPresets() {} };
for ( const name of [ 'addSelect', 'addSlider', 'addToggle', 'addButton', 'addInfo', 'addTimeOfDay' ] ) folder[ name ] = ( options ) => {

	const control = { ...options, enabled: true,
		setEnabled( value ) { this.enabled = value; return this; }, setVisible() { return this; },
		choose( value ) { this.object[ this.key ] = value; this.onChange?.( value, this ); },
	};
	controls.push( control ); return control;

};
const ui = { addTab: () => folder, toast() {}, refresh() {} };
const app = {
	weather, camera, clouds: h.clouds, haze: h.haze,
	settings: { timeOfDay: 12, timeSpeed: 0, renderScale: 1 },
	input: { sensitivity: 1, setSensitivity() {} }, player: { mode: 'walk', camMode: 'first' }, freeCam: false,
	fft: { local: { windSpeed: 7, windDirection: 25, fetch: 120 }, swell: { scale: 0.48 }, choppiness: uniform( 0.9 ) },
	shore: Object.fromEntries( [ 'amplitude', 'period', 'gamma', 'curl' ].map( ( key ) => [ key, uniform() ] ) ),
	post: { aaMode: 'none', scale: 1, params: Object.fromEntries( [ 'aoStrength', 'bloom', 'vignette', 'saturation', 'contrast', 'grain', 'sharpen' ].map( ( key ) => [ key, uniform() ] ) ) },
};
const oceanBefore = JSON.stringify( { fft: app.fft, shore: app.shore } );
new AppUI( app, ui );
const rainControl = controls.find( ( control ) => control.key === 'rain' );
const thunderControl = controls.find( ( control ) => control.key === 'thunderstorm' );
assert.ok( rainControl && thunderControl, 'Sky settings expose both weather switches' );
rainControl.choose( true );
thunderControl.choose( true );
assert.equal( weather.thunderstorm, true );
controls.find( ( control ) => control.key === 'clouds' ).choose( 0.23 );
controls.find( ( control ) => control.key === 'haze' ).choose( 0.72 );
rainControl.choose( false );
tick( 25 );
near( h.clouds.coverage.value, 0.23, 'UI cloud edits survive the weather override' );
near( h.haze.density.value, 0.72, 'UI haze edits survive the weather override' );
assert.equal( JSON.stringify( { fft: app.fft, shore: app.shore } ), oceanBefore, 'Weather switches preserve the chosen ocean state' );

console.log( 'Weather passed: clear/rain/thunderstorm, both cloud engines/no clouds, user preferences, delayed thunder, focus recovery, rain shelter/underwater, clean flash lighting and real UI callbacks.' );
