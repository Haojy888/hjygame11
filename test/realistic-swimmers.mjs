import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scene, Vector3 } from '../src/engine/index.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RealisticSwimmers, swimmerGeometry } from '../src/world/fish/RealisticSwimmers.js';
import { PART } from '../src/world/fish/FishGeometry.js';
import { FishSchools } from '../src/world/Fish.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';

const files = { turtle: 'green-turtle', eagleRay: 'spotted-eagle-ray' };
const geometries = new Map();
for ( const [ species, name ] of Object.entries( files ) ) {

	const bytes = readFileSync( new URL( '../public/models/creatures/' + name + '.glb', import.meta.url ) );
	const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const geometry = swimmerGeometry( gltf, species ), p = geometry.attributes.position, d = geometry.attributes.aData;
	geometries.set( species, geometry );
	assert.ok( geometry.index.count / 3 <= 12000 );
	assert.ok( gltf.images.length >= 2 && gltf.images.every( ( image ) => image.bytes?.length > 1000 && image.mimeType === 'image/png' && ! image.uri ) );
	for ( const image of gltf.images ) assert.ok( new DataView( image.bytes.buffer, image.bytes.byteOffset ).getUint32( 16 ) <= 1024 );
	let moving = 0, left = 0, right = 0, hind = 0;
	for ( let i = 0; i < p.count; i ++ ) {

		assert.ok( d.getZ( i ) >= 0 && d.getZ( i ) <= 1 );
		if ( d.getZ( i ) > 0.1 ) { moving ++; if ( p.getX( i ) < 0 ) left ++; else right ++; if ( d.getW( i ) >= 2 ) hind ++; }
		if ( species === 'turtle' && p.getY( i ) > 0.04 ) assert.equal( d.getY( i ), PART.CARAPACE, 'the shell does not flap like a flipper' );
		if ( species === 'eagleRay' && p.getZ( i ) < - 0.22 ) assert.ok( Math.abs( p.getX( i ) ) < 0.04, 'the repaired whip tail has no lateral fork' );

	}
	assert.ok( moving > 200 && left > 50 && right > 50, 'both sides have gradual animation weights' );
	if ( species === 'turtle' ) assert.ok( hind > 50, 'rear flippers retain their smaller stroke' );
	const first = gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ];
	gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ] = NaN;
	assert.throws( () => swimmerGeometry( gltf, species ), /invalid/ );
	gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ] = first;

}

const parent = new Scene(), models = new RealisticSwimmers( parent );
assert.equal( models.pending.size, 0, 'constructing the harbor starts no wildlife requests' );
let requests = 0;
globalThis.__assetFile = async () => { requests ++; throw new Error( 'offline test' ); };
const warn = console.warn; console.warn = () => {};
try {

	const pending = models.load( 'turtle' );
	assert.equal( models.load( 'turtle' ), pending );
	assert.equal( await pending, false ); assert.equal( requests, 1 ); assert.equal( models.models.size, 0 );
	assert.equal( await models.load( 'toString' ), false );

} finally { console.warn = warn; delete globalThis.__assetFile; }

const originalDevice = GPU.device;
const batch = { data: new Float32Array( 16 ), fades: [], begin() { this.fades = []; }, addFade( ...a ) { this.fades.push( a ); }, commit() {}, dataAttr: {}, dispose() {} };
const model = { age: 0, count: 0, batch, textures: [], material: { dispose() {} }, mesh: { removeFromParent() {} } };
models.models.set( 'turtle', model );
const record = new Float32Array( Array.from( { length: 16 }, ( _, i ) => i + 0.5 ) );
try {

	GPU.device = {};
	models.begin( 0.1 );
	const fade = models.add( 'turtle', record, 0, 5 );
	assert.ok( fade > 0 && fade < 1, 'a newly loaded model fades in rather than instantly replacing the fallback' );
	assert.deepEqual( batch.data, record, 'position, orientation, phase and previous-frame motion remain the original simulation record' );
	assert.equal( models.add( 'turtle', record, 0, 5 ), 0, 'unexpected extra animals retain their original model rather than overflowing the batch' );
	model.age = 2; models.begin();
	assert.equal( models.add( 'turtle', record, 0, 12 ), 1 );
	models.begin(); assert.equal( models.add( 'turtle', record, 0, 16 ), 0.5 );
	models.begin(); assert.equal( models.add( 'turtle', record, 0, 20 ), 0 );
	models.begin(); assert.equal( models.add( 'turtle', record, 0, 100 ), 0 );
	models.end(); assert.equal( batch.fades.length, 0, 'leaving the area clears all old near-model draws' );
	models.dispose(); assert.equal( await models.load( 'turtle' ), false );

} finally { GPU.device = originalDevice; }

