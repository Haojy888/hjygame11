import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { DeepBeast, retargetDeepBeast } from '../src/world/DeepBeast.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { readFileSync } from 'node:fs';
import { WORLD } from '../src/world/WorldLayout.js';
import { mapPoint, mapLocations } from '../src/game/WorldMap.js';

const terrain = new TerrainData();
const scene = new Scene();
const camera = new PerspectiveCamera();
const messages = [];
const beast = new DeepBeast( { scene, terrain, onDiscover: ( text ) => messages.push( text ) } );
const g = beast.model.geometry, p = g.attributes.position, a = g.attributes.aux;
const triangles = g.index.count / 3;
assert.equal( beast.model.arms.length, 8 );
assert.equal( beast.model.suckerCount, 256 );
assert.ok( triangles < 85000, 'One encounter stays within a real-time mesh budget' );
assert.ok( beast.position.y < - 18, 'The actual island seabed is deep enough' );
assert.ok( beast.position.y + g.boundingBox.max.y < - 3, 'The creature stays below the sea surface' );
assert.ok( g.boundingBox.max.x - g.boundingBox.min.x > 22, 'Its span is larger than the offshore boat' );
const armIds = new Set();
let submerged = 0, buried = 0;
for ( let i = 0; i < p.count; i ++ ) {

	for ( const attribute of [ p, g.attributes.normal, a ] ) for ( let k = 0; k < attribute.itemSize; k ++ ) assert.ok( Number.isFinite( attribute.array[ i * attribute.itemSize + k ] ), 'Finite geometry and shader inputs' );
	const arm = a.getW( i );
	if ( arm >= 1 ) armIds.add( Math.floor( arm ) );
	const y = p.getY( i ) + beast.position.y;
	if ( y < - 3 ) submerged ++;
	if ( y < terrain.heightAt( p.getX( i ) + beast.position.x, p.getZ( i ) + beast.position.z ) - 0.25 ) buried ++;

}
assert.equal( submerged, p.count );
assert.deepEqual( [ ...armIds ].sort(), [ 1, 2, 3, 4, 5, 6, 7, 8 ] );
assert.ok( buried / p.count < 0.03, 'Arms follow the sloping real seabed instead of disappearing inside it: ' + buried / p.count );
for ( const index of g.index.array ) assert.ok( index >= 0 && index < p.count );
const player = { position: beast.position.clone().add( new Vector3( 0, 5, 25 ) ) };
camera.position.copy( player.position );
for ( let i = 0; i < 180; i ++ ) beast.update( 1 / 60, camera, player );
assert.ok( beast.wake > 0.98 );
assert.equal( messages.length, 1, 'Discovery is announced once, without frame spam' );
assert.equal( beast.group.visible, true );
assert.ok( messages[ 0 ].includes( '沉睡古神' ) );
player.position.set( 55, 2.3, 40 ); camera.position.copy( player.position );
for ( let i = 0; i < 240; i ++ ) beast.update( 1 / 60, camera, player );
assert.ok( beast.wake < 0.01, 'Returns to sleep when the player leaves' );
assert.equal( beast.group.visible, false, 'Harbor and distant cameras draw no creature' );
const age = beast.time;
for ( const dt of [ NaN, Infinity, - 1 ] ) beast.update( dt, camera, player );
assert.equal( beast.time, age, 'Invalid elapsed time cannot poison the shader' );
assert.equal( mapPoint( WORLD.abyss.center ).edge, false );
const game = { state: { isGroundUnlocked: () => false }, app: { player } };
assert.ok( ! mapLocations( game ).some( ( p ) => p.id === 'abyss' ) );
game.state.isGroundUnlocked = () => true;
assert.equal( mapLocations( game ).find( ( p ) => p.id === 'abyss' ).x, WORLD.abyss.center.x );
const bytes = readFileSync( new URL( '../public/models/creatures/abyssal-elder.glb', import.meta.url ) );
const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
const realistic = retargetDeepBeast( gltf, g );
assert.equal( realistic.index.count, g.index.count, 'Material transfer preserves all original triangles' );
const sourceIds = gltf.meshes[ 0 ][ 0 ].attributes._SOURCE.array;
for ( let i = 0; i < sourceIds.length; i ++ ) {

	const source = sourceIds[ i ];
	assert.equal( realistic.attributes.position.getY( i ), p.getY( source ), 'UV seams retain exact real seabed adaptation' );
	assert.equal( realistic.attributes.aux.getW( i ), a.getW( source ), 'Arm and sucker vertices retain the original motion weights' );
	assert.equal( realistic.attributes.aux.getZ( i ), a.getZ( source ), 'Eye and scar regions retain their material identity' );

}
assert.equal( gltf.images.length, 2 );
assert.ok( gltf.images.every( ( image ) => image.bytes.length > 10000 ), 'Real embedded albedo and roughness maps are present' );
const savedId = sourceIds[ 0 ]; sourceIds[ 0 ] = - 1;
assert.throws( () => retargetDeepBeast( gltf, g ), /source vertex ID/ ); sourceIds[ 0 ] = savedId;
let failedRequests = 0;
globalThis.__assetFile = async () => { failedRequests ++; throw new Error( 'simulated unavailable creature asset' ); };
const warn = console.warn; console.warn = () => {};
try {

	const pending = beast.loadRealistic();
	assert.equal( beast.loadRealistic(), pending, 'Repeated encounters share a single load attempt' );
	assert.equal( await pending, false );
	assert.equal( beast.mesh.geometry, g, 'Offline asset loading keeps the animated original mesh' );
	assert.equal( beast.realistic, false );
	assert.equal( failedRequests, 1 );

} finally { console.warn = warn; delete globalThis.__assetFile; }
console.log( 'Deep beast passed: eight arms, 256 suckers, finite mesh, real seabed, underwater clearance, map, wake/sleep, discovery and culling.', { triangles, vertices: p.count, depth: - beast.position.y, buried } );

