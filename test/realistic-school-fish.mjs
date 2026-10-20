import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import './headless.mjs';
import './smaa-shim.mjs';
import { Scene, Vector3 } from '../src/engine/index.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { RealisticSwimmers, swimmerGeometry } from '../src/world/fish/RealisticSwimmers.js';
import { FISH_IDS } from '../src/game/FishTable.js';
import { FishSchools } from '../src/world/Fish.js';
import { WORLD } from '../src/world/WorldLayout.js';

const file = ( url ) => {

	const bytes = readFileSync( new URL( '../public/' + String( url ).replace( /^\//, '' ), import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};
for ( const species of FISH_IDS ) {

	const bytes = file( 'models/fish-schools/' + species + '.glb' );
	assert.ok( bytes.byteLength < 3 * 1024 * 1024, species + ': lightweight download budget' );
	const gltf = parseGLB( bytes ), geometry = swimmerGeometry( gltf, species );
	assert.ok( geometry.index.count / 3 <= 6100 );
	assert.ok( Math.abs( geometry.boundingBox.getSize( new Vector3() ).z - 1 ) < 0.02, species + ': same normalized +Z body length as the simulation' );
	assert.ok( gltf.images.length >= 2 );
	for ( const image of gltf.images ) {

		const data = new DataView( image.bytes.buffer, image.bytes.byteOffset );
		assert.equal( image.mimeType, 'image/png' );
		assert.ok( data.getUint32( 16 ) <= 1024 && data.getUint32( 20 ) <= 1024 );

	}
	const png = new DataView( file( 'images/fish-realistic/' + species + '.png' ) );
	assert.equal( png.getUint32( 16 ), 360 ); assert.equal( png.getUint32( 20 ), 170 );

}

const { setupLife } = await import( './life-harness.mjs' );
const { readTexture } = await import( '../src/engine/gpu/Readback.js' );
const L = await setupLife( { W: 960, H: 600, ground: { center: [ - 78, 58 ], size: 180 } } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
const models = new RealisticSwimmers( new Scene() );
assert.equal( models.pending.size, 0 );
let finish, requests = 0;
globalThis.__assetFile = ( url ) => { requests ++; return new Promise( ( r ) => { finish = () => r( file( url ) ); } ); };
const pending = models.load( 'grunt' );
assert.equal( models.load( 'grunt' ), pending );
assert.equal( await models.load( 'parrot' ), false, 'a second fish download waits for the current one' );
assert.equal( models.pending.has( 'parrot' ), false, 'a busy slot must not cache a permanent failure' );
assert.equal( requests, 1 ); finish(); assert.equal( await pending, true );
globalThis.__assetFile = file;
for ( const id of [ 'parrot', 'tang', 'angel', 'jack', 'mullet' ] ) assert.equal( await models.load( id ), true );
assert.equal( await models.load( 'wrasse' ), false, 'resident textures stay bounded' );

const record = new Float32Array( 32 );
record.set( [ 1, - 2, 3, 0.5, 0, 0, 0, 1, 0.3, 0.07, 0, 0, 0.01, 0, 0, 0.2 ], 16 );
for ( const model of models.models.values() ) model.age = 2;
models.begin();
assert.equal( models.add( 'grunt', record, 16, 3, 20 ), 0, 'subpixel detail starts no draw' );
assert.equal( models.add( 'grunt', record, 16, 20, 200 ), 0, 'far fish stay batched procedurally' );
assert.equal( models.add( 'grunt', record, 16, 3, 52 ), 0.5, 'screen size fades in the real model' );
assert.deepEqual( models.models.get( 'grunt' ).batch.data.slice( 0, 16 ), record.slice( 16 ), 'all motion and pose fields are preserved' );
assert.equal( models.add( 'grunt', record, 16, 9, 200 ), 0.5, 'distance fades out the real model' );
models.begin();
for ( const id of [ 'grunt', 'parrot', 'tang' ] ) for ( let i = 0; i < 8; i ++ ) assert.equal( models.add( id, record, 16, 3, 200 ), 1 );
assert.equal( models.fishCount, 24 );
assert.equal( models.add( 'angel', record, 16, 3, 200 ), 0, 'total near-fish triangle budget' );
models.end();
assert.equal( models.models.get( 'grunt' ).batch.fadeInstances, 8 );
models.begin(); models.end();
assert.equal( models.models.get( 'grunt' ).batch.fadeInstances, 0, 'leaving view clears every instance' );
GPU.submit(); await GPU.queue.onSubmittedWorkDone();
models.time = 10;
assert.equal( await models.load( 'wrasse' ), true, 'an unused texture set is released for a new area' );
assert.equal( models.models.size, 6 ); assert.equal( models.models.has( 'grunt' ), false );
assert.equal( models.pending.has( 'grunt' ), false, 'evicted fish can load again later' );
GPU.submit(); await GPU.queue.onSubmittedWorkDone();
models.dispose();

const offline = new RealisticSwimmers( new Scene() );
const warn = console.warn; console.warn = () => {};
requests = 0; globalThis.__assetFile = async () => { requests ++; throw new Error( 'offline' ); };
try {

	assert.equal( await offline.load( 'grunt' ), false );
	assert.equal( await offline.load( 'grunt' ), false );
	assert.equal( requests, 1 ); assert.equal( offline.loadingFish, 0 );

} finally { console.warn = warn; offline.dispose(); globalThis.__assetFile = file; }

// Exercise selection by the real school simulation, the textured swim shader, MRT velocity
// and native WebGPU draws. Camera stays still; motion must come from the fish themselves.
const anchors = [];
for ( let x = - 60; x <= 60; x += 10 ) for ( let z = - 60; z <= 60; z += 10 ) {

	const px = WORLD.reef.center.x + x, pz = WORLD.reef.center.z + z;
	if ( L.terrain.heightAt( px, pz ) < - 2 ) anchors.push( [ px, pz ] );

}
const schools = new FishSchools( { parent: L.scene, terrain: L.terrain, center: WORLD.reef.center, radius: 68, anchors } );
const out = process.argv.includes( '--render' ) ? resolve( '../../work/fish-school-detail/render' ) : null;
if ( out ) mkdirSync( out, { recursive: true } );
for ( const id of [ 'grouper', 'parrot', 'tang' ] ) {

	// Other species can have started an automatic load in the preceding frame.
	await Promise.all( schools.realistic.pending.values() );
	assert.equal( await schools.realistic.load( id ), true );
	const model = schools.realistic.models.get( id ); model.age = 2;
	const group = schools.groups.find( ( g ) => g.sp.model === id ), i = group.offset * 3;
	const target = new Vector3( schools.pos[ i ], schools.pos[ i + 1 ], schools.pos[ i + 2 ] );
	L.camera.position.copy( target ).add( new Vector3( 0.8, 0.35, 0.7 ) ); L.camera.lookAt( target );
	await L.run( 4, ( dt ) => schools.update( dt, L.camera.position ) );
	assert.ok( model.batch.fadeInstances > 0, id + ': actual visible school selects the new model' );
	assert.ok( schools.realistic.fishCount <= 24 );
	const velocity = new Uint16Array( ( await readTexture( L.rt.textures[ 1 ] ) ).data );
	let moving = 0;
	for ( let k = 0; k < velocity.length; k += 4 ) if ( ( velocity[ k ] & 0x7fff ) > 0 || ( velocity[ k + 1 ] & 0x7fff ) > 0 ) moving ++;
	assert.ok( moving > 20, id + ': fish retain their own motion vectors' );
	if ( out ) await L.save( out + '/' + id + '.png' );

}
await Promise.all( schools.realistic.pending.values() );
GPU.submit(); await GPU.queue.onSubmittedWorkDone();
schools.dispose();
assert.deepEqual( errors, [] );
console.log( 'PASS: 18 lightweight school assets and guide images, deferred/serialized loading, shared instancing, 24-fish/6-texture budgets, LRU cleanup, distance/screen fade, offline fallback and real school GPU motion.' );
await L.exit();
