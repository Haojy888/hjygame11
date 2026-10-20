import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Ray, Vector3 } from '../src/engine/index.js';
import { AbyssScene } from '../src/world/AbyssScene.js';
import { Colliders } from '../src/world/Colliders.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Player } from '../src/player/Player.js';
import { Input } from '../src/core/Input.js';
import { subjectVisible } from '../src/game/FieldCamera.js';

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

// The same baked stone vertices now supply collision, including the sloping
// seabed and each individual arch block. The passage itself stays empty.
assert.equal( colliders.boxes.filter( b => b.tag === 'abyss-gateway' ).length, 44 );
assert.equal( colliders.boxes.filter( b => b.tag === 'abyss-column' ).length, 8 );
assert.equal( colliders.boxes.filter( b => b.tag === 'abyss-lintel' ).length, 8 );
for ( let i = 0; i < rp.count; i ++ ) {

	const p = new Vector3( rp.getX( i ) + center.x, rp.getY( i ), rp.getZ( i ) + center.z );
	assert.ok( colliders.boxes.some( box => {

		const dx = p.x - box.center.x, dz = p.z - box.center.z;
		return Math.abs( dx * box.cos - dz * box.sin ) <= box.half.x + 0.0001 && Math.abs( dx * box.sin + dz * box.cos ) <= box.half.z + 0.0001 && Math.abs( p.y - box.center.y ) <= box.half.y + 0.0001;

	} ), 'every visible ruin vertex is enclosed by a placed collision block' );

}
for ( const box of colliders.boxes.filter( b => b.tag === 'abyss-gateway' || b.tag === 'abyss-lintel' ) ) {

	const stoneWorld = new Colliders(); stoneWorld.boxes.push( box );
	const forward = new Vector3( Math.sin( box.rotY ), 0, Math.cos( box.rotY ) );
	for ( const side of [ - 1, 1 ] ) {

		const p = box.center.clone().addScaledVector( forward, side * ( box.half.z + 2 ) ); p.y -= 0.5;
		stoneWorld.moveCapsule( p, forward.clone().multiplyScalar( - side * ( box.half.z * 2 + 4 ) ), 0.3, 1, 0 );
		assert.ok( p.clone().sub( box.center ).dot( forward ) * side >= box.half.z + 0.299, 'long swim steps cannot cross either stone face' );

	}
	const above = box.center.clone().setY( box.top + 2 );
	stoneWorld.moveCapsule( above, new Vector3( 0, - 4, 0 ), 0.3, 1, 0 );
	assert.ok( above.y >= box.top - 0.00001, 'non-walkable stone tops block a descending swimmer' );

}
const highest = colliders.boxes.filter( b => b.tag === 'abyss-gateway' ).sort( ( a, b ) => b.top - a.top )[ 0 ];
const below = highest.center.clone().setY( highest.bottom - 3 );
colliders.moveCapsule( below, new Vector3( 0, 4, 0 ), 0.3, 1, 0 );
assert.ok( below.y + 1 <= highest.bottom + 0.00001, 'rising into the arch stops below the stone' );

const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, sensitivity: 1, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 } } );
const swimmer = new Player( { camera, input, terrain, colliders, query: { allocate: () => 0, cpuValid: false, setPoint() {} } } );
for ( const fps of [ 12, 30, 60, 144 ] ) for ( const gate of environment.gateways ) for ( const lane of [ - 3, 0, 3 ] ) {

	const forward = new Vector3( Math.sin( gate.yaw ), 0, Math.cos( gate.yaw ) ), right = new Vector3( Math.cos( gate.yaw ), 0, - Math.sin( gate.yaw ) );
	const origin = new Vector3( center.x + gate.x, gate.floor + 2, center.z + gate.z );
	swimmer.position.copy( origin ).addScaledVector( forward, - 5 ).addScaledVector( right, lane );
	swimmer.mode = 'swim'; swimmer.floating = false; swimmer._camY = null; swimmer.velocity.set( 0, 0, 0 );
	swimmer.pitch = 0; swimmer.yaw = Math.atan2( - forward.x, - forward.z ); input.keys.add( 'KeyW' );
	for ( let i = 0; i < fps * 8; i ++ ) { swimmer.update( 1 / fps ); input.endFrame(); }
	input.keys.clear();
	assert.ok( swimmer.position.clone().sub( origin ).dot( forward ) > 5, fps + ' FPS: a real swimmer crosses each gate and side lane' );

}
const lintel = colliders.boxes.find( b => b.tag === 'abyss-lintel' );
for ( const fps of [ 12, 30, 60, 144 ] ) {

	swimmer.position.copy( lintel.center ).setY( lintel.top + 1 ); swimmer.velocity.set( 0, 0, 0 );
	swimmer.mode = 'swim'; swimmer.floating = false; swimmer._camY = null; input.keys.add( 'KeyC' );
	for ( let i = 0; i < fps * 4; i ++ ) {

		swimmer.update( 1 / fps ); input.endFrame();
		assert.ok( swimmer.position.y >= lintel.top - 0.00001, 'holding dive cannot sink through the actual fallen lintel' );
		assert.ok( Math.hypot( swimmer.position.x - lintel.center.x, swimmer.position.z - lintel.center.z ) < 0.00001, 'top contact does not eject the swimmer sideways' );

	}
	input.keys.clear();

}

