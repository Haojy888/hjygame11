// Actual station, player and both boat models: swim -> ladder -> platform -> repair and collision regressions.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3, Box3 } from '../src/engine/index.js';
import { Colliders } from '../src/world/Colliders.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { VoyageWorld } from '../src/world/VoyageWorld.js';
import { Player } from '../src/player/Player.js';
import { BoatController } from '../src/player/BoatController.js';
import { Input } from '../src/core/Input.js';
import { GameState } from '../src/game/GameState.js';
import { VoyageController } from '../src/game/VoyageController.js';
import { STATION } from '../src/game/Voyage.js';
import { HOUSE, wallX } from '../src/world/boat/Wheelhouse.js';
import { buildPier } from '../src/world/Pier.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { Rand } from '../src/world/Props.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
function harness( Model = OffshoreBoatModel ) {

	const model = new Model(), colliders = new Colliders(), terrain = { heightAt: () => - 6 };
	const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 }, wheel: 0 } );
	const query = { count: 0, cpuValid: true, cpu: new Float32Array( 256 ), resultInputs: new Float32Array( 256 ),
		allocate( name, count ) { const slot = this.count; this.count += count; return slot; },
		setPoint( slot, x, z ) { this.resultInputs[ slot * 4 ] = x; this.resultInputs[ slot * 4 + 1 ] = z; } };
	const boatCtl = new BoatController( { model, terrain, colliders, query } );
	boatCtl.position.set( 200, 0, 200 ); boatCtl.apply();
	const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 );
	const player = new Player( { camera, input, terrain, colliders, query, boat: boatCtl } );
	const state = new GameState( { setItem() {} } ); state.orderIndex = 2;
	const scene = new Scene(); scene.add( model.group );
	const app = { scene, terrainData: terrain, colliders, camera, input, player, boat: model, boatCtl, gameState: state, ui: { ui: {} }, weather: { thunderstorm: false } };
	const world = new VoyageWorld( app ); world.waterSlot = - 1;
	const game = { app, state, rod: { equipped: false }, toast() {}, hour: 12 };
	const controller = new VoyageController( game, { world } );
	const frame = ( dt = 1 / 60 ) => { player.update( dt ); input.endFrame(); };
	return { model, colliders, player, input, frame, world, state, app, controller };

}
const h = harness();
const ladder = h.colliders.boxes.find( b => b.tag === 'ladder' );
const platform = h.colliders.boxes.find( b => b.tag === 'observatory-platform' );
assert.equal( platform.walkable, true ); assert.equal( platform.top, h.world.stationDeckY );
for ( const fps of [ 12, 30, 60, 144 ] ) {

	h.player.climbing = null; h.player.mode = 'swim'; h.player.position.copy( h.world.stationLadder ); h.player.velocity.set( 0, 0, 0 );
	h.input.keys.add( 'Space' );
	for ( let i = 0; i < fps * 5 && h.player.mode !== 'walk'; i ++ ) h.frame( 1 / fps );
	h.input.keys.clear();
	assert.equal( h.player.mode, 'walk', fps + ' FPS: the ladder reaches the platform above the float clamp' );
	assert.ok( h.player.position.distanceTo( ladder.climbTo ) < 0.001, 'land on this station, never at the harbor' );
	const clear = h.player.position.clone(); h.colliders.resolveCapsule( clear, 0.3, 1.75 );
	assert.ok( clear.distanceTo( h.player.position ) < 0.001, 'the landing clears the console, house and piles' );
	for ( let i = 0; i < fps; i ++ ) h.frame( 1 / fps );
	assert.ok( Math.abs( h.player.position.y - platform.top ) < 0.001, 'the player stays on the visible platform' );

}
h.player.mode = 'swim'; h.player.position.copy( h.world.stationLadder ); h.input.keys.add( 'Space' );
for ( let i = 0; i < 40; i ++ ) h.frame();
assert.ok( h.player.climbing ); const pausedY = h.player.position.y; h.input.keys.clear();
for ( let i = 0; i < 20; i ++ ) h.frame();
assert.equal( h.player.position.y, pausedY, 'releasing the climb key holds the ladder' );
h.input.keys.add( 'KeyS' ); h.frame(); h.input.keys.clear();
assert.equal( h.player.climbing, null, 'S releases the ladder' );
h.player.climbing = ladder; h.player.rescueToHarbor(); assert.equal( h.player.climbing, null, 'rescue clears a pending climb' );

