// Native WebGPU: compile and exercise both real hulls and sample their wake readers.
import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RenderTarget } from '../src/engine/gpu/Texture.js';
import { ShaderModule } from '../src/engine/gpu/Shader.js';
import { FullscreenPass } from '../src/engine/render/FullscreenPass.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { G } from '../src/engine/render/Frame.js';
import { Vector3 } from '../src/engine/index.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { WakeSim } from '../src/ocean/WakeSim.js';
import { BoatSpray } from '../src/player/BoatSpray.js';
import { addBoatLights } from '../src/materials/LocalLights.js';

await GPU.init( { headless: true } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', e => errors.push( e.error.message ) );
const terrainGPU = { module: new ShaderModule( { name: 'boatTestTerrain', code: 'fn terrainHeightAt( xz: vec2f ) -> f32 { return -30.0; }' } ) };

for ( const Model of [ BoatModel, OffshoreBoatModel ] ) {

	const model = new Model();
	const boat = { model, position: new Vector3(), velocity: new Vector3( 0, 0, 6 ), driven: true, throttle: 0.6, rpm: 0.7, forward: v => v.set( 0, 0, 1 ) };
	const wake = new WakeSim( null, { terrainGPU, boat } );
	for ( const { position: p } of model.hullSamples ) {

		assert.ok( Math.abs( p.x ) < wake.nearBox.TX1, 'near-field subtraction covers hull width' );
		assert.ok( p.z > wake.nearBox.TZ0 && p.z < wake.nearBox.TZ1, 'near-field subtraction covers hull length' );

	}
	assert.ok( wake.hullBox.X1 > model.dimensions.beam / 2, 'pressure texture covers both sides' );
	const spray = new BoatSpray( { boat, spray: { setBodyShape() {} } } );
	assert.ok( spray.contacts.every( c => Number.isFinite( c.length ) && c.length > 0 ), 'finite bow spray contacts' );
	assert.ok( spray.shape.halfBeam >= model.dimensions.beam / 2 - 0.02, 'spray collision follows enlarged hull' );
	const lights = addBoatLights( { add: s => s }, model );
	assert.equal( lights.length, 6 );
	assert.ok( Math.abs( lights[ 2 ].position.x - 0.47 * model.visualScale.x ) < 1e-6, 'navigation light follows its mesh' );
	assert.ok( lights[ 5 ].position.z < model.lines.zAft, 'stern lamp stays behind transom' );
	for ( let i = 0; i < 90; i ++ ) {

		boat.position.addScaledVector( boat.velocity, 1 / 60 );
		G.time.value += 1 / 60;
		G.dt.value = 1 / 60;
		GPU.beginFrame();
		wake.update( 1 / 60 );
		GPU.submit();
		if ( i % 15 === 0 ) await GPU.queue.onSubmittedWorkDone();

	}
	const rt = new RenderTarget( 64, 64, { colors: [ 'rgba32float' ], label: 'boatWakeCheck' } );
	const pass = new FullscreenPass( { label: 'boat wake reader', modules: [ wake.module ], colorFormats: [ 'rgba32float' ], code: `
fn fragment( in: FSIn ) -> vec4f {
	let p = ( in.uv - 0.5 ) * 25.0;
	let w = wakeFragment( p );
	return vec4f( wakeHeight( p ), w.slopes, w.foam );
}` } );
	GPU.beginFrame();
	pass.render( { colorViews: [ rt.texture ] } );
	GPU.submit();
	const pixels = await readTexture( rt.texture );
	const floats = new Float32Array( pixels.data );
	assert.ok( floats.every( Number.isFinite ), 'wake contains no NaN/Infinity' );
	assert.ok( floats.some( x => Math.abs( x ) > 1e-6 ), 'moving boat produces a wake' );
	console.log( `${ model.profileId }: wake / spray / navigation lights passed` );

}

await GPU.queue.onSubmittedWorkDone();
await new Promise( resolve => setTimeout( resolve, 100 ) );
assert.deepEqual( errors, [], 'no WebGPU validation errors' );
console.log( 'boat wake GPU tests passed' );
process.exit( 0 );
