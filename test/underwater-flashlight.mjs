// Exercise real packed torch uniforms without a browser, wave simulation or GPU.
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../src/engine/index.js';
import { G } from '../src/core/Globals.js';
import { FLASH, LocalLights, localLightsModule } from '../src/materials/LocalLights.js';

const lights = new LocalLights(), camera = new PerspectiveCamera();
const fields = localLightsModule.bindings.localLights.uniform.fields;
const original = { night: G.night.value, water: G.cameraWaterHeight.value };
const absorption = G.waterAbsorption.value.clone(), scattering = G.waterScattering.value.clone();
const near = ( actual, expected, message ) => assert.ok( Math.abs( actual - expected ) < 1e-8, `${ message }: ${ actual } vs ${ expected }` );
const sample = ( depth, night = 0, water = 0 ) => {

	G.night.value = night;
	// The app writes its camera wave-query result here before updating local lights.
	G.cameraWaterHeight.value = water;
	camera.position.y = water - depth;
	lights.update( camera, 1 / 60 );
	if ( FLASH.on.value ) {

		const packed = fields.col.value[ 0 ];
		near( packed.x, FLASH.col.value.x, 'Surface lighting and underwater beam use the same torch strength' );
		near( packed.y, FLASH.col.value.y, 'Green channel stays in sync' );
		near( packed.z, FLASH.col.value.z, 'Blue channel stays in sync' );

	}
	return FLASH.col.value.x;

};

try {

	lights.toggleFlashlight( true );
	near( sample( - 12 ), 55 * 0.08, 'Daylight on land retains its original strength' );
	near( sample( 0 ), 55 * 0.08, 'At the water surface the torch stays unchanged' );
	near( sample( 0.35 ), 55 * 0.08, 'A shallow wave cannot abruptly boost the torch' );
	near( sample( 3 ), 55, 'Three metres below water restores the existing full strength' );
	near( sample( 22 ), 55, 'The deep-sea scene is lit at full strength in daytime' );
	near( sample( 3, 0, 2.25 ), 55, 'Depth follows the sampled wave height rather than fixed sea level' );
	let previous = sample( 0 );
	for ( let depth = 0.05; depth <= 3.05; depth += 0.05 ) {

		const current = sample( depth );
		assert.ok( current >= previous && current - previous < 1.5, 'The water transition is continuous and gradual' );
		previous = current;

	}
	near( sample( 0.35 - 1e-6 ), sample( 0.35 + 1e-6 ), 'Entry transition has no brightness jump' );
	near( sample( 3 - 1e-6 ), sample( 3 + 1e-6 ), 'Full-strength transition has no brightness jump' );
	for ( const depth of [ - 12, 0, 1.5, 3, 22 ] ) near( sample( depth, 1 ), 55, 'Nighttime strength stays unchanged at every depth' );
	near( sample( - 1, 0.3 ), 55 * ( 0.08 + 0.92 * 0.5 ), 'Dusk on land retains its previous response' );
	lights.toggleFlashlight( false ); sample( 22 );
	assert.equal( FLASH.on.value, 0, 'Off disables beam and snow lighting' );
	assert.equal( lights.active, 0, 'Off removes the torch from packed surface lights' );
	lights.toggleFlashlight( true ); lights.enabled = false; sample( 22 );
	assert.equal( FLASH.on.value, 0, 'Disabled local lights disable the underwater torch' );
	assert.equal( lights.active, 0, 'Disabled local lights pack no torch' );
	lights.enabled = true; near( sample( 22 ), 55, 'Re-enabling restores the same full torch' );
	assert.ok( G.waterAbsorption.value.equals( absorption ) && G.waterScattering.value.equals( scattering ), 'Water colour and fog coefficients remain unchanged' );
	console.log( 'Underwater flashlight passed: daylight depth blend, wave height, continuity, unchanged night/land, packed beam sync and off/disabled.' );

} finally {

	G.night.value = original.night;
	G.cameraWaterHeight.value = original.water;

}
