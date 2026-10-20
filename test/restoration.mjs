import assert from 'node:assert/strict';
import { Scene, Group, Vector3, Quaternion, PerspectiveCamera } from '../src/engine/index.js';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { VoyageWorld } from '../src/world/VoyageWorld.js';
import { VoyageController } from '../src/game/VoyageController.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { Input } from '../src/core/Input.js';
import { Vendor } from '../src/game/Vendor.js';
import { freshVoyage, normalizeVoyage, RESTORATION_SITES, radioLogText } from '../src/game/Voyage.js';
import { mapLocations } from '../src/game/WorldMap.js';

const data = new Map(); let failSave = false;
const storage = { getItem: ( k ) => data.get( k ), setItem( k, v ) { if ( failSave ) throw new Error( 'quota' ); data.set( k, v ); } };
const state = new GameState( storage );
assert.equal( state.voyageAction( 'restore-start' ), false, 'new game must first open reef access' ); state.orderIndex = 2;
assert.equal( state.voyageAction( 'restore-site', { id: 'net' } ), false );
assert.equal( state.voyageAction( 'restore-report' ), false );
const invalid = normalizeVoyage( { restoration: { active: true, done: [ 'nursery', 'net', 'net', '__proto__' ], reported: true } } ).restoration;
assert.deepEqual( invalid, { active: true, done: [ 'net' ], reported: false } );
assert.deepEqual( normalizeVoyage( { restoration: { active: 'true', done: [ 'net' ] } } ).restoration, freshVoyage().restoration );

const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 ), terrain = new TerrainData();
const input = Object.assign( Object.create( Input.prototype ), { keys: new Set(), pressed: new Set(), enabled: true, focused: true, interrupted: false } );
const app = { scene: new Scene(), terrainData: terrain, colliders: new Colliders(), camera, input,
	player: { mode: 'boat', busy: false, position: new Vector3() }, boat: { group: new Group(), visualScale: new Vector3( 1, 1, 1 ) },
	boatCtl: { position: new Vector3(), quaternion: new Quaternion(), velocity: new Vector3() }, ui: { ui: {} }, settings: { timeOfDay: 12 } };
const marta = Object.assign( Object.create( Vendor.prototype ), { kind: 'shop', position: new Vector3( 50, 1, - 70 ), radius: 3 } );
const game = Object.assign( Object.create( Game.prototype ), { app, state, rod: { equipped: false }, chandlery: { vendor: marta },
	hud: { invOpen: false, standOpen: false, catchOpen: false }, worldMap: { open: false }, toast() {} } );
const world = new VoyageWorld( app ), controller = game.voyage = new VoyageController( game, { world } );
const hud = Object.assign( Object.create( GameHUD.prototype ), { game } );
assert.match( hud.radioMarkup(), /data-radio="restore-start"/ ); assert.match( hud.restorationMarkup( true ), /data-restoration="restore-start"/ );
assert.equal( mapLocations( game ).some( ( p ) => p.id.startsWith( 'restore-' ) ), false );
assert.equal( controller.command( 'restore-start' ), false ); game.hud.invOpen = true;
failSave = true; assert.equal( controller.command( 'restore-start' ), false ); assert.equal( state.voyage.restoration.active, false ); failSave = false;
assert.equal( controller.command( 'restore-start' ), true ); assert.equal( controller.command( 'restore-start' ), false ); game.hud.invOpen = false;
assert.equal( state.voyageAction( 'restore-site', { id: 'nursery' } ), false, 'nursery requires both cleanups first' );
assert.equal( state.voyageAction( 'restore-site', { id: '__proto__' } ), false );
assert.equal( mapLocations( game ).filter( ( p ) => p.id.startsWith( 'restore-' ) ).length, 3 );