h.player.mode = 'walk'; h.player.position.copy( ladder.climbTo ); h.state.voyage.station = 3;
h.app.camera.position.copy( h.player.position ).add( V( 0, 1.62, 0 ) ); h.app.camera.lookAt( h.world.targets.repair ); h.app.camera.updateMatrixWorld();
h.app.boatCtl.velocity.set( 3, 0, 0 ); // a drifting boat must not block a person already on the platform
h.input.pressed.add( 'KeyG' ); h.app.weather.thunderstorm = true; h.controller.stationInteraction();
assert.equal( h.state.voyage.station, 3 ); h.app.weather.thunderstorm = false; h.controller.stationInteraction();
assert.equal( h.state.voyage.station, 4, 'the real on-foot controller interaction completes repair' ); h.input.endFrame();

// A blocked exit cannot teleport the player through furniture or a wall.
const blocked = h.colliders.addBox( ladder.climbTo.clone().add( V( 0, 0.8, 0 ) ), V( 0.5, 0.8, 0.5 ) );
h.player.mode = 'swim'; h.player.climbing = ladder; h.player.position.set( ladder.center.x, platform.top - 0.01, ladder.center.z );
h.input.keys.add( 'Space' ); h.frame(); h.input.keys.clear();
assert.equal( h.player.mode, 'swim' ); assert.equal( h.player.climbing, ladder ); assert.match( h.player.prompt.text, /受阻/ );
h.colliders.boxes.splice( h.colliders.boxes.indexOf( blocked ), 1 );

buildPier( { B: new Builder(), terrain: h.app.terrainData, colliders: h.colliders, rand: new Rand( () => 0.5 ), lights: [], inst: { add() {} } } );
const pierLadder = h.colliders.boxes.find( b => b.tag === 'ladder' && b.climbTo.z < 100 );
h.player.climbing = null; h.player.mode = 'swim'; h.player.position.copy( pierLadder.center ).setY( 0 ); h.input.keys.add( 'Space' );
for ( let i = 0; i < 300 && ( h.player.mode !== 'walk' || h.player.climbing || h.player.position.distanceTo( pierLadder.climbTo ) > 0.01 ); i ++ ) h.frame();
h.input.keys.clear();
assert.equal( h.player.mode, 'walk' ); assert.ok( h.player.position.distanceTo( pierLadder.climbTo ) < 0.01, 'the existing harbor ladder still lands at its own pier' );

const obstacles = new Colliders();
obstacles.addBox( V( 0, 1, 0 ), V( 0.006, 1, 2 ) );
const walker = V( - 0.8, 0, 0 ); obstacles.moveCapsule( walker, V( 1.6, 0, 0 ), 0.3, 1.75 );
assert.ok( walker.x <= - 0.306 + 0.00001, 'a long frame cannot tunnel across a thin wall' );
const ceilings = new Colliders(); ceilings.addBox( V( 0, 2.05, 0 ), V( 2, 0.05, 2 ) );
const jumper = V(); ceilings.moveCapsule( jumper, V( 0, 1, 0 ), 0.3, 1.75 );
assert.ok( Math.abs( jumper.y - 0.25 ) < 0.00001 && Math.hypot( jumper.x, jumper.z ) === 0, 'head contact stops upward movement without sideways ejection' );
const faller = V( STATION.x + 1.3, 4.5, STATION.z - 2.1 ); h.colliders.moveCapsule( faller, V( 0, - 4, 0 ), 0.3, 1.75 );
assert.ok( Math.abs( faller.y - platform.top ) < 0.001, 'a fast descent lands on the platform' );

