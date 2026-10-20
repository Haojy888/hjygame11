// Real swimmer + terrain + animated octopus: the visible belly must stay solid.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Quaternion, Vector3 } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { DeepBeast } from '../src/world/DeepBeast.js';
import { AbyssScene } from '../src/world/AbyssScene.js';
import { Player } from '../src/player/Player.js';
import { Input } from '../src/core/Input.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { subjectVisible } from '../src/game/FieldCamera.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const terrain = new TerrainData(), colliders = new Colliders(), scene = new Scene();
const beast = new DeepBeast( { scene, terrain, colliders } );
new AbyssScene( { scene, terrain, colliders } ); // same combined collision world as App
const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, sensitivity: 1, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 }, wheel: 0 } );
const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 );
const query = { allocate: () => 0, cpuValid: false, setPoint() {} };
const boat = { position: V( 1000, 0, 0 ), quaternion: new Quaternion(), model: { chaseDistance: 13, boardPoint: V() },
	toWorld( p, out ) { return out.copy( p ).add( this.position ); } };
const player = new Player( { camera, input, terrain, colliders, query, boat } );
const toWorld = p => p.clone().applyQuaternion( beast.mesh.quaternion ).add( beast.creaturePosition );
const toSkin = p => {

	const local = p.clone().sub( beast.creaturePosition ).applyQuaternion( beast.mesh.quaternion.clone().conjugate() );
	local.y -= beast.wake * 0.28;
	return local.divideScalar( 1 + 0.008 * Math.sin( beast.time * 0.48 ) );

};
function outsideSkin( label ) {

	// Independent analytic geometry of the original head and sheared mantle,
	// sampled along the real swimmer and at the final first-person camera.
	for ( const point of [ player.position, player.position.clone().add( V( 0, 0.5, 0 ) ), player.position.clone().add( V( 0, 0.9, 0 ) ), camera.position ] ) {

		const p = toSkin( point );
		const belly = ( p.x / 3.1 ) ** 2 + ( ( p.y - 3.5 ) / 2.25 ) ** 2 + ( ( p.z - 1.5 ) / 2.9 ) ** 2;
		const mantle = ( p.x / 3.65 ) ** 2 + ( ( p.y - 6 ) / 4.7 ) ** 2 + ( ( p.z + 1.7 + ( p.y - 6 ) * 0.17 ) / 4 ) ** 2;
		assert.ok( belly >= 1 && mantle >= 1, label + ': swimmer and camera stay outside the visible body' );

	}
	assert.ok( player.position.y >= terrain.heightAt( player.position.x, player.position.z ) + 0.249, label + ': not pushed through the seabed' );

}
function reset( local ) {

	player.mode = 'swim'; player.floating = false; player.climbing = null; player._camY = null;
	player.position.copy( toWorld( local ) ); player.velocity.set( 0, 0, 0 ); input.keys.clear();
	camera.position.copy( player.position ).add( V( 0, 0.162, 0 ) );

}
assert.equal( colliders.ellipsoids.length, 4 );
assert.equal( colliders.capsules.length, 8 * 38 );
const count = colliders.capsules.length;
const megaliths = colliders.boxes.filter( b => b.tag === 'abyss-megalith' );
assert.equal( megaliths.length, 9, 'all nine visible outer megaliths block the swimmer' );
const stoneCentres = megaliths.map( b => b.center.clone() );
for ( const stone of megaliths ) {

	const direction = V( Math.sin( stone.rotY ), 0, Math.cos( stone.rotY ) );
	const p = stone.center.clone().addScaledVector( direction, - stone.half.z - 2 ); p.y -= 0.5;
	colliders.moveCapsule( p, direction.clone().multiplyScalar( stone.half.z * 2 + 4 ), 0.3, 1, 0 );
	assert.ok( p.clone().sub( stone.center ).dot( direction ) <= - stone.half.z - 0.299, 'the actual placed megalith stops a long swim step' );

}
const frameCosts = [];
const approaches = [ V( 0, 3.5, 12 ), V( 0, 6, - 12 ), V( 12, 6, - 1.7 ), V( - 12, 6, - 1.7 ), V( 0, 16, - 1.7 ), V( 0, - 1, - 1.7 ) ];
for ( const fps of [ 12, 30, 60, 144 ] ) for ( const [ side, start ] of approaches.entries() ) {

	reset( start ); input.keys.add( 'KeyW' ); input.keys.add( 'ShiftLeft' );
	for ( let i = 0; i < fps * 8; i ++ ) {

		const started = performance.now();
		beast.update( 1 / fps, camera, player ); // same order as App._frame
		const target = toWorld( side === 0 ? V( 0, 3.5, 1.5 ) : V( 0, 6, - 1.7 ) );
		const dir = target.sub( player.position ).normalize();
		player.yaw = Math.atan2( - dir.x, - dir.z ); player.pitch = Math.asin( dir.y );
		player.update( 1 / fps ); input.endFrame();
		frameCosts.push( performance.now() - started ); outsideSkin( fps + ' FPS approach ' + side );

	}
	assert.ok( player.position.distanceTo( toWorld( V( 0, 6, - 1.7 ) ) ) < 10, `the body can still be approached closely: ${ fps } FPS side ${ side }, local ${ JSON.stringify( toSkin( player.position ) ) }` );

}

