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
const home = beast.position.clone(), fixedRuins = beast.group.children[ 1 ];
const originalPositions = p.array;
beast.mesh.resetVelocity = false;
let minSpeed = Infinity, maxSpeed = 0, maxTravel = 0, minClearance = Infinity, highestPoint = - Infinity;
// Fifteen simulated minutes cover several complete patrols and their seam.
// Check all deformed vertices against the actual bilinear island terrain at
// intervals, rather than checking only the root or a flat test floor.
for ( let frame = 0; frame < 9000; frame ++ ) {

	player.position.copy( beast.creaturePosition ).add( new Vector3( 0, 5, 22 ) ); camera.position.copy( player.position );
	const previous = beast.creaturePosition.clone(), yaw = beast.mesh.rotation.y, time = beast.time, wake = beast.wake;
	beast.update( 0.1, camera, player );
	if ( frame === 0 ) assert.equal( beast.mesh.resetVelocity, true, 'Re-entering visibility resets stale world velocity from the last distant draw' );
	const speed = beast.creaturePosition.distanceTo( previous ) / 0.1;
	if ( frame > 100 ) { minSpeed = Math.min( minSpeed, speed ); maxSpeed = Math.max( maxSpeed, speed ); }
	assert.ok( speed < 0.65, 'The whole creature glides without position jumps: ' + speed );
	assert.ok( Math.abs( beast.mesh.rotation.y - yaw ) / 0.1 < 0.03, 'Turns stay slow and continuous' );
	assert.equal( beast.material.uniforms.previousAge.value, time );
	assert.equal( beast.material.uniforms.previousWake.value, wake );
	const travel = Math.hypot( beast.creaturePosition.x - home.x, beast.creaturePosition.z - home.z );
	maxTravel = Math.max( maxTravel, travel );
	assert.ok( travel <= beast.patrolRadius, 'Patrol remains inside its explicit radius' );
	if ( frame % 150 !== 0 ) continue;
	const c = Math.cos( beast.mesh.rotation.y ), s = Math.sin( beast.mesh.rotation.y );
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const arm = a.getW( i );
		if ( arm < 1 ) {

			const breath = 1 + 0.008 * Math.sin( beast.time * 0.48 );
			x *= breath; y = y * breath + beast.wake * 0.28; z *= breath;

		} else {

			const id = Math.floor( arm ) - 1, t = ( arm % 1 ) / 0.9, angle = id * Math.PI / 4 + Math.PI / 8;
			const w = t * t * ( 0.15 + beast.wake * 0.85 ), wave = Math.sin( beast.time * 0.65 - t * 5 + id * 1.7 );
			x += Math.cos( angle ) * wave * 0.65 * w;
			y += ( Math.sin( beast.time * 0.48 - t * 4 + id ) * 0.35 + beast.wake * 0.65 ) * w * w;
			z -= Math.sin( angle ) * wave * 0.65 * w;

		}
		const wx = beast.creaturePosition.x + c * x + s * z, wy = beast.creaturePosition.y + y, wz = beast.creaturePosition.z - s * x + c * z;
		minClearance = Math.min( minClearance, wy - terrain.heightAt( wx, wz ) );
		highestPoint = Math.max( highestPoint, wy );

	}

}
assert.ok( maxTravel > 4.4, 'The creature actually leaves its starting point' );
assert.ok( minSpeed < 0.04 && maxSpeed > 0.2, 'Glides have visible slow pauses and acceleration' );
assert.ok( minClearance > 0.1, 'Animated arms never intersect the sloping seabed: ' + minClearance );
assert.ok( highestPoint < - 3, 'The entire moving creature stays safely underwater: ' + highestPoint );
assert.deepEqual( beast.group.position, home, 'The ruins stay anchored while the creature moves' );
assert.equal( beast.group.children[ 1 ], fixedRuins );
assert.equal( beast.mesh.geometry.attributes.position.array, originalPositions, 'Patrol never rebuilds or deforms source geometry on the CPU' );
assert.equal( messages.length, 1, 'Repeated patrol encounters do not repeat discovery' );
player.position.set( 55, 2.3, 40 ); camera.position.copy( player.position );
for ( let i = 0; i < 100; i ++ ) beast.update( 0.1, camera, player );
assert.ok( beast.wake < 0.01 && ! beast.group.visible, 'Patrolling retains sleep and distant culling' );
console.log( 'Patrol passed:', { minutes: 15, radius: beast.patrolRadius, maxTravel, minSpeed, maxSpeed, minClearance, highestPoint } );
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
const withScene = process.argv.includes( '--scene' );
if ( lux ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async ( url ) => {

		if ( url.endsWith( '/models/creatures/abyssal-elder.glb' ) ) return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );
		assert.ok( withScene && /\/models\/abyss\/(vent|arch|coral)\.glb$/.test( url ) );
		const prop = readFileSync( new URL( '../public/models/abyss/' + url.split( '/' ).pop(), import.meta.url ) );
		return prop.buffer.slice( prop.byteOffset, prop.byteOffset + prop.byteLength );

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
	L.camera.position.copy( preview.mesh.position ).add( lux ? new Vector3( 14, 10, 22 ) : new Vector3( 20, 13, 29 ) ); L.camera.lookAt( preview.mesh.position.clone().add( new Vector3( 0, 4, 0 ) ) );
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
	L.camera.position.copy( preview.creaturePosition ).add( new Vector3( 17, 11, 26 ) );
	L.camera.lookAt( preview.creaturePosition.clone().add( new Vector3( 0, 4, 0 ) ) );
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
	let environment = null, scenery = null;
	if ( withScene ) {

		const { AbyssScene } = await import( '../src/world/AbyssScene.js' );
		const { AbyssAssets } = await import( '../src/world/AbyssAssets.js' );
		environment = new AbyssScene( { scene: O.scene, terrain } );
		scenery = new AbyssAssets( { scene: O.scene, placements: environment.modelPlacements, terrain } );
		assert.deepEqual( await Promise.all( [ 'vent', 'arch', 'coral' ].map( ( id ) => scenery.load( id ) ) ), [ true, true, true ] );

	}
	O.scene.add( groundMesh( terrain, preview.position.x, preview.position.z, 95 ) );
	O.camera.position.copy( preview.creaturePosition ).add( lux ? new Vector3( 4, 6, 11 ) : new Vector3( 10, 7, 19 ) );
	if ( withScene ) O.camera.position.copy( preview.creaturePosition ).add( new Vector3( 8, 9, 34 ) );
	O.camera.lookAt( preview.creaturePosition.clone().add( new Vector3( 0, 4, 0 ) ) );
	const lighting = installUnderwaterLighting( { fft: O.fft, caustics: O.caustics, surface: O.surface } );
	const lamps = new LocalLights(); lamps.toggleFlashlight( true );
	O.before.push( ( dt ) => { lighting.update( O.camera ); lamps.update( O.camera, dt ); preview.update( dt, O.camera, { position: O.camera.position } ); environment?.update( dt, O.camera ); scenery?.update( dt, O.camera ); } );
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
	const out = resolve( withScene ? '../abyss-scene' : lux ? '../deep-beast-lux3d' : '../deep-beast' ); mkdirSync( out, { recursive: true } );
	writePNG( out + '/underwater.png', W, H, new Uint8Array( img.data ) );
	assert.deepEqual( errors, [], 'Actual FFT, caustics, water lighting, flashlight and underwater composite compile together' );
	console.log( 'Underwater preview:', out + '/underwater.png' );
	process.exit( 0 );

}
