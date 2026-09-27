import assert from 'node:assert/strict';
import './headless.mjs';
import { GPU, Texture } from '../src/engine/webgpu.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { setShadowMap } from '../src/engine/render/wgsl/lighting.js';
import { FishPortrait } from '../src/game/FishPortrait.js';

// A real, small textured/skinned GLB exercises the same loader/shader as the incoming assets.
function fixture( animated = true, height = 0.3 ) {

	const chunks = [], views = [], accessors = [];
	let offset = 0;
	const view = ( bytes ) => {

		const data = Buffer.from( bytes.buffer, bytes.byteOffset, bytes.byteLength );
		const index = views.length;
		views.push( { buffer: 0, byteOffset: offset, byteLength: data.length } );
		chunks.push( data, Buffer.alloc( ( 4 - data.length % 4 ) % 4 ) );
		offset += Math.ceil( data.length / 4 ) * 4;
		return index;

	};
	const attr = ( bytes, type, componentType, count ) => {

		accessors.push( { bufferView: view( bytes ), componentType, count, type } );
		return accessors.length - 1;

	};
	const attributes = {
		POSITION: attr( new Float32Array( [ 0, - height / 2, - 0.5, 0, height / 2, 0, 0, - height / 2, 0.5 ] ), 'VEC3', 5126, 3 ),
		NORMAL: attr( new Float32Array( [ 1, 0, 0, 1, 0, 0, 1, 0, 0 ] ), 'VEC3', 5126, 3 ),
		TEXCOORD_0: attr( new Float32Array( [ 0, 0, 0.5, 1, 1, 0 ] ), 'VEC2', 5126, 3 ),
		JOINTS_0: attr( new Uint16Array( 12 ), 'VEC4', 5123, 3 ),
		WEIGHTS_0: attr( new Float32Array( [ 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0 ] ), 'VEC4', 5126, 3 ),
	};
	const input = attr( new Float32Array( [ 0, 1, 2 ] ), 'SCALAR', 5126, 3 );
	const output = attr( new Float32Array( [ 0, 0, 0, 1, 0, 0.08, 0, Math.sqrt( 1 - 0.08 ** 2 ), 0, 0, 0, 1 ] ), 'VEC4', 5126, 3 );
	const images = [ 1, 2, 3 ].map( ( value ) => ( { bufferView: view( new Uint8Array( [ value ] ) ), mimeType: 'image/png' } ) );
	const bin = Buffer.concat( chunks );
	const json = {
		asset: { version: '2.0' }, scene: 0, scenes: [ { nodes: [ 0, 1 ] } ],
		nodes: [ { name: 'root' }, { mesh: 0, skin: 0 } ],
		meshes: [ { primitives: [ { attributes, material: 0 } ] } ], skins: [ { joints: [ 0 ] } ],
		animations: animated ? [ { name: 'idle', samplers: [ { input, output, interpolation: 'LINEAR' } ], channels: [ { sampler: 0, target: { node: 0, path: 'rotation' } } ] } ] : [],
		buffers: [ { byteLength: bin.length } ], bufferViews: views, accessors, images,
		textures: images.map( ( _, source ) => ( { source } ) ),
		materials: [ { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [ 0.8, 0.9, 1, 1 ], metallicRoughnessTexture: { index: 2 }, metallicFactor: 0.2, roughnessFactor: 0.6 }, normalTexture: { index: 1 }, alphaMode: 'OPAQUE' } ],
	};
	let text = Buffer.from( JSON.stringify( json ) );
	text = Buffer.concat( [ text, Buffer.alloc( ( 4 - text.length % 4 ) % 4, 32 ) ] );
	const glb = Buffer.alloc( 12 + 8 + text.length + 8 + bin.length );
	glb.writeUInt32LE( 0x46546c67, 0 ); glb.writeUInt32LE( 2, 4 ); glb.writeUInt32LE( glb.length, 8 );
	glb.writeUInt32LE( text.length, 12 ); glb.writeUInt32LE( 0x4e4f534a, 16 ); text.copy( glb, 20 );
	glb.writeUInt32LE( bin.length, 20 + text.length ); glb.writeUInt32LE( 0x004e4942, 24 + text.length ); bin.copy( glb, 28 + text.length );
	return glb.buffer.slice( glb.byteOffset, glb.byteOffset + glb.byteLength );

}