// Saved/free-camera positions inside the belly recover on the next normal
// swimmer update; no harbor teleport, freeze or repeated accumulating colliders.
const interior = [ V( 0, 3.5, 1.5 ), V( 0, 6, - 1.7 ) ];
for ( const x of [ - 2, 0, 2 ] ) for ( const y of [ 2, 3.5, 6, 8 ] ) for ( const z of [ - 2, 0, 2 ] ) interior.push( V( x, y, z ) );
for ( const local of interior ) {

	reset( local ); beast.update( 1 / 60, camera, player ); player.update( 1 / 60 );
	outsideSkin( 'inside recovery' ); assert.ok( player.position.distanceTo( beast.creaturePosition ) < 12 );

}
assert.equal( colliders.capsules.length, count );

beast.patrolPhase = 0; beast.time = 0; beast.wake = 1; beast._moveCreature();
reset( V( 4.55, 6, - 1.7 ) ); const beforePatrol = player.position.clone();
for ( let i = 0; i < 1200; i ++ ) {

	beast.update( 1 / 30, camera, player ); player.update( 1 / 30 ); outsideSkin( 'stationary swimmer in patrol path' );

}
assert.ok( player.position.distanceTo( beforePatrol ) > 1.5, 'a moving body displaces an idle swimmer instead of passing through' );
assert.deepEqual( megaliths.map( b => b.center ), stoneCentres, 'megalith collision stays anchored while the octopus patrols' );

