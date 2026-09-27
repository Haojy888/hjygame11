// Explicit asset acceptance/render tool, not part of the synthetic npm test regression.
// node test/actual-real-fish-render.mjs <output-directory> [grunt yellowtail tuna] [--card]
// Blender must embed 8-bit, non-interlaced PNGs. Reuse the engine tests' PNG decoder.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { writePNG } from './headless.mjs';
import './smaa-shim.mjs';
import { GPU, Texture, FullscreenPass } from '../src/engine/webgpu.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { setShadowMap } from '../src/engine/render/wgsl/lighting.js';
import { FishPortrait } from '../src/game/FishPortrait.js';
import { FISH } from '../src/game/FishTable.js';

assert.ok( process.argv[ 2 ], 'Usage: node test/actual-real-fish-render.mjs <output-directory> [grunt yellowtail tuna]' );
const folder = resolve( process.argv[ 2 ] );
const requested = process.argv.slice( 3 ).filter( ( argument ) => argument !== '--card' );
const speciesIds = requested.length ? requested : [ 'grunt', 'yellowtail', 'tuna' ];
for ( const id of speciesIds ) assert.ok( [ 'grunt', 'yellowtail', 'tuna' ].includes( id ), 'Unsupported asset: ' + id );
mkdirSync( folder, { recursive: true } );
const decodePNG = globalThis.__assetImage;
const decoded = [];
globalThis.__assetImage = async ( bytes, mime ) => {

	const data = Buffer.from( bytes );
	assert.equal( mime, 'image/png', 'Asset inspection currently expects Blender PNG export' );
	assert.equal( data.subarray( 0, 8 ).toString( 'hex' ), '89504e470d0a1a0a' );
	assert.equal( data[ 24 ], 8, '8-bit PNG required' );
	assert.ok( [ 0, 2, 6 ].includes( data[ 25 ] ), 'Grayscale/RGB/RGBA PNG required' );
	assert.equal( data[ 28 ], 0, 'Non-interlaced PNG required' );
	// Some exporters include alignment bytes after IEND in the image bufferView.
	let end = 8, type = '';
	while ( end + 12 <= data.length ) {

		const length = data.readUInt32BE( end );
		type = data.toString( 'ascii', end + 4, end + 8 );
		end += length + 12;
		assert.ok( end <= data.length, 'Truncated embedded PNG' );
		if ( type === 'IEND' ) break;

	}
	assert.equal( type, 'IEND', 'Missing PNG end chunk' );
	const image = await decodePNG( data.subarray( 0, end ) );
	decoded.push( { width: image.width, height: image.height, mime } );
	return image;

};
globalThis.__assetFile = ( url ) => {

	const filename = String( url ).split( '/' ).pop();
	assert.ok( speciesIds.some( ( id ) => filename === id + '.glb' ) );
	const bytes = readFileSync( new URL( '../public/models/fish-realistic/' + filename, import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};

await GPU.init( { headless: true } );
const gpuErrors = [];
GPU.device.addEventListener( 'uncapturederror', ( event ) => gpuErrors.push( event.error.message ) );
setShadowMap( new Texture( { width: 1, height: 1, depth: 1, dimension: '2d-array', format: 'depth32float', usage: [ 'sample', 'render' ] } ) );
const card = process.argv.includes( '--card' );
const W = card ? 1200 : 1000, H = card ? 500 : 600;
const portrait = new FishPortrait();
const target = portrait._target( 'actual-fish', W * 2, H * 2 );
const rgba = new Texture( { width: W, height: H, format: 'rgba8unorm', usage: [ 'render', 'sample', 'copySrc' ] } );
const output = new Texture( { width: W, height: H, format: 'rgba8unorm', usage: [ 'render', 'copySrc' ] } );
const tone = portrait._pass( 'rgba8unorm', () => target.hdr );
const background = new FullscreenPass( {
	label: 'real fish review background', colorFormats: [ 'rgba8unorm' ], bindings: { fish: { texture: () => rgba } },
	code: `fn fragment( in: FSIn ) -> vec4f {
		let c = textureLoad( fish, vec2i( in.pos.xy ), 0 );
		let d = length( ( in.uv - vec2f( 0.5, 0.46 ) ) * vec2f( 1.0, 0.8 ) );
		let bg = mix( vec3f( 0.17, 0.21, 0.25 ), vec3f( 0.075, 0.105, 0.13 ), smoothstep( 0.0, 0.7, d ) );
		return vec4f( c.rgb + bg * ( 1.0 - c.a ), 1.0 );
	}`,
} );
const manifest = [];
for ( const species of speciesIds ) {

	GPU.device.pushErrorScope( 'validation' );
	const imageStart = decoded.length;
	const kg = FISH[ species ].kg[ 0 ] * 0.4 + FISH[ species ].kg[ 1 ] * 0.6;
	portrait.show( species, kg );
	const model = await portrait.realFish.load( species );
	assert.ok( model, species + ' did not load (procedural fallback is not accepted by this tool)' );
	model.update( 0 );
	const bounds = skinnedBounds( model );
	assert.ok( Math.abs( bounds.size[ 2 ] - 1 ) < 0.03, species + ' must be 1 unit long along +Z: ' + JSON.stringify( bounds ) );
	assert.ok( Math.abs( bounds.center[ 2 ] ) < 0.03, species + ' must be centered around z=0' );
	const restJoints = model.jointData.slice( 0, model.joints * 16 );
	model.update( 0.25 );
	const animated = restJoints.some( ( value, i ) => Math.abs( value - model.jointData[ i ] ) > 1e-5 );
	if ( model.clips.has( 'idle' ) ) assert.ok( animated, species + ' idle clip did not change the bone pose' );
	const materials = model.materials.map( ( material ) => ( {
		name: material.name, albedo: !! material.bindings.chAlbedo, normal: !! material.bindings.chNormal,
		orm: !! material.bindings.chOrm, roughness: material.roughness, metalness: material.metalness,
	} ) );
	assert.ok( materials.some( ( material ) => material.albedo ), species + ' has no base color texture' );
	const entry = { species, name: FISH[ species ].name, kg, bounds, width: W, height: H, joints: model.joints, clips: model.clipNames(), animated, materials, images: decoded.slice( imageStart ), views: [] };
	for ( const [ view, yaw, time ] of [ [ 'side', 0, 0 ], [ 'three-quarter', - 0.58, 0 ], [ 'side-tail', 0, 0.5 ] ] ) {

		for ( const layer of model.layers ) layer.time = time;
		model.update( 0 );

		for ( let frame = 0; frame < 3; frame ++ ) {

			GPU.beginFrame();
			const length = portrait._place( species, kg, { yaw, pitch: 0, curl: 0, jaw: 0.1 } );
			assert.equal( portrait.realShown, model );
			entry.length = length;
			portrait.light.sweep = 0.4;
			portrait._frame( length, target.w, target.h, 0.80 );
			portrait._draw( target );
			tone.render( { colorViews: [ rgba.view() ], clear: [ 0, 0, 0, 0 ] } );
			background.render( { colorViews: [ output.view() ], clear: [ 0, 0, 0, 1 ] } );
			GPU.submit();
			await GPU.pipelinesReady();

		}
		const image = await readTexture( output );
		const pixels = new Uint8Array( ( await readTexture( rgba ) ).data );
		const coverage = silhouette( pixels, W, H );
		assert.ok( coverage.count > 3000, species + ' produced an empty/too-small portrait' );
		assert.ok( coverage.min[ 0 ] > 0 && coverage.min[ 1 ] > 0 && coverage.max[ 0 ] < W - 1 && coverage.max[ 1 ] < H - 1, species + ' is cropped by the portrait frame' );
		const path = join( folder, species + '-' + view + '.png' );
		writePNG( path, W, H, new Uint8Array( image.data ) );
		entry.views.push( { view, yaw, time, path, coverage, stats: { ...portrait.renderer.stats } } );
		console.log( species, view, 'triangles', portrait.renderer.stats.triangles, 'coverage', coverage.count );

	}
	await GPU.queue.onSubmittedWorkDone();
	const error = await GPU.device.popErrorScope();
	assert.equal( error, null, species + ': ' + error?.message );
	manifest.push( entry );
	writeFileSync( join( folder, 'manifest.json' ), JSON.stringify( { gpuErrors, fish: manifest }, null, 2 ) + '\n' );

}
assert.deepEqual( gpuErrors, [] );
console.log( 'PASS: actual GLB textures, normalized bounds, idle animation, both portrait views, no GPU validation errors.' );
process.exit( 0 );

function silhouette( pixels, width, height ) {

	const min = [ width, height ], max = [ - 1, - 1 ];
	let count = 0;
	for ( let i = 3; i < pixels.length; i += 4 ) {

		if ( pixels[ i ] < 8 ) continue;
		const x = ( i >> 2 ) % width, y = Math.floor( ( i >> 2 ) / width );
		count ++;
		min[ 0 ] = Math.min( min[ 0 ], x ); min[ 1 ] = Math.min( min[ 1 ], y );
		max[ 0 ] = Math.max( max[ 0 ], x ); max[ 1 ] = Math.max( max[ 1 ], y );

	}
	return { count, min, max };

}

// Check the actual rest-pose skin output, including Blender's armature coordinate conversion.
function skinnedBounds( model ) {

	const min = [ Infinity, Infinity, Infinity ], max = [ - Infinity, - Infinity, - Infinity ];
	const J = model.jointData;
	for ( const mesh of model.meshes ) {

		const attrs = mesh.geometry.attributes, P = attrs.position.array, I = attrs.skinIndex.array, W = attrs.skinWeight.array;
		for ( let i = 0; i < P.length / 3; i ++ ) {

			const p = [ 0, 0, 0 ];
			for ( let k = 0; k < 4; k ++ ) {

				const o = I[ i * 4 + k ] * 16, w = W[ i * 4 + k ];
				for ( let axis = 0; axis < 3; axis ++ ) p[ axis ] += w * ( J[ o + axis ] * P[ i * 3 ] + J[ o + 4 + axis ] * P[ i * 3 + 1 ] + J[ o + 8 + axis ] * P[ i * 3 + 2 ] + J[ o + 12 + axis ] );

			}
			for ( let axis = 0; axis < 3; axis ++ ) {

				min[ axis ] = Math.min( min[ axis ], p[ axis ] );
				max[ axis ] = Math.max( max[ axis ], p[ axis ] );

			}

		}

	}
	return { min, max, size: min.map( ( value, axis ) => max[ axis ] - value ), center: min.map( ( value, axis ) => ( max[ axis ] + value ) / 2 ) };

}
