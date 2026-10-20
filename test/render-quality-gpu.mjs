// Native GPU checks and timings: real FFT ocean, boat, atmosphere/clouds, full PostFX and TAAU.
// Optional image/report directory: node test/render-quality-gpu.mjs /absolute/output/directory
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './smaa-shim.mjs';
import { makeOceanScene } from './ocean-scene.mjs';
import { writePNG } from './headless.mjs';
import { GPU } from '../src/engine/gpu/GPU.js';
import { G } from '../src/engine/render/Frame.js';
import { RenderTarget } from '../src/engine/gpu/Texture.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { Atmosphere } from '../src/sky/Atmosphere.js';
import { Sky } from '../src/sky/Sky.js';
import { SkyProClouds } from '../src/sky/SkyProClouds.js';
import { Environment } from '../src/sky/Environment.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { Underwater } from '../src/post/Underwater.js';
import { PostFX } from '../src/post/PostFX.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { App } from '../src/App.js';

const out = process.argv[ 2 ] ? resolve( process.argv[ 2 ] ) : null;
if ( out ) mkdirSync( out, { recursive: true } );
const fallbackFetch = globalThis.fetch;
globalThis.fetch = ( url, options ) => String( url ).startsWith( '/clouds/' )
	? Promise.resolve( new Response( readFileSync( new URL( '../public' + url, import.meta.url ) ) ) ) : fallbackFetch( url, options );
let atmosphere, sky, clouds;
const W = 1280, H = 720;
const ocean = await makeOceanScene( { W, H, sky: { get module() { return sky.module; } }, clouds: { get module() { return clouds.module; } },
	extra: async () => {

		atmosphere = new Atmosphere(); sky = new Sky( atmosphere ); clouds = new SkyProClouds( null, atmosphere );
		clouds.outputSize = { x: W, y: H }; sky.clouds = clouds; await clouds.ready;

	} } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
const environment = new Environment( null, ocean.scene, sky );
ocean.sr.background = sky.background;
ocean.waterMaterial.hullMaskTexture = ocean.sr.hullMaskRT.texture;
ocean.waterMaterial.hullMaskActive = ocean.sr.hullMaskActive;
ocean.waterMaterial.uniformBlock.fields.hullActive = ocean.sr.hullMaskActive;
const boat = new OffshoreBoatModel(); ocean.scene.add( boat.group ); boat.group.rotation.y = 0.5;
ocean.camera.position.set( 12, 5, 14 ); ocean.camera.lookAt( 0, 1.8, 0 );
const query = new WaterQuery( null, ocean.surface );
const underwater = new Underwater( { depthTexture: ocean.sr.sceneRT.depthTexture, maskTexture: ocean.sr.waterMaskTexture, query, caustics: ocean.caustics, fft: ocean.fft } );
const post = new PostFX( { width: W, height: H }, { sceneRenderer: ocean.sr, camera: ocean.camera, underwater, clouds, sunDir: atmosphere.sunDir } );
const target = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ] } );
post.outputTexture = target.texture; post.outputSize = { width: W, height: H };
// Use the production scale setter: post and clouds must change together.
const app = { settings: { renderScale: 1 }, post, clouds };
ocean.before.push( ( dt ) => {

	atmosphere.sunDir.value.copy( G.sunDir.value ); atmosphere.update( dt, ocean.camera.position.y );
	clouds.update( dt, ocean.camera ); environment.update( dt ); query.setCamera( ocean.camera.position.x, ocean.camera.position.z ); query.update();

} );
const renderScene = ocean.sr.render.bind( ocean.sr );
ocean.sr.render = () => {

	post.beginFrame(); underwater.updateCamera( ocean.camera ); renderScene(); post.render(); post.endFrame();

};
const frame = async () => { ocean.frame(); await GPU.queue.onSubmittedWorkDone(); };
const rows = [];
for ( const [ name, scale ] of [ [ 'native', 1 ], [ 'smooth-75', 0.75 ], [ 'balanced-floor', 0.65 ], [ 'photo-native', 1 ], [ 'restored-75', 0.75 ] ] ) {

	App.prototype.setRenderScale.call( app, scale );
	await frame();
	assert.equal( post.taau.uniforms.fields.reset.value, 1, 'A changed input size resets temporal history' );
	assert.equal( ocean.sr.width, Math.round( W * scale ) ); assert.equal( ocean.sr.height, Math.round( H * scale ) );
	assert.equal( post.taau.texture.width, W ); assert.equal( post.taau.texture.height, H );
	const cloudPixels = clouds.sourceWidth * clouds.sourceHeight;
	for ( let i = 0; i < 23; i ++ ) await frame();
	assert.equal( post.taau.uniforms.fields.reset.value, 0, 'History resumes after the resize' );
	const runs = [];
	for ( let run = 0; run < 3; run ++ ) {

		const start = performance.now(); for ( let i = 0; i < 20; i ++ ) await frame();
		runs.push( ( performance.now() - start ) / 20 );

	}
	const image = await readTexture( target.texture );
	const pixels = new Uint8Array( image.data ); assert.equal( pixels.length, W * H * 4 );
	let lo = 255, hi = 0;
	for ( let i = 0; i < pixels.length; i += 4 ) { lo = Math.min( lo, pixels[ i ] ); hi = Math.max( hi, pixels[ i ] ); assert.equal( pixels[ i + 3 ], 255 ); }
	assert.ok( hi - lo > 80, 'The scaled scene contains visible lighting and geometry' );
	if ( out ) writePNG( resolve( out, name + '.png' ), W, H, pixels );
	const medianMs = [ ...runs ].sort( ( a, b ) => a - b )[ 1 ];
	rows.push( { name, scale, input: [ ocean.sr.width, ocean.sr.height ], output: [ W, H ], cloudPixels, medianMs, runs } );
	console.log( name, medianMs.toFixed( 2 ), 'ms/frame' );

}
assert.deepEqual( errors, [] );
assert.ok( rows[ 1 ].cloudPixels < rows[ 0 ].cloudPixels );
assert.ok( rows[ 2 ].cloudPixels < rows[ 1 ].cloudPixels );
assert.equal( rows[ 3 ].cloudPixels, rows[ 0 ].cloudPixels );
const report = { scene: 'FFT ocean + offshore boat + atmosphere + volumetric clouds + caustics + PostFX/TAAU; fixed camera, 1280x720 output',
	measurement: 'Median of 3 x 20 frames after 24 warmup frames; one native GPU frame in flight; timings include CPU submission and queue completion and are not browser FPS.', rows, errors };
if ( out ) writeFileSync( resolve( out, 'gpu-verification.json' ), JSON.stringify( report, null, 2 ) );
console.log( 'Native graphics checks passed: five scale/photo transitions, full output size, scene/cloud targets, TAA resets, rendered images and no GPU errors.' );
process.exit( 0 );