const lux = process.argv.includes( '--lux' );
if ( lux ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async ( url ) => {

		assert.ok( url.endsWith( '/models/creatures/abyssal-elder.glb' ) );
		return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

	};

}

if ( process.argv.includes( '--render' ) ) {

	const { setupLife } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const L = await setupLife( { W: 1600, H: 1000, ground: null } );
	const errors = [];
	GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
	const { mkdirSync } = await import( 'node:fs' );
	const { resolve } = await import( 'node:path' );
	const out = resolve( lux ? '../deep-beast-lux3d' : '../deep-beast' ); mkdirSync( out, { recursive: true } );
	const preview = new DeepBeast( { scene: L.scene, terrain } );
	if ( lux ) {

		const pending = preview.loadRealistic();
		assert.equal( preview.loadRealistic(), pending ); assert.equal( await pending, true );
		assert.equal( preview.material.vertexColors, false, 'The generated texture is not multiplied by fallback vertex colors' );
		assert.equal( preview.material.bindings.beastAlbedo.texture.format, 'rgba8unorm-srgb' );
		assert.equal( preview.material.bindings.beastOrm.texture.format, 'rgba8unorm' );

	}
	// Origin studio first; then the real seabed, keeping all engine material/shadow passes.
	preview.group.position.set( 0, 0, 0 );
	L.sky = [ 0.008, 0.026, 0.035, 1 ];
	L.camera.position.copy( lux ? new Vector3( 14, 10, 22 ) : new Vector3( 20, 13, 29 ) ); L.camera.lookAt( 0, 4, 0 );
	if ( lux ) preview.group.children[ 1 ].visible = false;
	preview.material.uniforms.wake.value = 0.8;
	await L.run( 3 );
	preview.material.uniforms.previousAge.value = 1;
	preview.material.uniforms.age.value = 2;
	preview.material.uniforms.previousWake.value = 0.8;
	await L.run( 1 );
	const { readTexture } = await import( '../src/engine/gpu/Readback.js' );
	const velocity = new Uint16Array( ( await readTexture( L.rt.textures[ 1 ] ) ).data );
	let movingPixels = 0;
	for ( let i = 0; i < velocity.length; i += 4 ) if ( ( velocity[ i ] & 0x7fff ) > 0 || ( velocity[ i + 1 ] & 0x7fff ) > 0 ) movingPixels ++;
	assert.ok( movingPixels > 100, 'A stationary camera still receives the creatures own motion vectors, preventing TAA ghost trails' );
	await L.save( out + '/studio.png' );
	preview.group.children[ 1 ].visible = true;
	preview.group.position.copy( preview.position );
	const { groundMesh } = await import( './life-harness.mjs' );
	L.scene.add( groundMesh( terrain, preview.position.x, preview.position.z, 95, 1 ) );
	L.camera.position.copy( preview.position ).add( new Vector3( 17, 11, 26 ) );
	L.camera.lookAt( preview.position.clone().add( new Vector3( 0, 4, 0 ) ) );
	await L.run( 3, ( dt ) => preview.update( dt, L.camera, { position: L.camera.position } ) );
	await L.save( out + '/seabed.png' );
	assert.deepEqual( errors, [], 'Native WebGPU main/shadow shader compilation has no validation errors' );
	console.log( 'Native GPU draws:', L.mr.stats );
	await L.exit();

}