const arrive = ( id ) => {

	const point = world.restoration.sites.get( id ).point;
	app.player.mode = 'swim'; app.player.position.copy( point ).add( new Vector3( 0, 0.35, - 2 ) );
	camera.position.copy( app.player.position ); camera.lookAt( point ); camera.updateMatrixWorld(); input.keys.add( 'KeyG' );

};
const tick = ( n ) => { for ( let i = 0; i < n; i ++ ) controller.update( 0.1 ); };
arrive( 'nursery' ); tick( 40 ); assert.equal( state.money, 0 ); assert.match( app.player.prompt.text, /先回收/ );
arrive( 'net' ); controller.update( 999 ); assert.equal( controller.workTime, 0.1, 'a lag spike cannot complete an underwater operation' );
tick( 12 ); assert.ok( controller.workTime > 1 ); input.keys.clear(); tick( 1 ); assert.equal( controller.workTime, 0 ); input.keys.add( 'KeyG' );
for ( const [ object, key, value ] of [ [ input, 'focused', false ], [ input, 'interrupted', true ], [ app.ui.ui, '_photo', true ],
	[ game.hud, 'invOpen', true ], [ game.worldMap, 'open', true ], [ app, 'freeCam', true ], [ game.rod, 'equipped', true ], [ game, 'rescueHold', 1 ] ] ) {

	tick( 10 ); const previous = object[ key ]; object[ key ] = value; tick( 40 ); assert.equal( controller.workTime, 0 );
	assert.deepEqual( state.voyage.restoration.done, [] ); object[ key ] = previous;

}
tick( 10 ); camera.lookAt( camera.position.clone().add( new Vector3( 0, 0, - 10 ) ) ); camera.updateMatrixWorld(); tick( 40 );
assert.equal( controller.workTime, 0, 'looking away stops work' ); arrive( 'net' );
tick( 10 ); app.player.position.x += 20; tick( 40 ); assert.equal( controller.workTime, 0, 'a nearby camera alone cannot operate a remote target' ); arrive( 'net' );
const actualRaycast = app.colliders.raycast; app.colliders.raycast = () => 0.1; tick( 40 ); assert.equal( controller.workTime, 0 ); app.colliders.raycast = actualRaycast;
failSave = true; tick( 31 ); assert.equal( state.money, 0 ); assert.deepEqual( state.voyage.restoration.done, [] );
assert.equal( world.restoration.sites.get( 'net' ).before.visible, true, 'failed storage cannot remove the actual net' ); failSave = false;
for ( const [ index, id ] of [ 'net', 'litter', 'nursery' ].entries() ) {

	arrive( id ); tick( 31 ); assert.equal( state.money, ( index + 1 ) * 20 );
	const site = world.restoration.sites.get( id ); assert.equal( site.before.visible, false ); assert.equal( site.after.visible, true ); assert.equal( site.school.visible, true );
	assert.equal( state.voyageAction( 'restore-site', { id } ), false ); assert.deepEqual( GameState.load( storage ).voyage, state.voyage );
	const initial = site.school.instanceMatrix.array.slice(); tick( 10 ); assert.notDeepEqual( site.school.instanceMatrix.array, initial, 'returning fish actually swim' );
	assert.ok( site.point.y < - 3 && site.point.y > terrain.heightAt( site.point.x, site.point.z ) );
	for ( let i = 0; i < 18; i ++ ) {

		const a = site.school.instanceMatrix.array, x = a[ i * 16 + 12 ] + site.root.position.x, y = a[ i * 16 + 13 ] + site.root.position.y, z = a[ i * 16 + 14 ] + site.root.position.z;
		assert.ok( y > terrain.heightAt( x, z ) + 0.3 && y < - 1, 'the recolonizing fish stay above the real seabed and underwater' );

	}

}
assert.equal( state.money, 60 ); assert.match( hud.restorationMarkup(), /回港找玛尔塔/ );
assert.ok( RESTORATION_SITES.every( ( site ) => /可回访/.test( mapLocations( game ).find( ( p ) => p.id === 'restore-' + site.id ).label ) ) );
assert.match( mapLocations( game ).find( ( p ) => p.id === 'restore-report' ).label, /玛尔塔汇报/ );
for ( const site of RESTORATION_SITES ) assert.equal( mapLocations( game ).find( ( p ) => p.id === 'restore-' + site.id ).y, world.restoration.sites.get( site.id ).point.y, 'Navigation uses the actual work target depth' );
assert.equal( game.talkRestoration( 'restore-report' ), false );
app.player.mode = 'walk'; app.player.position.copy( marta.position ); game.hud.standOpen = true; game.hud.vendor = marta;
game.hud.vendor = { ...marta }; assert.equal( game.talkRestoration( 'restore-report' ), false, 'a forged or different vendor cannot pay' ); game.hud.vendor = marta;
input.focused = false; assert.equal( game.talkRestoration( 'restore-report' ), false ); input.focused = true;
app.player.position.x += 10; assert.equal( game.talkRestoration( 'restore-report' ), false ); app.player.position.copy( marta.position );
failSave = true; assert.equal( game.talkRestoration( 'restore-report' ), false ); assert.equal( state.money, 60 ); assert.equal( state.voyage.restoration.reported, false ); failSave = false;
assert.equal( game.talkRestoration( 'restore-report' ), true ); assert.equal( state.money, 140 ); assert.equal( game.talkRestoration( 'restore-report' ), false );
assert.equal( mapLocations( game ).some( ( p ) => p.id === 'restore-report' ), false, 'Reporting removes the completed return objective' );
assert.match( hud.restorationMarkup( true ), /海湾守护者/ ); assert.doesNotMatch( hud.restorationMarkup( true ), /data-restoration=/ );
assert.ok( radioLogText( 'restore-report' ).includes( '$80' ) ); assert.deepEqual( GameState.load( storage ).voyage, state.voyage );

const loaded = GameState.load( storage ), reloaded = new VoyageWorld( app );
reloaded.restoration.update( 0, loaded.voyage.restoration );
for ( const site of reloaded.restoration.sites.values() ) { assert.equal( site.before.visible, false ); assert.equal( site.after.visible, true ); }
for ( const site of world.restoration.sites.values() ) site.root.traverse( ( obj ) => {

	for ( const attr of Object.values( obj.geometry?.attributes || {} ) ) assert.ok( attr.array.every( Number.isFinite ) );

} );
camera.position.set( 1000, 20, 1000 ); world.restoration.update( 0.1, state.voyage.restoration );
assert.ok( [ ...world.restoration.sites.values() ].every( ( site ) => ! site.root.visible ), 'distant scenes do not draw' );
state.reset(); assert.deepEqual( state.voyage.restoration, freshVoyage().restoration );
console.log( 'Restoration passed: complete radio-to-dive-to-harbor journey, prerequisites, continuous work and interruptions, atomic unique rewards, old/corrupt saves, persistent scenery, real fish motion and seabed, UI/map and distance culling.' );
