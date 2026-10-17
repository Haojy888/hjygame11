import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Ray, Vector3 } from '../src/engine/index.js';
import { AbyssScene } from '../src/world/AbyssScene.js';
import { Colliders } from '../src/world/Colliders.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';

const terrain = new TerrainData(), scene = new Scene(), colliders = new Colliders();
const environment = new AbyssScene( { scene, terrain, colliders } );
const center = WORLD.abyss.center, camera = new PerspectiveCamera();
assert.equal( environment.group.children.length, 3, 'Merged geometry keeps the base environment to three draw objects' );
let triangles = 0, vertices = 0, centerObstacles = 0;
for ( const mesh of environment.group.children ) {

	const g = mesh.geometry, p = g.attributes.position;
	triangles += g.index.count / 3; vertices += p.count;
	assert.ok( g.boundingBox.max.y < - 3, 'Even the tallest rock stays below the sea surface' );
	for ( const a of Object.values( g.attributes ) ) for ( const value of a.array ) assert.ok( Number.isFinite( value ), 'All mesh and shader inputs are finite' );
	for ( const index of g.index.array ) assert.ok( index >= 0 && index < p.count, 'Valid triangle indices' );
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), z = p.getZ( i ), floor = terrain.heightAt( center.x + x, center.z + z );
		assert.ok( p.getY( i ) >= floor - 0.26, 'Props conform to the real sloping seabed instead of floating or sinking' );
		if ( mesh !== environment.group.children[ 2 ] && Math.hypot( x, z ) < 24 && p.getY( i ) > floor + 0.6 ) centerObstacles ++;

	}

}
assert.ok( triangles < 60000, 'The entire base environment fits a bounded geometry budget' );
assert.equal( centerObstacles, 0, 'A 24 m radius clearing leaves room for the giant octopus patrol and arms' );
assert.equal( environment.gateways.length, 2 );
const ruin = environment.group.children[ 1 ].geometry, rp = ruin.attributes.position, indices = ruin.index.array;
const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
for ( const gate of environment.gateways ) {

	assert.ok( gate.width >= 8 && gate.clearance >= 5 );
	const forward = new Vector3( Math.sin( gate.yaw ), 0, Math.cos( gate.yaw ) );
	const right = new Vector3( Math.cos( gate.yaw ), 0, - Math.sin( gate.yaw ) );
	for ( const lane of [ - 3, 0, 3 ] ) for ( const height of [ 1, 2.5, 4 ] ) {

		const origin = new Vector3( gate.x, gate.floor + height, gate.z ).addScaledVector( right, lane ).addScaledVector( forward, - 5 );
		const ray = new Ray( origin, forward );
		for ( let i = 0; i < indices.length; i += 3 ) {

			a.fromBufferAttribute( rp, indices[ i ] ); b.fromBufferAttribute( rp, indices[ i + 1 ] ); c.fromBufferAttribute( rp, indices[ i + 2 ] );
			assert.ok( ! ray.intersectTriangle( a, b, c, false, hit ) || hit.distanceTo( origin ) > 10, 'Actual arch triangles leave a clear diving passage' );

		}

	}

}
assert.ok( colliders.cylinders.length > 18 && colliders.cylinders.length < 55, 'Only large rocks get simple collision cores' );
for ( let z = - 51; z <= 51; z ++ ) for ( const x of [ - 1.5, 0, 1.5 ] ) {

	const position = new Vector3( center.x + x, terrain.heightAt( center.x + x, center.z + z ) + 1, center.z + z );
	assert.equal( colliders.resolveCapsule( position, 0.4, 1.75 ), false, 'The north/south diving passage remains open' );

}
for ( const f of environment.features ) assert.equal( f.floor, terrain.heightAt( center.x + f.x, center.z + f.z ), 'Every colony and structure uses actual TerrainData height' );
assert.equal( environment.modelPlacements.length, 12 );
assert.deepEqual( new Set( environment.modelPlacements.map( ( p ) => p.id ) ), new Set( [ 'vent', 'arch', 'coral' ] ) );
for ( const p of environment.modelPlacements ) {

	assert.ok( Math.hypot( p.position.x - center.x, p.position.z - center.z ) > 24 );
	assert.ok( p.position.y + p.height < - 3, 'Generated model instances also have underwater clearance' );
	assert.ok( p.height > 0 && Number.isFinite( p.rotation ) );
	assert.ok( Math.abs( p.position.y - terrain.heightAt( p.position.x, p.position.z ) ) < 0.1 );

}
camera.position.copy( environment.position ).add( new Vector3( 0, 7, 28 ) );
environment.update( 0.05, camera );
assert.equal( environment.group.visible, true );
assert.equal( environment.time, 0.05 );
assert.equal( environment.lifeMaterial.uniforms.previousAge.value, 0 );
environment.update( 0.05, camera );
assert.equal( environment.lifeMaterial.uniforms.previousAge.value, 0.05, 'Sway and marine snow keep the previous deformation for temporal motion vectors' );
const time = environment.time;
for ( const dt of [ NaN, Infinity, - 1 ] ) environment.update( dt, camera );
assert.equal( environment.time, time );
camera.position.set( 55, 2.3, 36 ); environment.update( 1 / 60, camera );
assert.equal( environment.group.visible, false, 'The harbor draws no deep-sea environment' );
console.log( 'Abyss environment passed: real seabed, three merged meshes, underwater clearance, 24 m patrol clearing, two diving gateways, sparse colonies, colliders, asset placements and culling.', { triangles, vertices, features: environment.features.length } );

if ( process.argv.includes( '--render' ) ) {

	const { setupLife } = await import( './life-harness.mjs' );
	const { GPU } = await import( '../src/engine/gpu/GPU.js' );
	const { mkdirSync } = await import( 'node:fs' );
	const { resolve } = await import( 'node:path' );
	const L = await setupLife( { W: 1600, H: 1000, ground: { center: [ center.x, center.z ], size: 130 } } );
	const errors = []; GPU.device.addEventListener( 'uncapturederror', ( e ) => errors.push( e.error.message ) );
	const preview = new AbyssScene( { scene: L.scene, terrain } );
	L.sky = [ 0.005, 0.026, 0.030, 1 ];
	L.camera.position.copy( preview.position ).add( new Vector3( - 13, 14, - 49 ) );
	L.camera.lookAt( preview.position.clone().add( new Vector3( 0, 4, 5 ) ) );
	await L.run( 4, ( dt ) => preview.update( dt, L.camera ) );
	const out = resolve( '../deep-beast-lux3d/environment' ); mkdirSync( out, { recursive: true } );
	await L.save( out + '/seabed-garden.png' );
	assert.deepEqual( errors, [], 'Native main and shadow shader compilation has no validation errors' );
	console.log( 'Native environment draws:', L.mr.stats );
	await L.exit();

}
