// Optional native renderer inspection with the actual ocean and underwater passes.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
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
import { Vector3, Group } from '../src/engine/index.js';
import { installUnderwaterLighting } from '../src/ocean/UnderwaterLighting.js';
import { Underwater } from '../src/post/Underwater.js';
import { LocalLights } from '../src/materials/LocalLights.js';
import { VoyageWorld } from '../src/world/VoyageWorld.js';
import { freshVoyage, RESTORATION_SITES } from '../src/game/Voyage.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';

globalThis.__assetFile = async ( url ) => {

	const bytes = readFileSync( new URL( '../public/models/voyage/' + url.split( '/' ).pop(), import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};
const W = 1440, H = 900, terrain = new TerrainData();
const restoration = process.argv.includes( '--restoration' );
const O = await makeOceanScene( { W, H, terrain: false, floor: false } );
const waterQuery = new WaterQuery( null, O.surface );
// Match the production constructor's mask inputs before the lazy shader build.
O.waterMaterial.hullMaskTexture = O.sr.hullMaskRT.texture;
O.waterMaterial.hullMaskActive = O.sr.hullMaskActive;
O.waterMaterial.uniformBlock.fields.hullActive = O.sr.hullMaskActive;
const errors = []; GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
const boat = { group: new Group(), visualScale: new Vector3( 1.35, 1, 1.6 ) }; O.scene.add( boat.group );
const state = { boatId: 'offshore', fieldPhotos: {} }, voyage = freshVoyage(); voyage.station = 4; voyage.event = { type: 'supply', site: 0, remaining: 600, accepted: true };
const world = new VoyageWorld( { scene: O.scene, terrainData: terrain, camera: O.camera, boat, gameState: state, query: waterQuery, sceneRenderer: O.sr } );
O.scene.add( groundMesh( terrain, 110, 260, 100 ) );
if ( ! restoration ) assert.deepEqual( await Promise.all( world.assets.ids.map( ( id ) => world.assets.load( id ) ) ), [ true, true, true, true ] );
if ( restoration ) { voyage.event = null; for ( const s of RESTORATION_SITES ) O.scene.add( groundMesh( terrain, s.x, s.z, 24, 0.5 ) ); }
const lighting = installUnderwaterLighting( { fft: O.fft, caustics: O.caustics, surface: O.surface } );
const lamps = new LocalLights(); lamps.toggleFlashlight( true );
O.before.push( ( dt ) => { lighting.update( O.camera ); lamps.update( O.camera, dt ); world.update( dt, voyage, state, 18 ); waterQuery.update(); } );
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
const views = restoration ? RESTORATION_SITES.flatMap( ( s ) => {

	const target = world.restoration.sites.get( s.id ).point;
	return [ false, true ].map( ( done ) => [ s.id + ( done ? '-after' : '-before' ), target.clone().add( new Vector3( 3.7, 2.1, - 4.3 ) ), target, done ] );

} ) : [
	[ 'observatory-ocean', new Vector3( 119, 5, 255 ), new Vector3( 110, 2.4, 270 ) ],
	[ 'tender-ocean', new Vector3( 123, 2, 155 ), new Vector3( 120, 0.4, 160 ) ],
	[ 'crew-ocean', new Vector3( 121.5, 1.6, 162.5 ), new Vector3( 120.18, 0.78, 160.12 ) ],
	[ 'bell-underwater', world.salvage.get( 'bell' ).point.clone().add( new Vector3( 1.5, 1.0, - 1.7 ) ), world.salvage.get( 'bell' ).point.clone().add( new Vector3( 0, 0.25, 0 ) ) ],
];
const out = resolve( restoration ? '../restoration' : '../voyage' ); mkdirSync( out, { recursive: true } );
for ( const [ name, from, target, done ] of views ) {

	if ( restoration ) voyage.restoration = { active: true, done: done ? RESTORATION_SITES.map( ( s ) => s.id ) : [], reported: false };
	O.camera.position.copy( from ); O.camera.lookAt( target );
	for ( let i = 0; i < 20; i ++ ) { O.frame(); await GPU.queue.onSubmittedWorkDone(); }
	if ( name === 'crew-ocean' ) { O.camera.position.y += world.eventSurfaceY; O.camera.lookAt( target.clone().add( new Vector3( 0, world.eventSurfaceY, 0 ) ) ); for ( let i = 0; i < 3; i ++ ) { O.frame(); await GPU.queue.onSubmittedWorkDone(); } }
	GPU.beginFrame(); setFrameCamera( O.camera, W, H ); uw.updateCamera( O.camera );
	mediumPass.render( { colorViews: [ medium.texture ] } ); uw.renderShafts( true );
	composite.render( { colorViews: [ ldr.texture ] } ); GPU.submit();
	const data = await readTexture( ldr.texture );
	writePNG( resolve( out, name + '.png' ), W, H, new Uint8Array( data.data ) );
	console.log( 'Rendered', name );

}
assert.deepEqual( errors, [], 'Actual FFT water, hull mask, water queries, caustics, flashlight and underwater composite compile with voyage scenery' );
console.log( 'Native voyage ocean passed:', views.length, 'views through actual FFT water, hull mask, water queries, underwater composite, caustics and flashlight.' );
process.exit( 0 );