const pillarWorld = new Colliders(); pillarWorld.addCylinder( 0, 0, 1, - 8, - 3 );
const sinking = new Vector3( 0, - 1, 0 ); pillarWorld.moveCapsule( sinking, new Vector3( 0, - 5, 0 ), 0.3, 1, 0 );
assert.equal( sinking.y, - 3, 'a rock pillar top blocks descending movement without sideways ejection' );
const rising = new Vector3( 0, - 11, 0 ); pillarWorld.moveCapsule( rising, new Vector3( 0, 5, 0 ), 0.3, 1, 0 );
assert.equal( rising.y, - 9, 'a pillar underside blocks rising movement' );
const inside = new Vector3( 0, - 6, 0 ); pillarWorld.resolveCapsule( inside, 0.3, 1, 0 );
assert.ok( Math.hypot( inside.x, inside.z ) >= 1.2999, 'a capsule at the exact cylinder centre recovers to a finite clear position' );
assert.equal( pillarWorld.raycast( new Vector3( 0, - 1, 0 ), new Vector3( 0, - 1, 0 ), 20 ), 2, 'vertical ray hits the top cap' );
assert.equal( pillarWorld.raycast( new Vector3( - 5, - 5, 0 ), new Vector3( 1, 0, 0 ), 20 ), 4, 'horizontal ray hits the side' );
assert.equal( pillarWorld.raycast( new Vector3( - 5, - 2, 0 ), new Vector3( 1, 0, 0 ), 20 ), 20, 'a ray above the cylinder remains clear' );
assert.equal( pillarWorld.raycast( new Vector3( 0, - 5, 0 ), new Vector3( 1, 0, 0 ), 20 ), 0, 'a ray starting inside reports immediate occlusion' );
const photoCamera = new PerspectiveCamera( 60, 1, 0.05, 100 ), subject = new Vector3( 5, - 5, 0 );
photoCamera.position.set( - 5, - 5, 0 ); photoCamera.lookAt( subject ); photoCamera.updateMatrixWorld( true );
assert.equal( subjectVisible( { camera: photoCamera, colliders: pillarWorld }, subject, 24 ), false, 'rock cores also occlude photographs' );
photoCamera.position.y = subject.y = - 2; photoCamera.lookAt( subject ); photoCamera.updateMatrixWorld( true );
assert.equal( subjectVisible( { camera: photoCamera, colliders: pillarWorld }, subject, 24 ), true, 'an unobstructed photo above a pillar remains available' );
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
console.log( 'Abyss environment passed: real seabed, three merged meshes, 60 placed stone colliders, long-step impacts, vertical contacts, 12/30/60/144 FPS swimming through both gateways, pillar recovery/photograph occlusion, asset placements and culling.', { triangles, vertices, features: environment.features.length } );

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
	const out = resolve( process.argv.find( a => a.startsWith( '--out=' ) )?.slice( 6 ) || '../deep-beast-lux3d/environment' ); mkdirSync( out, { recursive: true } );
	await L.save( out + '/seabed-garden.png' );
	assert.deepEqual( errors, [], 'Native main and shadow shader compilation has no validation errors' );
	console.log( 'Native environment draws:', L.mr.stats );
	await L.exit();

}