if ( process.argv.includes( '--ocean' ) ) {

	const { makeOceanScene } = await import( './ocean-scene.mjs' );
	const { groundMesh } = await import( './life-harness.mjs' );
	const { installUnderwaterLighting } = await import( '../src/ocean/UnderwaterLighting.js' );
	const { Underwater } = await import( '../src/post/Underwater.js' );
	const { LocalLights } = await import( '../src/materials/LocalLights.js' );
	const { ShaderModule } = await import( '../src/engine/gpu/Shader.js' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const { RenderTarget } = await import( '../src/engine/gpu/Texture.js' );
	const { readTexture } = await import( '../src/engine/gpu/Readback.js' );
	const { FullscreenPass } = await import( '../src/engine/render/FullscreenPass.js' );
	const { setFrameCamera } = await import( '../src/engine/render/Frame.js' );
	const { writePNG } = await import( './headless.mjs' );
	const { mkdirSync } = await import( 'node:fs' );
	const { resolve } = await import( 'node:path' );
	const W = 1440, H = 900;
	const O = await makeOceanScene( { W, H, terrain: false, floor: false } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
	const preview = new DeepBeast( { scene: O.scene, terrain } );
	if ( lux ) assert.equal( await preview.loadRealistic(), true );
	O.scene.add( groundMesh( terrain, preview.position.x, preview.position.z, 95 ) );
	O.camera.position.copy( preview.position ).add( lux ? new Vector3( 4, 6, 11 ) : new Vector3( 10, 7, 19 ) );
	O.camera.lookAt( preview.position.clone().add( new Vector3( 0, 4, 0 ) ) );
	const lighting = installUnderwaterLighting( { fft: O.fft, caustics: O.caustics, surface: O.surface } );
	const lamps = new LocalLights(); lamps.toggleFlashlight( true );
	O.before.push( ( dt ) => { lighting.update( O.camera ); lamps.update( O.camera, dt ); preview.update( dt, O.camera, { position: O.camera.position } ); } );
	const query = { module: new ShaderModule( { name: 'preview-flat-water-query', code: 'fn waterQueryCameraState() -> vec4f { return vec4f( 0.0 ); } fn waterQueryHeightAtXZ( xz: vec2f ) -> f32 { return 0.0; }' } ) };
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
	for ( let i = 0; i < 32; i ++ ) { O.frame(); await GPU.queue.onSubmittedWorkDone(); }
	GPU.beginFrame(); setFrameCamera( O.camera, W, H ); uw.updateCamera( O.camera );
	mediumPass.render( { colorViews: [ medium.texture ] } ); uw.renderShafts( true );
	composite.render( { colorViews: [ ldr.texture ] } ); GPU.submit();
	const img = await readTexture( ldr.texture );
	const out = resolve( lux ? '../deep-beast-lux3d' : '../deep-beast' ); mkdirSync( out, { recursive: true } );
	writePNG( out + '/underwater.png', W, H, new Uint8Array( img.data ) );
	assert.deepEqual( errors, [], 'Actual FFT, caustics, water lighting, flashlight and underwater composite compile together' );
	console.log( 'Underwater preview:', out + '/underwater.png' );
	process.exit( 0 );

}
