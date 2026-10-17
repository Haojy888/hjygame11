import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scene, Vector3, Ray } from '../src/engine/index.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { abyssPropGeometry } from '../src/world/AbyssAssets.js';
import { WreckScene } from '../src/world/WreckScene.js';
import { TerrainData } from '../src/world/TerrainData.js';

const ids = [ 'wreck', 'anchor', 'jelly' ], terrain = new TerrainData();
const world = new WreckScene( { scene: new Scene(), terrain } );
const geometries = {};
for ( const id of ids ) {

	const bytes = readFileSync( new URL( '../public/models/expedition/' + id + '.glb', import.meta.url ) );
	const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const geometry = geometries[ id ] = abyssPropGeometry( gltf );
	assert.ok( geometry.index.count / 3 <= ( id === 'wreck' ? 19000 : 7000 ) );
	assert.ok( Math.abs( geometry.boundingBox.min.y ) < 0.0001 && Math.abs( geometry.boundingBox.max.y - 1 ) < 0.0001 );
	assert.ok( gltf.images.length >= 2 && gltf.images.every( ( image ) => image.bytes?.length > 1000 && ! image.uri ) );
	assert.equal( gltf.animations.length, 0 );

}
const hull = geometries.wreck, pos = hull.attributes.position, ix = hull.index.array;
assert.ok( hull.boundingBox.max.z - hull.boundingBox.min.z > 5.6, 'hull is about 18m long at runtime scale' );
const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
for ( const y of [ 0.3, 0.55, 0.8 ] ) {

	const ray = new Ray( new Vector3( 2, y, 0 ), new Vector3( - 1, 0, 0 ) );
	for ( let i = 0; i < ix.length; i += 3 ) {

		a.fromBufferAttribute( pos, ix[ i ] ); b.fromBufferAttribute( pos, ix[ i + 1 ] ); c.fromBufferAttribute( pos, ix[ i + 2 ] );
		const point = ray.intersectTriangle( a, b, c, false, hit );
		assert.ok( ! point || point.x < - 0.45, 'actual starboard triangles leave an open entrance into the hold' );

	}

}
let requests = 0;
globalThis.__assetFile = async () => { requests ++; throw new Error( 'offline test' ); };
const warn = console.warn; console.warn = () => {};
try {

	const first = world.assets.load( 'wreck' );
	assert.equal( world.assets.load( 'wreck' ), first );
	assert.equal( await first, false ); assert.equal( requests, 1 );
	assert.equal( world.fallback.hull.visible, true ); assert.equal( world.jellyFallback.visible, true );

} finally { console.warn = warn; delete globalThis.__assetFile; }
console.log( 'Wreck assets passed: three embedded GLBs, geometry budgets, real starboard openings, cached failed request and usable fallback scenery.' );

if ( process.argv.includes( '--render' ) ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async ( url ) => {

		const bytes = readFileSync( new URL( '../public/models/expedition/' + url.split( '/' ).pop(), import.meta.url ) );
		return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

	};
	const { setupLife } = await import( './life-harness.mjs' );
	const { G } = await import( '../src/engine/render/Frame.js' );
	const L = await setupLife( { W: 1440, H: 900, ground: { center: [ - 60, 217 ], size: 85 } } );
	const errors = []; L.GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
	const world = new WreckScene( { scene: L.scene, terrain } );
	assert.deepEqual( await Promise.all( ids.map( ( id ) => world.assets.load( id ) ) ), [ true, true, true ] );
	const out = resolve( '../wreck-expedition' ); mkdirSync( out, { recursive: true } );
	const update = ( dt ) => world.update( dt, L.camera );
	L.sky = [ 0.008, 0.038, 0.055, 1 ];
	L.camera.position.copy( world.position ).add( new Vector3( 20, 13, - 18 ) );
	L.camera.lookAt( world.position.clone().add( new Vector3( 0, 1.5, 0 ) ) );
	await L.run( 5, update ); await L.save( out + '/wreck-in-engine.png' );
	const conformed = world.assets.models.get( 'wreck' ).geometry.attributes.position;
	for ( let i = 0; i < pos.count; i ++ ) {

		const ground = terrain.heightAt( world.position.x + conformed.getX( i ) * 3.2, world.position.z + conformed.getZ( i ) * 3.2 );
		assert.ok( Math.abs( conformed.getY( i ) * 3.2 + world.position.y - ground - ( pos.getY( i ) * 3.2 - 0.08 ) ) < 0.0001, 'long hull follows the actual curved seabed without burying the hold' );

	}
	L.camera.position.copy( world.position ).add( new Vector3( 5, 2.1, 0 ) );
	L.camera.lookAt( world.targets.log );
	await L.run( 4, update ); await L.save( out + '/hold-in-engine.png' );
	L.camera.position.copy( world.cavePosition ).add( new Vector3( 0, 2.4, - 15 ) );
	L.camera.lookAt( world.cavePosition.clone().add( new Vector3( 0, 2.4, 4 ) ) );
	await L.run( 4, update ); await L.save( out + '/cave-in-engine.png' );
	G.night.value = 1; G.sunColor.value.setRGB( 0.09, 0.13, 0.2 ); G.skyIrradiance.value.setRGB( 0.04, 0.09, 0.15 );
	L.sky = [ 0.002, 0.008, 0.015, 1 ];
	L.camera.position.copy( world.jellyPositions[ 0 ] ).add( new Vector3( 1, 1.1, - 3.6 ) );
	L.camera.lookAt( world.jellyPositions[ 0 ].clone().add( new Vector3( 0, 0.65, 0 ) ) );
	await L.run( 8, update ); await L.save( out + '/jelly-night-in-engine.png' );
	assert.equal( world.fallback.hull.visible, false ); assert.equal( world.jellyFallback.visible, false );
	assert.equal( world.assets.models.get( 'jelly' ).staticVelocity, false );
	assert.deepEqual( errors, [], 'PBR models, pulsing translucent jellies and cave/plankton shaders compile in the native renderer' );
	console.log( 'Native wreck scene draws:', L.mr.stats );
	await L.exit();

}