await GPU.init( { headless: true } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
setShadowMap( new Texture( { width: 1, height: 1, depth: 1, dimension: '2d-array', format: 'depth32float', usage: [ 'sample', 'render' ] } ) );
const calls = [], gates = new Map();
globalThis.__assetFile = ( url ) => {

	calls.push( url );
	return new Promise( ( resolve, reject ) => gates.set( url.split( '/' ).pop(), { resolve, reject } ) );

};
globalThis.__assetImage = ( bytes ) => ( { width: 1, height: 1, data: new Uint8Array( bytes[ 0 ] === 1 ? [ 80, 145, 190, 255 ] : bytes[ 0 ] === 2 ? [ 128, 128, 255, 255 ] : [ 255, 180, 20, 255 ] ) } );
const portrait = new FishPortrait();
const W = 480, H = 200; // actual catch-card aspect ratio; tall fins must fit vertically
const target = portrait._target( 'fixture', W * 2, H * 2 );
const rgba = new Texture( { width: W, height: H, format: 'rgba8unorm', usage: [ 'render', 'copySrc' ] } );
const tone = portrait._pass( 'rgba8unorm', () => target.hdr );

assert.equal( await portrait.realFish.load( 'parrot' ), null );
assert.equal( calls.length, 0 );
portrait.show( 'grunt', 0.4 );
const gruntLoad = portrait.realFish.load( 'grunt' );
assert.equal( gruntLoad, portrait.realFish.load( 'grunt' ) );
portrait._place( 'grunt', 0.4 );
assert.equal( portrait.realShown, null );
assert.equal( portrait.mesh.visible, true );

// A slow response for the previous card cannot replace the new species.
portrait.show( 'yellowtail', 1 );
const yellowtailLoad = portrait.realFish.load( 'yellowtail' );
gates.get( 'grunt.glb' ).resolve( fixture( true, 0.78 ) );
const grunt = await gruntLoad;
assert.equal( grunt.group.visible, false );
assert.equal( grunt.group.parent, null );
portrait._place( 'yellowtail', 1 );
assert.equal( portrait.realShown, null );

// Finishing after close only populates the cache; it must not add/show a mesh.
portrait.detach();
gates.get( 'yellowtail.glb' ).resolve( fixture( false ) );
const yellowtail = await yellowtailLoad;
assert.equal( portrait.live, null );
assert.equal( yellowtail.group.visible, false );
assert.equal( yellowtail.group.parent, null );
assert.equal( yellowtail.current, null );

portrait.show( 'grunt', 0.4 );
for ( let i = 0; i < 3; i ++ ) {

	GPU.beginFrame();
	const length = portrait._place( 'grunt', 0.4 );
	assert.equal( portrait.realShown, grunt );
	assert.equal( portrait.mesh.visible, false );
	assert.equal( grunt.group.visible, true );
	assert.ok( Math.abs( grunt.group.scale.z - length ) < 1e-6 );
	assert.ok( Math.abs( grunt.group.position.y ) < 1e-6 );
	grunt.update( 0.1 );
	portrait._frame( length, target.w, target.h );
	portrait._draw( target );
	tone.render( { colorViews: [ rgba.view() ], clear: [ 0, 0, 0, 0 ] } );
	GPU.submit();
	await GPU.pipelinesReady();

}
assert.equal( grunt.current, 'idle' );
assert.ok( grunt.layers[ 0 ].time > 0 );
const pixels = new Uint8Array( ( await readTexture( rgba ) ).data );
let covered = 0;
for ( let i = 3; i < pixels.length; i += 4 ) if ( pixels[ i ] > 0 ) covered ++;
assert.ok( covered > 1000, 'Textured GLB must actually render under STUDIO_LIGHTING' );
for ( let x = 0; x < W; x ++ ) {

	assert.equal( pixels[ x * 4 + 3 ], 0, 'Tall fish must not clip the top of a 2.4:1 card' );
	assert.equal( pixels[ ( ( H - 1 ) * W + x ) * 4 + 3 ], 0, 'Tall fish must not clip the bottom of a 2.4:1 card' );

}

portrait.detach();
assert.equal( grunt.group.visible, false );
portrait._place( 'grunt', 0.4 );
assert.equal( portrait.realShown, null, 'thumbnail keeps the original fish' );
assert.equal( portrait.mesh.visible, true );
portrait.show( 'tuna', 8 );
const fail = portrait.realFish.load( 'tuna' );
gates.get( 'tuna.glb' ).reject( new Error( 'intentional unavailable asset' ) );
const warnings = [], warn = console.warn;
console.warn = ( ...args ) => warnings.push( args );
try {

	assert.equal( await fail, null );
	assert.equal( warnings.length, 1 );
	assert.match( warnings[ 0 ][ 0 ], /keeping the original tuna/ );

} finally {

	console.warn = warn;

}
portrait.show( 'tuna', 8 );
portrait._place( 'tuna', 8 );
assert.equal( portrait.realShown, null );
assert.equal( portrait.mesh.visible, true );
assert.equal( calls.length, 3, 'one request per supported species including failures' );
await GPU.queue.onSubmittedWorkDone();
assert.deepEqual( errors, [] );
console.log( 'PASS: GLB PBR studio rendering, optional idle, scale/pose, 2.4:1 tall-fish framing, fallback, request dedup, delayed switch/close, original thumbnails.', { covered } );
process.exit( 0 );
