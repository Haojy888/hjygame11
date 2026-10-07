// Two real hulls share the controller: metre-scale hydrostatics, pier access and human-size helm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, PerspectiveCamera, Scene, Vector3 } from '../src/engine/index.js';
import { StorageBuffer } from '../src/engine/gpu/Texture.js';
import { SkinnedModel } from '../src/engine/render/Skinning.js';
import { Input } from '../src/core/Input.js';
import { BoatController } from '../src/player/BoatController.js';
import { Player } from '../src/player/Player.js';
import { PlayerAvatar } from '../src/player/PlayerAvatar.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { Colliders } from '../src/world/Colliders.js';
import { buildPier } from '../src/world/Pier.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Rand } from '../src/world/Props.js';
import { WORLD } from '../src/world/WorldLayout.js';

// Keep the real character file, skeleton and animations; this regression needs no GPU.
StorageBuffer.prototype.write = function () {};
SkinnedModel.prototype._buildMeshes = async function () {

	this.materials = [ {}, {} ];
	this.meshes = [ 'body', 'head' ].map( ( name ) => { const mesh = new Group(); mesh.name = 'skinned:' + name; this.group.add( mesh ); return mesh; } );

};
globalThis.__assetFile = async () => {

	const bytes = readFileSync( new URL( '../public/models/characters/joe.glb', import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};

const terrain = { heightAt: () => - 4 };
const pier = new Colliders();
buildPier( { B: new Builder(), terrain, colliders: pier, rand: new Rand( () => 0.5 ), lights: [], inst: { add() {} } } );

function harness( Model ) {

	const query = {
		count: 1, cpuValid: false, version: 0, resultTime: 0, latency: 0.05,
		points: new Float32Array( 256 ), cpu: new Float32Array( 256 ), resultInputs: new Float32Array( 256 ),
		allocate( name, count ) { const start = this.count; this.count += count; return start; },
		setPoint( slot, x, z ) { this.points[ slot * 4 ] = x; this.points[ slot * 4 + 1 ] = z; },
		reply() { this.resultInputs.set( this.points ); this.cpuValid = true; this.version ++; this.resultTime += 1 / 60; },
	};
	const input = Object.assign( Object.create( Input.prototype ), {
		keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 }, wheel: 0, sensitivity: 1,
		enabled: true, focused: true, interrupted: false, mouseDown: false, rightDown: false,
	} );
	const model = new Model();
	const boat = new BoatController( { model, query, terrain, colliders: pier } );
	const camera = new PerspectiveCamera( 60, 16 / 9, 0.1, 1000 );
	const player = new Player( { camera, input, boat, query, terrain, colliders: pier } );
	return { model, boat, player, camera, input, query };

}

function advance( { boat, query }, frames, throttle = 0, steer = 0 ) {

	for ( let i = 0; i < frames; i ++ ) {

		boat.setInput( throttle, steer, 1 / 60 );
		boat.queueQueries();
		query.reply();
		boat.update( 1 / 60 );
		assert.ok( boat.isFinite(), 'The physics state remains finite' );
		assert.ok( new Vector3( 0, 1, 0 ).applyQuaternion( boat.quaternion ).y > 0.8, 'Routine flat-water driving cannot capsize' );

	}

}

const results = [];
for ( const Model of [ BoatModel, OffshoreBoatModel ] ) {

	const h = harness( Model );
	const { boat, player, model, camera, input } = h;
	const id = model.profileId;
	assert.deepEqual( model.group.scale.toArray(), [ 1, 1, 1 ], id + ': physics root cannot stretch the character' );
	const volume = model.hullSamples.reduce( ( sum, s ) => sum + s.area * - s.position.y, 0 );
	assert.ok( Math.abs( volume * 1025 - boat.mass ) < 1, id + ': floating displacement matches mass' );
	advance( h, 300 );
	assert.ok( boat.position.distanceTo( model.dock.position ) < 0.1, id + ': actual pier does not hit the moored hull' );
	assert.ok( Math.abs( boat.position.y ) < 0.03, id + ': waterline stays near its design level' );

	player.rescueToHarbor();
	assert.equal( pier.groundHeightAt( player.position.x, player.position.z, 3 ), WORLD.pier.deckHeight );
	assert.ok( player.nearBoat(), id + ': rescued player can board from the actual pier' );
	input.pressed.add( 'KeyE' );
	player.update( 1 / 60 );
	input.endFrame();
	assert.equal( player.mode, 'deck', id + ': the real E interaction boards' );
	const landing = player.deckPos.clone();
	player.updateDeck( 1 / 60 );
	assert.ok( player.deckPos.distanceTo( landing ) < 0.02, id + ': boarding position is clear of furniture' );
	const ashore = player.ashoreTarget();
	assert.ok( ashore, id + ': a reachable pier exit exists' );
	player.exitBoat( ashore );
	assert.equal( player.mode, 'walk' );
	const pierPos = player.position.clone();
	pier.resolveCapsule( pierPos, 0.3, 1.75 );
	assert.ok( pierPos.distanceTo( player.position ) < 0.01, id + ': pier landing clears rails and piles: ' + player.position.toArray() + ' -> ' + pierPos.toArray() );

	player.boardBoat();
	// Walk the actual central aisle; a correct helm anchor alone does not prove access.
	input.keys.add( 'KeyW' );
	for ( const target of [ new Vector3( 0, model.lines.deckY, model.boardPoint.z ), model.helmExit ] ) {

		for ( let frame = 0; frame < 300; frame ++ ) {

			const dx = target.x - player.deckPos.x, dz = target.z - player.deckPos.z;
			if ( Math.hypot( dx, dz ) < 0.05 ) break;
			player.deckYaw = Math.atan2( dx, dz );
			player.updateDeck( 1 / 60 );

		}
		assert.ok( Math.hypot( target.x - player.deckPos.x, target.z - player.deckPos.z ) < 0.06, id + ': furniture leaves a walkable route to the helm' );

	}
	input.keys.delete( 'KeyW' );
	player.deckVel.set( 0, 0, 0 );
	assert.equal( player.prompt?.text, '掌舵' );
	input.pressed.add( 'KeyE' );
	player.updateDeck( 1 / 60 );
	input.endFrame();
	assert.equal( player.mode, 'boat', id + ': helm anchor remains reachable beside the seat' );
	player.camMode = 'first';
	player.updateBoat( 1 / 60 );
	assert.ok( camera.position.distanceTo( boat.toWorld( model.helmEye, new Vector3() ) ) < 0.01 );
	player.setCameraMode( 'third' );
	player.updateBoat( 1 / 60 );
	assert.ok( Math.abs( camera.position.distanceTo( player.camTarget ) - model.chaseDistance ) < 1e-6, id + ': third person frames the full hull' );

	const app = { player, camera, scene: new Scene(), freeCam: false };
	const avatar = new PlayerAvatar( app );
	assert.equal( await avatar.ready, true );
	avatar.update( app, 1 / 60 );
	assert.ok( avatar.group.position.distanceTo( boat.toWorld( model.helmSeat, new Vector3() ) ) < 1e-6, id + ': the pilot stays in the actual seat' );
	assert.deepEqual( avatar.group.scale.toArray(), [ 1, 1, 1 ], id + ': pilot retains human proportions' );
	for ( const side of [ 'L', 'R' ] ) {

		const hand = avatar.model.nodeWorld( 'Bip01 ' + side + ' Hand', new Vector3() ).add( model.helmSeat );
		assert.ok( hand.distanceTo( model.wheelPivot.position ) < 0.4, id + ': hands can reach the normal-size wheel' );

	}
	player.leaveHelm();
	const besideSeat = player.deckPos.clone();
	player.updateDeck( 1 / 60 );
	assert.ok( player.deckPos.distanceTo( besideSeat ) < 0.02, id + ': leaving the helm does not eject player from furniture' );
	player.deckPos.set( 0, 4, model.deckForwardLimit + 1 );
	player.updateDeck( 1 / 60 );
	assert.equal( player.deckPos.z, model.deckForwardLimit, id + ': deck bow bounds match this hull' );

	// Simulate open sea separately from the quay: full throttle, then a sustained turn.
	boat.reset();
	boat.position.set( 200, 0, 200 );
	boat.driven = true;
	boat.moored = false;
	advance( h, 600, 1 );
	const speed = boat.speed, yaw = boat.getYaw();
	assert.ok( speed > 5 && speed < 16, id + ': engine can drive the displacement without overspeed' );
	advance( h, 300, 0.7, 0.8 );
	assert.ok( Math.abs( Math.atan2( Math.sin( boat.getYaw() - yaw ), Math.cos( boat.getYaw() - yaw ) ) ) > 0.2, id + ': rudder turns the larger inertia' );

	boat.capsized = true;
	player.mode = 'boat';
	player.exitBoat();
	assert.equal( player.mode, 'swim' );
	assert.ok( Math.hypot( player.position.x - boat.position.x, player.position.z - boat.position.z ) > model.dimensions.beam / 2 + 0.5, id + ': capsize escape clears the hull' );
	boat.reset();
	assert.ok( boat.position.equals( model.dock.position ), id + ': rescue returns to its own berth' );
	assert.ok( boat.mooring.anchor.equals( model.dock.position ) );
	results.push( { id, mass: boat.mass, thrust: boat.baseMaxThrust, speed: Number( speed.toFixed( 2 ) ) } );

}

assert.ok( results[ 1 ].mass > results[ 0 ].mass * 2 );
assert.ok( results[ 1 ].thrust > results[ 0 ].thrust * 2 );
assert.ok( Math.abs( results[ 0 ].speed - results[ 1 ].speed ) < 1, 'The larger engine keeps loaded acceleration useful' );
console.log( 'Boat profiles passed: real hull buoyancy, pier boarding and landing, helm reach and character scale, framing, propulsion, steering and rescue.', results );
