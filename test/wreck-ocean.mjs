// Optional native renderer inspection with the actual ocean and underwater passes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './smaa-shim.mjs';
import { makeOceanScene } from './ocean-scene.mjs';
import { groundMesh } from './life-harness.mjs';
import { writePNG } from './headless.mjs';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RenderTarget } from '../src/engine/gpu/Texture.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { ShaderModule } from '../src/engine/gpu/Shader.js';
import { FullscreenPass } from '../src/engine/render/FullscreenPass.js';
import { setFrameCamera } from '../src/engine/render/Frame.js';
import { Vector3 } from '../src/engine/index.js';
import { installUnderwaterLighting } from '../src/ocean/UnderwaterLighting.js';
import { Underwater } from '../src/post/Underwater.js';
import { LocalLights } from '../src/materials/LocalLights.js';
import { WreckScene } from '../src/world/WreckScene.js';
import { TerrainData } from '../src/world/TerrainData.js';

globalThis.__assetFile = async ( url ) => {

	const bytes = readFileSync( new URL( '../public/models/expedition/' + url.split( '/' ).pop(), import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};
const W = 1440, H = 900, terrain = new TerrainData();
const O = await makeOceanScene( { W, H, terrain: false, floor: false } );
const errors = []; GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
const world = new WreckScene( { scene: O.scene, terrain } );
O.scene.add( groundMesh( terrain, - 60, 217, 100 ) );
assert.deepEqual( await Promise.all( world.assets.ids.map( ( id ) => world.assets.load( id ) ) ), [ true, true, true ] );
const lighting = installUnderwaterLighting( { fft: O.fft, caustics: O.caustics, surface: O.surface } );
const lamps = new LocalLights(); lamps.toggleFlashlight( true );
O.before.push( ( dt ) => { lighting.update( O.camera ); lamps.update( O.camera, dt ); world.update( dt, O.camera ); } );
const query = { module: new ShaderModule( { name: 'wreck-preview-water', code: 'fn waterQueryCameraState() -> vec4f { return vec4f( 0.0 ); } fn waterQueryHeightAtXZ( xz: vec2f ) -> f32 { return 0.0; }' } ) };
const uw = new Underwater( { depthTexture: O.sr.sceneRT.depthTexture, maskTexture: O.sr.waterMaskTexture, query, caustics: O.caustics, fft: O.fft } );
uw.setSize( W, H );
const medium = new RenderTarget( W, H, { colors: [ 'r8unorm' ] } ); uw.mediumTexture = medium.texture;
const ldr = new RenderTarget( W, H, { colors: [ 'rgba8unorm' ] } );
const mediumPass = new FullscreenPass( { colorFormats: [ 'r8unorm' ], modules: [ uw.module ], code: 'fn fragment( in: FSIn ) -> vec4f { return vec4f( underwaterMedium( in.uv ), 0.0, 0.0, 1.0 ); }' } );
const composite = new FullscreenPass( { colorFormats: [ 'rgba8unorm' ], modules: [ uw.compositeModule ], bindings: { sceneHDR: { texture: () => O.sr.sceneRT.texture } }, code: `
fn postSceneSample( uv: vec2f ) -> vec3f { return textureSampleLevel( sceneHDR, smpLinearClamp, uv, 0.0 ).rgb; }
fn fragment( in: FSIn ) -> vec4f {
	let c = underwaterComposite( in.uv, in.pos.xy ).rgb * 0.75;
	let t = ( c * ( 2.51 * c + 0.03 ) ) / ( c * ( 2.43 * c + 0.59 ) + 0.14 );
	return vec4f( linearToSrgb( clamp( t, vec3f( 0.0 ), vec3f( 1.0 ) ) ), 1.0 );
}` } );
for ( const [ name, from, target ] of [
	[ 'wreck-underwater', world.position.clone().add( new Vector3( 6, 4, - 6 ) ), world.position.clone().add( new Vector3( 0, 1.5, 0 ) ) ],
	[ 'cave-underwater', world.cavePosition.clone().add( new Vector3( 0, 2.4, - 15 ) ), world.cavePosition.clone().add( new Vector3( 0, 2.4, 4 ) ) ],
] ) {

	O.camera.position.copy( from ); O.camera.lookAt( target );
	for ( let i = 0; i < 20; i ++ ) { O.frame(); await GPU.queue.onSubmittedWorkDone(); }
	GPU.beginFrame(); setFrameCamera( O.camera, W, H ); uw.updateCamera( O.camera );
	mediumPass.render( { colorViews: [ medium.texture ] } ); uw.renderShafts( true );
	composite.render( { colorViews: [ ldr.texture ] } ); GPU.submit();
	const data = await readTexture( ldr.texture );
	writePNG( resolve( '../wreck-expedition/' + name + '.png' ), W, H, new Uint8Array( data.data ) );

}
assert.deepEqual( errors, [], 'Actual FFT water, caustics, flashlight and underwater composite compile with the three new models' );
console.log( 'Native wreck ocean passed: two views through actual underwater composite, caustics and flashlight.' );
process.exit( 0 );