for ( const Model of [ BoatModel, OffshoreBoatModel ] ) {

	const b = harness( Model ), { player, model, world, state, input } = b;
	world.update( 0, state.voyage, state, 12 );
	assert.equal( world.collection.visible, false ); assert.equal( world.photoMount.visible, false );
	assert.equal( world.collectionCollider.solid, false, 'an empty display is absent visually and physically' );
	state.voyage.salvaged = [ 'bell', 'compass', 'instrument' ]; state.voyage.display = 'instrument';
	world.update( 0, state.voyage, state, 12 ); assert.equal( world.collectionCollider.solid, true );
	model.group.updateMatrixWorld( true );
	const inverse = model.group.matrixWorld.clone().invert();
	const bounds = new Box3();
	world.photoMount.traverse( object => {

		const points = object.geometry?.attributes.position; if ( ! points ) return;
		for ( let i = 0; i < points.count; i ++ ) {

			const p = V().fromBufferAttribute( points, i ).applyMatrix4( object.matrixWorld ).applyMatrix4( inverse ); bounds.expandByPoint( p );
			const wall = -( wallX( model.baseLines, p.z / model.visualScale.z, p.y ) - HOUSE.wallT ) * model.visualScale.x;
			assert.ok( p.x > wall + 0.005, model.profileId + ': every frame vertex stays in front of the curved inner wall' );

		}

	} );
	assert.ok( bounds.max.y < HOUSE.winBottom && bounds.max.z < 0.265 * model.visualScale.z, 'the small photograph clears the window and tide chart' );
	assert.ok( world.collection.position.z > 0, 'the display no longer occupies the aft barrel/rope area' );
	for ( const id of state.voyage.salvaged ) {

		state.voyage.display = id; world.update( 0, state.voyage, state, 12 ); model.group.updateMatrixWorld( true );
		world.collection.traverse( object => {

			const points = object.geometry?.attributes.position; if ( ! points || ! object.visible ) return;
			for ( let i = 0; i < points.count; i ++ ) {

				const p = V().fromBufferAttribute( points, i ).applyMatrix4( object.matrixWorld ).applyMatrix4( inverse );
				const wall = -( wallX( model.baseLines, p.z / model.visualScale.z, p.y ) - HOUSE.wallT ) * model.visualScale.x;
				assert.ok( p.x > wall + 0.005, id + ': bracket and collectible do not penetrate the cabin wall' );
				assert.ok( p.z > 0 && p.x < model.helmSeat.x - 0.24 * model.visualScale.x, id + ': all three collectibles clear the barrel and helm seat' );

			}

		} );

	}
	player.boardBoat( V( 0, model.lines.deckY, 0.2 ) ); input.pressed.add( 'Space' );
	let highest = player.deckPos.y;
	for ( let i = 0; i < 180; i ++ ) { player.updateDeck( 1 / 60 ); input.endFrame(); highest = Math.max( highest, player.deckPos.y ); }
	assert.ok( highest + 1.75 <= HOUSE.roofUnderY + 0.00001, model.profileId + ': jumping cannot push the head through the roof' );
	assert.ok( Math.abs( player.deckPos.x ) < 0.001, 'head contact does not eject the player sideways' );
	if ( model.profileId === 'offshore' ) {

		player.deckPos.set( 0, model.lines.deckY, - 3.9 ); player.deckYaw = - Math.PI / 2; input.keys.add( 'KeyW' );
		for ( let i = 0; i < 180; i ++ ) player.updateDeck( 1 / 12 ); input.keys.clear();
		assert.ok( player.deckPos.x >= - 0.68 - 0.00001, 'the winch blocks walking through its post and motor' );
		assert.ok( world.hookPoint.y + 0.07 < 2.48, 'the boom clears the canopy side beam' );

	}

}
console.log( 'Scene access passed: 12/30/60/144 FPS station climbing/landing, pause/cancel/rescue, on-foot repair, blocked exits, thin walls, floor/ceiling sweeps, both hull displays and winch collision.' );