const terrain = new TerrainData();
const fish = new FishSchools( { parent, terrain, center: WORLD.reef.center, radius: 68 } );
assert.equal( fish.groups.filter( ( g ) => Object.hasOwn( files, g.sp.model ) ).reduce( ( n, g ) => n + g.count, 0 ), 2, 'the new models replace two existing animals' );
assert.equal( fish.realistic.pending.size, 0 );
fish.dispose();
console.log( 'Realistic swimmers passed: actual embedded GLBs, budget, original axes, stable shell, four flippers, single whip tail, near fade, preserved pose/motion, deferred loading, offline fallback and cleanup.' );

if ( process.argv.includes( '--render' ) ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async ( url ) => {

		const bytes = readFileSync( new URL( '../public/models/creatures/' + url.split( '/' ).pop(), import.meta.url ) );
		return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

	};
	const { setupLife } = await import( './life-harness.mjs' );
	const { readTexture } = await import( '../src/engine/gpu/Readback.js' );
	const L = await setupLife( { W: 1280, H: 800, ground: { center: [ - 78, 58 ], size: 180 } } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
	const schools = new FishSchools( { parent: L.scene, terrain: L.terrain, center: WORLD.reef.center, radius: 68 } );
	assert.deepEqual( await Promise.all( Object.keys( files ).map( ( species ) => schools.realistic.load( species ) ) ), [ true, true ] );
	for ( const model of schools.realistic.models.values() ) model.age = 2;
	const out = resolve( '../reef-life' ); mkdirSync( out, { recursive: true } );
	for ( const species of Object.keys( files ) ) {

		const g = schools.groups.find( ( g ) => g.sp.model === species ), i = g.offset * 3;
		const target = new Vector3( schools.pos[ i ], schools.pos[ i + 1 ], schools.pos[ i + 2 ] );
		const distance = species === 'turtle' ? 2.6 : 5;
		L.camera.position.copy( target ).add( new Vector3( distance * 0.65, distance * 0.45, distance * 0.7 ) );
		L.camera.lookAt( target );
		await L.run( 8, ( dt ) => schools.update( dt, L.camera.position ) );
		const model = schools.realistic.models.get( species );
		assert.equal( model.batch.fadeInstances, 1, 'the real school cull actually selects the generated animal' );
		assert.ok( model.batch.fadeTriangles >= 11000 || model.batch.kinds[ 0 ].triangles >= 11000 );
		await L.save( out + '/' + species + '-in-engine.png' );
		const velocity = new Uint16Array( ( await readTexture( L.rt.textures[ 1 ] ) ).data );
		let moving = 0;
		for ( let k = 0; k < velocity.length; k += 4 ) if ( ( velocity[ k ] & 0x7fff ) > 0 || ( velocity[ k + 1 ] & 0x7fff ) > 0 ) moving ++;
		assert.ok( moving > 20, 'a stationary camera receives the animals own motion vectors' );
		console.log( species, { triangles: model.batch.kinds[ 0 ].triangles, movingPixels: moving, frame: L.mr.stats } );

	}
	assert.deepEqual( errors, [], 'the PBR textures, original swim shader, dither, indirect draws and shadows compile together' );
	schools.dispose(); await L.exit();

}
