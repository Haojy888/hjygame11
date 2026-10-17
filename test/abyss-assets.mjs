import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { AbyssAssets, abyssPropGeometry, seatAbyssProp } from '../src/world/AbyssAssets.js';
import { AbyssScene } from '../src/world/AbyssScene.js';
import { DeepBeast } from '../src/world/DeepBeast.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { WORLD } from '../src/world/WorldLayout.js';

const ids = [ 'vent', 'arch', 'coral' ];
const terrain = new TerrainData(), scene = new Scene(), colliders = new Colliders();
const environment = new AbyssScene( { scene, terrain } );
const assets = new AbyssAssets( { scene, placements: environment.modelPlacements, colliders, terrain } );
const camera = new PerspectiveCamera();
camera.position.set( 55, 2.3, 40 ); assets.update( 1 / 60, camera );
assert.equal( assets.pending.size, 0, 'The harbor does not fetch deep-sea prop assets' );
assert.equal( assets.group.visible, false );
let totalTriangles = 0;
for ( const id of ids ) {

	const bytes = readFileSync( new URL( '../public/models/abyss/' + id + '.glb', import.meta.url ) );
	const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const geometry = abyssPropGeometry( gltf ), box = geometry.boundingBox;
	assert.ok( Math.abs( box.min.y ) < 0.0001 && Math.abs( box.max.y - 1 ) < 0.0001, 'Prepared props are bottom-origin and unit height' );
	assert.ok( Math.abs( box.max.x + box.min.x ) < 0.0001 && Math.abs( box.max.z + box.min.z ) < 0.0001, 'Prop footprints are centered' );
	assert.ok( gltf.images.length > 0 && gltf.images.every( ( im ) => im.bytes?.length > 1000 && ! im.uri && im.mimeType === 'image/png' ), 'Each prop embeds usable PNG textures' );
	assert.equal( gltf.animations.length, 0 );
	const places = environment.modelPlacements.filter( ( p ) => p.id === id );
	totalTriangles += geometry.index.count / 3 * places.length;
	for ( const p of places ) {

		const seated = seatAbyssProp( geometry, p, terrain ), vertex = new Vector3(), pos = geometry.attributes.position;
		let highestBase = - Infinity;
		for ( let i = 0; i < pos.count; i ++ ) {

			vertex.set( pos.getX( i ), pos.getY( i ), pos.getZ( i ) ).applyMatrix4( seated.matrix );
			assert.ok( vertex.y < - 3, 'Seated and tilted props remain underwater' );
			if ( pos.getY( i ) < 0.06 ) highestBase = Math.max( highestBase, vertex.y - terrain.heightAt( vertex.x, vertex.z ) );

		}
		assert.ok( Math.abs( highestBase + 0.10 ) < 0.001, 'Both arch feet and every low base rim stay seated into the sloping seabed' );
		assets._collider( id, { ...p, position: seated.position }, box );

	}
	if ( id === 'arch' ) for ( const p of places ) {

		const position = p.position.clone().add( new Vector3( 0, 1.4, 0 ) );
		assert.equal( colliders.resolveCapsule( position, 0.35, 1.0, 0 ), false, 'Arch collision volumes leave the central diving hole open' );

	}
	const original = gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ];
	gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ] = NaN;
	assert.throws( () => abyssPropGeometry( gltf ), /Invalid abyss vertex/ );
	gltf.meshes[ 0 ][ 0 ].attributes.POSITION.array[ 0 ] = original;

}
assert.ok( totalTriangles < 125000, 'Twelve reusable instances fit the close-range geometry budget' );
let requests = 0;
globalThis.__assetFile = async () => { requests ++; throw new Error( 'simulated offline seafloor prop' ); };
const warn = console.warn; console.warn = () => {};
try {

	const pending = assets.load( 'vent' );
	assert.equal( assets.load( 'vent' ), pending, 'Repeated approaches share the in-flight or failed request' );
	assert.equal( await pending, false ); assert.equal( requests, 1 );
	assert.equal( assets.models.size, 0 );
	assert.equal( environment.group.children.length, 3, 'The complete base scenery survives a cloud-asset failure' );
	assert.equal( await assets.load( 'unknown' ), false );

} finally { console.warn = warn; delete globalThis.__assetFile; }
console.log( 'Abyss assets passed: three real GLBs, embedded PNG PBR, node transforms, unit origins, twelve placements, open arch colliders, deferred cached requests and offline scenery.', { totalTriangles } );

if ( process.argv.includes( '--render' ) ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async ( url ) => {

		const file = url.endsWith( '/creatures/abyssal-elder.glb' ) ? '../public/models/creatures/abyssal-elder.glb' : '../public/models/abyss/' + url.split( '/' ).pop();
		const bytes = readFileSync( new URL( file, import.meta.url ) );
		return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

	};
	const { setupLife } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const center = WORLD.abyss.center, floor = terrain.heightAt( center.x, center.z );
	const L = await setupLife( { W: 1600, H: 1000, ground: { center: [ center.x, center.z ], size: 145 } } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
	const environment = new AbyssScene( { scene: L.scene, terrain } );
	const props = new AbyssAssets( { scene: L.scene, placements: environment.modelPlacements, terrain } );
	const beast = new DeepBeast( { scene: L.scene, terrain } );
	assert.deepEqual( await Promise.all( ids.map( ( id ) => props.load( id ) ) ), [ true, true, true ] );
	assert.equal( await beast.loadRealistic(), true );
	assert.equal( props.group.children.length, 3, 'All repeated assets share three instanced draw objects' );
	for ( const mesh of props.group.children ) {

		assert.equal( mesh.staticVelocity, true );
		assert.equal( mesh.material.bindings.propAlbedo.texture.format, 'rgba8unorm-srgb' );
		assert.ok( mesh.boundingSphere.radius > 0 );

	}
	L.sky = [ 0.008, 0.026, 0.035, 1 ];
	const out = resolve( '../abyss-scene' ); mkdirSync( out, { recursive: true } );
	const update = ( dt ) => { environment.update( dt, L.camera ); props.update( dt, L.camera ); beast.update( dt, L.camera, { position: L.camera.position } ); };
	L.camera.position.set( center.x - 12, floor + 19, center.z - 55 );
	L.camera.lookAt( center.x, floor + 5, center.z + 4 );
	await L.run( 5, update ); await L.save( out + '/overview.png' );
	const arch = environment.modelPlacements.find( ( p ) => p.id === 'arch' );
	L.camera.position.copy( arch.position ).add( new Vector3( 0, 3, - 11 ) );
	L.camera.lookAt( arch.position.clone().add( new Vector3( 0, 2.6, 0 ) ) );
	await L.run( 4, update ); await L.save( out + '/arch-in-scene.png' );
	assert.deepEqual( errors, [], 'Static instanced PBR, animated octopus, colonies and shadow passes compile together' );
	console.log( 'Native abyss scene draws:', L.mr.stats );
	await L.exit();

}
