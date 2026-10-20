import assert from 'node:assert/strict';
import { Scene, Vector3, PerspectiveCamera, Ray } from '../src/engine/index.js';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { Vendor } from '../src/game/Vendor.js';
import { Input } from '../src/core/Input.js';
import { WreckScene } from '../src/world/WreckScene.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { CAVE_SITE, FIELD_SUBJECTS, normalizeExpedition, normalizeFieldPhotos, expeditionDialogue } from '../src/game/Expedition.js';
import { FieldCamera, subjectVisible } from '../src/game/FieldCamera.js';

const stored = new Map(), storage = { getItem: ( k ) => stored.get( k ), setItem: ( k, v ) => stored.set( k, v ) };
const state = new GameState( storage ); state.orderIndex = 2;
const original = JSON.parse( JSON.stringify( state.toJSON() ) );
for ( const e of [ undefined, null, {}, 'log', 'return' ] ) assert.equal( state.expeditionEvent( e ), false );
for ( const e of [ 'accept', 'bow', 'log', 'compass', 'return' ] ) {

	assert.equal( state.expeditionEvent( e ), true );
	assert.deepEqual( GameState.load( storage ).expedition, state.expedition );
	assert.equal( state.expeditionEvent( e ), false );

}
for ( const e of [ undefined, null, 'return', 'accept' ] ) assert.equal( state.expeditionEvent( e ), false );
assert.equal( state.money, original.money ); assert.deepEqual( state.story, original.story ); assert.deepEqual( state.seaJournal, original.seaJournal );
const image = 'data:image/jpeg;base64,' + 'AAAA'.repeat( 64 ), photo = { image, x: 1, y: - 5, z: 3, hour: 22 };
assert.equal( state.recordFieldPhoto( 'turtle', photo ), true );
assert.deepEqual( GameState.load( storage ).fieldPhotos.turtle, photo );
assert.equal( state.recordFieldPhoto( 'turtle', photo ), false );
assert.equal( state.recordFieldPhoto( 'toString', photo ), false );
for ( const value of [ { ...photo, image: '<img onerror=bad>' }, { ...photo, image: image + '!bad' }, { ...photo, image: 'data:image/jpeg;base64,' + 'A'.repeat( 60000 ) }, { ...photo, y: NaN } ] ) assert.deepEqual( normalizeFieldPhotos( { jelly: value } ), {} );
const blockedState = new GameState( { setItem() { throw new Error( 'quota' ); } } );
assert.equal( blockedState.recordFieldPhoto( 'jelly', photo ), false ); assert.deepEqual( blockedState.fieldPhotos, {} );
for ( const stage of [ 6, - 1, '3', 2.5, null ] ) assert.deepEqual( normalizeExpedition( { stage } ), { stage: 0 } );
const old = new GameState( null ); old.fromJSON( { v: 2, money: 200, story: { stage: 1 } } );
assert.deepEqual( old.expedition, { stage: 0 } ); assert.deepEqual( old.fieldPhotos, {} );
state.reset(); assert.equal( state.expedition.stage, 0 ); assert.deepEqual( state.fieldPhotos, {} );

const terrain = new TerrainData(), colliders = new Colliders();
const world = new WreckScene( { scene: new Scene(), terrain, colliders } );
assert.equal( world.assets.pending.size, 0, 'no extra model requests at the harbor' );
assert.equal( world.group.visible, false );
assert.ok( world.fallback.rock.geometry.boundingBox.max.y < - 1.5, 'rock cave remains below sea level' );
const ray = new Ray(), a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
const geometry = world.fallback.rock.geometry, p = geometry.attributes.position, ix = geometry.index.array;
for ( const x of [ - 1.1, 0, 1.1 ] ) for ( let dz = - 10; dz <= 10; dz += 1 ) {

	const pos = new Vector3( CAVE_SITE.x + x, terrain.heightAt( CAVE_SITE.x + x, CAVE_SITE.z + dz ) + 2.0, CAVE_SITE.z + dz );
	assert.equal( colliders.resolveCapsule( pos.clone(), 0.35, 1.0, 0 ), false, 'cave collision volumes preserve a complete swimming lane' );
	ray.set( pos, new Vector3( 0, 0, 1 ) );
	for ( let i = 0; i < ix.length; i += 3 ) {

		a.fromBufferAttribute( p, ix[ i ] ); b.fromBufferAttribute( p, ix[ i + 1 ] ); c.fromBufferAttribute( p, ix[ i + 2 ] );
		assert.ok( ! ray.intersectTriangle( a, b, c, false, hit ) || hit.distanceTo( pos ) > 1, 'actual cave triangles leave the sampled corridor open' );

	}

}
for ( let t = 0; t < 1800; t ++ ) {

	world.update( 0.1, { position: world.position } );
	for ( const point of world.jellyPositions ) assert.ok( point.y < - 2 && point.y > terrain.heightAt( point.x, point.z ) + 1.8, 'bounded drifting animals stay above seabed and underwater' );

}

const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 );
const input = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set() } );
const player = { mode: 'swim', position: new Vector3(), busy: false };
const ui = { _photo: false, helpOpen: false, panelOpen: false, _start: false, photoHint: { textContent: '' }, _pokePhotoHint() {} };
const joe = Object.assign( Object.create( Vendor.prototype ), { kind: 'buyer', position: new Vector3( 55, 1, - 70 ), radius: 3 } );
state.orderIndex = 2;
const game = Object.assign( Object.create( Game.prototype ), { state, stand: { vendor: joe }, rod: { equipped: false }, guide: { open: false },
	hud: { vendor: joe, standOpen: false, invOpen: false, catchOpen: false }, worldMap: { open: false }, messages: [], toast( s ) { this.messages.push( s ); },
	app: { player, camera, input, terrainData: terrain, colliders, wreckScene: world, ui: { ui }, boatCtl: { capsized: false }, settings: { timeOfDay: 12 } } } );