// Every deformed arm ring is covered by nearby rounded links, including the
// thin curled tips. Compare actual source skin, not duplicated collider data.
const positions = beast.model.geometry.attributes.position, aux = beast.model.geometry.attributes.aux;
for ( const phase of [ 0, 0.9, 2.1, 4.8 ] ) {

	beast.patrolPhase = phase; beast.time = phase * 19; beast.wake = phase === 0 ? 0 : 1; beast.reaction.w = phase === 0 ? 0 : 1; beast._moveCreature();
	// First two merged geometries are the 72x48 mantle and 24x16 head.
	for ( let i = 0; i < 73 * 49 + 25 * 17; i ++ ) {

		const p = V().fromBufferAttribute( positions, i ).multiplyScalar( 1 + 0.008 * Math.sin( beast.time * 0.48 ) );
		p.y += beast.wake * 0.28; p.applyQuaternion( beast.mesh.quaternion ).add( beast.creaturePosition );
		assert.ok( colliders.ellipsoids.slice( 0, 2 ).some( shape => {

			const local = p.clone().sub( shape.center ).applyQuaternion( shape.inverse );
			return ( local.x / shape.radii.x ) ** 2 + ( local.y / shape.radii.y ) ** 2 + ( local.z / shape.radii.z ) ** 2 <= 1.00001;

		} ), 'the solid contains the actual ridged mantle and belly skin' );

	}
	for ( let i = 0; i < positions.count; i += 3 ) {

		const arm = aux.getW( i ); if ( arm < 1 || aux.getZ( i ) !== 0 ) continue;
		const id = Math.floor( arm ) - 1, t = ( arm % 1 ) / 0.9, angle = id * Math.PI / 4 + Math.PI / 8;
		const w = t * t * ( 0.15 + beast.wake * 0.85 ), wave = Math.sin( beast.time * 0.65 - t * 5 + id * 1.7 );
		const p = V().fromBufferAttribute( positions, i );
		p.x += Math.cos( angle ) * wave * 0.65 * w;
		p.y += ( Math.sin( beast.time * 0.48 - t * 4 + id ) * 0.35 + beast.wake * 0.65 ) * w * w;
		p.z -= Math.sin( angle ) * wave * 0.65 * w;
		const fold = beast.reaction.w * t * t;
		p.x *= 1 - fold * 0.22; p.z *= 1 - fold * 0.22; p.y += fold * beast.guardLift;
		p.applyQuaternion( beast.mesh.quaternion ).add( beast.creaturePosition );
		assert.ok( p.y > terrain.heightAt( p.x, p.z ), 'folding arms clear the actual sloping seabed' );
		let clearance = Infinity;
		for ( const segment of colliders.capsules.slice( id * 38, ( id + 1 ) * 38 ) ) {

			const d = segment.end.clone().sub( segment.start ), offset = p.clone().sub( segment.start );
			const u = Math.max( 0, Math.min( 1, offset.dot( d ) / d.lengthSq() ) );
			clearance = Math.min( clearance, p.distanceTo( segment.start.clone().addScaledVector( d, u ) ) - segment.radius );

		}
		assert.ok( clearance <= 0.005, 'animated arm skin stays within its collision links: ' + clearance );

	}
	// Push into each thick arm rather than just asserting collider registration.
	for ( const arm of beast._collisionArms ) {

		const middle = arm.points[ 15 ].world;
		const p = middle.clone().add( V( 0, 4, 0 ) );
		colliders.moveCapsule( p, V( 0, - 4, 0 ), 0.3, 1, 0 );
		assert.ok( p.distanceTo( middle ) > 0.45, 'a long descent cannot tunnel into a tentacle' );

	}

}

// Stand off the face: collision must preserve the existing photograph and
// six-second story observation. No invisible wall across the whole encounter.
reset( V( 0, 6, 12 ) );
const unchanged = player.position.clone(); colliders.resolveCapsule( player.position, 0.3, 1, 0 );
assert.ok( player.position.distanceTo( unchanged ) < 1e-8 );
const state = new GameState( null ); state.orderIndex = 4;
state.seaJournalEvent( 'accept' ); state.seaJournalEvent( 'ruins' );
const app = { player, camera, input, deepBeast: beast, colliders, terrainData: terrain, ui: { ui: {} } };
const game = Object.assign( Object.create( Game.prototype ), { app, state, rod: { equipped: false }, toast() {} } );
for ( let i = 0; i < 420; i ++ ) {

	beast.update( 1 / 60, camera, player ); player.update( 1 / 60 );
	camera.lookAt( game.seaJournalTarget ); camera.updateMatrixWorld( true );
	game.updateSeaJournal( 1 / 60 ); input.endFrame(); outsideSkin( 'observation' );

}
assert.equal( game.seaObservation.ready, true );
assert.ok( subjectVisible( app, game.seaJournalTarget, 24 ), 'body collision does not self-occlude the elder photograph' );
input.pressed.add( 'KeyG' ); game.updateSeaJournal( 1 / 60 );
assert.equal( state.seaJournal.stage, 3, 'record the actual elder outside its body' );
console.log( 'Deep beast collision passed: real swimmer at 12/30/60/144 FPS, six body approaches, inside recovery, animated eight-arm coverage, long-step impacts, close observation and photography.' );
frameCosts.sort( ( a, b ) => a - b );
console.log( 'CPU encounter update (creature pose + player, no rendering):', { frames: frameCosts.length, p95Ms: Number( frameCosts[ Math.floor( frameCosts.length * 0.95 ) ].toFixed( 3 ) ) } );