game.fieldCamera = new FieldCamera( game );
player.mode = 'walk'; player.position.copy( joe.position ); game.hud.standOpen = true;
assert.equal( game.talkExpedition( 'bow' ), false ); assert.equal( game.talkExpedition( 'accept' ), true );
assert.equal( game.talkExpedition( 'accept' ), false );
const arrive = ( point ) => { player.mode = 'swim'; player.position.copy( point ).add( new Vector3( 0, 0, - 2 ) ); camera.position.copy( player.position ).add( new Vector3( 0, 0.8, 0 ) ); camera.lookAt( point ); camera.updateMatrixWorld(); game.hud.standOpen = false; };
const press = () => { input.pressed.add( 'KeyG' ); game.updateExpedition(); input.endFrame(); };
for ( const stage of [ 1, 2 ] ) {

	state.expedition.stage = stage; arrive( world.targets[ stage === 1 ? 'bow' : 'log' ] );
	for ( const [ object, field, value ] of [ [ game.app, 'freeCam', true ], [ ui, '_photo', true ], [ ui, 'helpOpen', true ], [ ui, 'panelOpen', true ], [ input, 'focused', false ], [ input, 'enabled', false ], [ input, 'interrupted', true ], [ game, 'rescueHold', 1 ], [ player, 'mode', 'walk' ], [ game.app.boatCtl, 'capsized', true ] ] ) {

		const old = object[ field ]; object[ field ] = value; press(); assert.equal( state.expedition.stage, stage ); object[ field ] = old;

	}
	press(); assert.equal( state.expedition.stage, stage + 1, 'real underwater target and G advance in order' );

}
arrive( world.targets.compass ); press(); assert.equal( state.expedition.stage, 3, 'the compass requires visiting both cave entrances' );
for ( const dz of [ - 9, 9 ] ) { player.position.set( CAVE_SITE.x, terrain.heightAt( CAVE_SITE.x, CAVE_SITE.z + dz ) + 2, CAVE_SITE.z + dz ); game.updateExpedition(); }
assert.equal( game._caveVisits, 3 ); arrive( world.targets.compass ); press(); assert.equal( state.expedition.stage, 4 );
player.mode = 'walk'; player.position.copy( joe.position ); game.hud.standOpen = true;
assert.equal( expeditionDialogue( state, 'buyer' ).choices[ 0 ].id, 'return' );
assert.equal( game.talkExpedition( 'return' ), true ); assert.equal( game.talkExpedition( 'return' ), false );

const point = new Vector3( - 30, - 8, 100 );
camera.position.copy( point ).add( new Vector3( 0, 0, - 6 ) ); camera.lookAt( point ); camera.updateMatrixWorld();
assert.equal( subjectVisible( game.app, point, 12 ), true );
assert.equal( subjectVisible( game.app, point, 5 ), false );
const wall = colliders.addBox( camera.position.clone().lerp( point, 0.5 ), new Vector3( 2, 2, 0.3 ) );
assert.equal( subjectVisible( game.app, point, 12 ), false, 'photos cannot see through a solid wall' ); wall.solid = false;
camera.lookAt( camera.position.clone().add( new Vector3( 1, 0, 0 ) ) ); assert.equal( subjectVisible( game.app, point, 12 ), false );
camera.lookAt( point ); camera.updateMatrixWorld();
ui._photo = true; player.mode = 'swim'; game.hud.standOpen = false;
game.app.wreckScene = { position: point.clone().add( new Vector3( 0, - 2, 0 ) ), cavePosition: point.clone().add( new Vector3( 100, 0, 0 ) ), jellyPositions: [] };
const previous = globalThis.document;
globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => ( { drawImage() {} } ), toDataURL: () => image } ) };
game.app.engine = { canvas: { width: 1366, height: 768 } };
try {

	input.pressed.add( 'KeyG' ); game.fieldCamera.update( 0.1 ); input.endFrame();
	assert.equal( game.fieldCamera.pending, 'wreck' );
	assert.equal( game.fieldCamera.flush(), true ); assert.ok( state.fieldPhotos.wreck );
	assert.equal( game.fieldCamera.flush(), false, 'a single rendered photo cannot be recorded twice' );
	game.fieldCamera.pending = 'jelly'; input.focused = false;
	assert.equal( game.fieldCamera.flush(), false, 'losing focus before frame capture cancels the pending photo' );

} finally { globalThis.document = previous; input.focused = true; }
const hud = Object.assign( Object.create( GameHUD.prototype ), { game } );
assert.match( hud.fieldGuideMarkup(), /data:image\/jpeg/ ); assert.match( hud.fieldGuideMarkup(), /下载照片/ );
assert.match( hud.expeditionMarkup(), /已归港/ );
assert.equal( Object.keys( FIELD_SUBJECTS ).length, 13 );
console.log( 'Expedition passed: old saves, ordered story, real underwater inputs, both cave entrances/triangles/colliders, bounded wildlife, photo framing/occlusion, post-render capture, quota rollback, independent stories and HUD.' );
