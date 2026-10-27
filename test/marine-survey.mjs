import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { FIELD_SUBJECTS } from '../src/game/Expedition.js';
import { MARINE_SURVEYS, SURVEY_SITES, normalizeSurveyClaims, surveyProgress, surveyDestination, surveyTitles } from '../src/game/MarineSurvey.js';
import { FieldCamera, fieldSubjects, subjectVisible } from '../src/game/FieldCamera.js';
import { Scene, Vector3, PerspectiveCamera } from '../src/engine/index.js';
import { Reef } from '../src/world/Reef.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { mulberry32, Noise2D } from '../src/util/Noise.js';
import { Vendor } from '../src/game/Vendor.js';
import { mapLocations } from '../src/game/WorldMap.js';
import { Colliders } from '../src/world/Colliders.js';
import { ExplorationWorld } from '../src/world/ExplorationWorld.js';
import { LandmarksController } from '../src/game/LandmarksController.js';
import { Input } from '../src/core/Input.js';

const data = new Map(), storage = { getItem: ( key ) => data.get( key ), setItem: ( key, value ) => data.set( key, value ) };
const state = new GameState( storage ), image = 'data:image/jpeg;base64,' + 'AAAA'.repeat( 32 );
const photo = { image, x: - 50, y: - 8, z: 120, hour: 10 };
assert.deepEqual( normalizeSurveyClaims( [ 'unknown', 'wreck-life', 'wreck-life' ] ), [ 'wreck-life' ] );
assert.deepEqual( normalizeSurveyClaims( 'wreck-life' ), [] );
const old = new GameState( null ); old.fromJSON( { v: 2, money: 12 } ); assert.deepEqual( old.surveyClaims, [] );
for ( const id of [ 'toString', undefined, 'small-life' ] ) assert.equal( state.claimSurvey( id ), false );
for ( const id of Object.keys( FIELD_SUBJECTS ) ) assert.equal( state.recordFieldPhoto( id, photo ), true );
assert.equal( state.claimSurvey( 'small-life' ), false, 'photos cannot bypass locked grounds' );
state.orderIndex = 2;
assert.equal( state.claimSurvey( 'small-life' ), true ); assert.equal( state.money, 60 );
assert.equal( GameState.load( storage ).claimSurvey( 'small-life' ), false, 'reload cannot repeat a reward' );
assert.equal( state.claimSurvey( 'open-water' ), false );
assert.equal( state.claimSurvey( 'wreck-life' ), true ); state.orderIndex = 4;
assert.equal( state.claimSurvey( 'open-water' ), true ); assert.equal( state.money, 260 );
assert.equal( Object.keys( state.fieldPhotos ).length, Object.keys( FIELD_SUBJECTS ).length, 'surveys retain all photos' );
assert.equal( surveyProgress( state, 'small-life' ).ready, false );
assert.equal( state.claimSurvey( 'open-water' ), false );
const blocked = new GameState( { setItem() { throw new Error( 'quota' ); } } );
blocked.orderIndex = 2; blocked.fieldPhotos = { ...state.fieldPhotos }; blocked.money = 11;
assert.equal( blocked.claimSurvey( 'small-life' ), false ); assert.equal( blocked.money, 11 ); assert.deepEqual( blocked.surveyClaims, [] );
state.reset(); assert.deepEqual( state.surveyClaims, [] ); assert.deepEqual( state.fieldPhotos, {} );
state.orderIndex = 2; state.fieldPhotos = { starfish: photo, urchin: photo };
assert.equal( surveyProgress( state, 'small-life' ).count, 2 ); assert.equal( state.claimSurvey( 'small-life' ), false );
state.fieldPhotos.anemone = photo;

const marta = Object.assign( Object.create( Vendor.prototype ), { kind: 'shop', position: new Vector3( 85, 1, - 60 ), radius: 3 } );
const player = { mode: 'walk', position: marta.position.clone() }, input = { enabled: true, focused: true, interrupted: false };
const ui = {}, hud = { standOpen: true, vendor: marta, workshop: { isOpen: false } };
const game = Object.assign( Object.create( Game.prototype ), { state, hud, chandlery: { vendor: marta },
	app: { player, input, ui: { ui } }, messages: [], toast( text ) { this.messages.push( text ); } } );
for ( const [ object, key, value ] of [ [ player, 'mode', 'swim' ], [ input, 'focused', false ], [ input, 'interrupted', true ], [ hud, 'standOpen', false ],
	[ hud, 'vendor', { kind: 'buyer' } ], [ game.app, 'freeCam', true ], [ ui, '_photo', true ], [ ui, 'helpOpen', true ], [ hud, 'invOpen', true ], [ game, 'rescueHold', 1 ], [ hud.workshop, 'isOpen', true ] ] ) {

	const before = object[ key ]; object[ key ] = value; assert.equal( game.claimSurvey( 'small-life' ), false ); object[ key ] = before;

}
player.position.x += 10; assert.equal( game.claimSurvey( 'small-life' ), false ); player.position.copy( marta.position );
assert.equal( game.claimSurvey( 'small-life' ), true ); assert.equal( game.claimSurvey( 'small-life' ), false );
const view = Object.assign( Object.create( GameHUD.prototype ), { game } );
assert.match( view.marineSurveyMarkup(), /已归档/ );
state.surveyClaims = []; assert.match( view.marineSurveyMarkup( true ), /data-survey="small-life"/ );
assert.doesNotMatch( view.marineSurveyMarkup(), /data-survey=/, 'inventory never claims remote rewards' );

// Build the real placement pass without uploading its renderer buffers.
const terrain = new TerrainData();
const reef = Object.assign( Object.create( Reef.prototype ), { terrain, center: WORLD.reef.center.clone(), rng: mulberry32( 20260923 ),
	noise: new Noise2D( 4242 ), noise2: new Noise2D( 977 ), timings: {}, items: { hard: [], soft: [] } } );
reef.buildKinds(); reef.initFields(); reef.placeLayers(); reef.placeSurveySites();
const camera = new PerspectiveCamera( 62, 16 / 9, 0.05, 500 );
for ( const site of SURVEY_SITES ) {

	const entries = reef.surveySubjects.filter( ( s ) => s.id === site.id );
	assert.ok( entries.length >= 6 && entries.length <= 12, `${ site.id } has a visible cluster without forcing animals into occupied coral` );
	assert.ok( entries.every( ( s ) => reef.items.hard.includes( s.item ) && s.point.y < - 0.5 && s.point.y > terrain.heightAt( s.point.x, s.point.z ) - 0.3 ) );
	let visible = false;
	for ( const subject of entries ) {

		camera.position.copy( subject.point ).add( new Vector3( 0.5, 0.8, - 1.2 ) ); camera.lookAt( subject.point ); camera.updateMatrixWorld();
		visible ||= camera.position.y < - 1 && subjectVisible( { camera, terrainData: terrain, reef }, subject.point, FIELD_SUBJECTS[ site.id ].range );

	}
	assert.ok( visible, `${ site.id } has a genuinely visible target above the reef surface` );

}
assert.equal( fieldSubjects( { reef } ).filter( ( s ) => SURVEY_SITES.some( ( site ) => site.id === s.id ) ).length, reef.surveySubjects.length );
game.app.reef = reef;
assert.equal( mapLocations( game ).filter( e => SURVEY_SITES.some( site => e.id === 'survey-' + site.id ) ).length, 3 );

// A real coastal-photo journey: current world targets -> post-render capture ->
// next map destination -> merchant claim -> reload. Existing photos count too.
const archive = new Map(), coastalStorage = { getItem: key => archive.get( key ), setItem: ( key, value ) => archive.set( key, value ) };
const coastalState = new GameState( coastalStorage );
assert.equal( surveyDestination( coastalState, 'coastal-life' ), null );
assert.equal( coastalState.claimSurvey( 'coastal-life' ), false );
coastalState.orderIndex = 2;
const coastalInput = Object.assign( Object.create( Input.prototype ), { enabled: true, focused: true, interrupted: false, keys: new Set(), pressed: new Set(), look: { x: 0, y: 0 } } );
const coastalApp = { scene: new Scene(), camera, terrainData: terrain, colliders: new Colliders(), input: coastalInput,
	player: { mode: 'swim', position: new Vector3() }, ui: { ui: { _photo: true } }, settings: { timeOfDay: 12 }, engine: { canvas: { width: 1366, height: 768 } } };
const coastal = Object.assign( Object.create( Game.prototype ), { state: coastalState, app: coastalApp, rod: { equipped: false },
	hud: { standOpen: false, invOpen: false, catchOpen: false, vendor: marta }, chandlery: { vendor: marta }, messages: [], toast( text ) { this.messages.push( text ); } } );
coastal.landmarks = new LandmarksController( coastal, new ExplorationWorld( coastalApp ) );
const fieldCamera = new FieldCamera( coastal ), routeId = 'survey-route-coastal-life';
const route = () => mapLocations( coastal ).find( entry => entry.id === routeId );
const reloadState = new GameState( coastalStorage );
for ( const claimed of [ 'small-life', 'wreck-life', 'open-water' ] ) reloadState.surveyClaims.push( claimed );
assert.deepEqual( surveyTitles( reloadState ), [ '海湾观察员' ], 'adding a new commission retains the old title' );
const previousDocument = globalThis.document;
globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => ( { drawImage() {} } ), toDataURL: () => image } ) };
try {

	for ( const [ index, id ] of [ 'dolphin', 'moray', 'seahorse', 'whalebones' ].entries() ) {

		const target = fieldSubjects( coastalApp ).find( subject => subject.id === id ).point;
		assert.equal( surveyDestination( coastalState, 'coastal-life' ), 'coastal-' + id );
		assert.ok( Math.hypot( route().x - target.x, route().z - target.z ) < 0.001 );
		assert.match( route().label, new RegExp( `${ index } / 4` ) );
		camera.position.copy( target ).add( new Vector3( 0, id === 'dolphin' ? - 0.4 : 0.1, id === 'seahorse' ? 2 : 3 ) );
		camera.lookAt( target ); camera.updateMatrixWorld(); coastalApp.player.position.copy( camera.position );
		coastalInput.pressed.add( 'KeyG' ); fieldCamera.update( 1.1 ); coastalInput.endFrame();
		assert.equal( fieldCamera.pending, id, 'the actual visible world target is photographable: ' + id );
		assert.equal( fieldCamera.flush(), true );
		assert.equal( surveyProgress( coastalState, 'coastal-life' ).count, index + 1 );
		assert.match( coastal.messages.at( - 1 ), new RegExp( `海岸新邻居 ${ index + 1 }/4` ) );
		if ( index < 3 ) assert.equal( coastalState.claimSurvey( 'coastal-life' ), false );

	}
	assert.match( coastal.messages.at( - 1 ), /已集齐/ );
	assert.equal( surveyDestination( coastalState, 'coastal-life' ), 'marta' );
	assert.equal( route().x, mapLocations( coastal ).find( entry => entry.id === 'marta' ).x );
	assert.equal( route().underwater, undefined ); assert.match( route().label, /回港交付/ );
	const resumed = GameState.load( coastalStorage );
	assert.equal( surveyProgress( resumed, 'coastal-life' ).ready, true, 'saved photos count without photographing again' );
	const quota = new GameState( { setItem() { throw Error( 'full' ); } } );
	quota.orderIndex = 2; quota.fieldPhotos = { ...resumed.fieldPhotos }; quota.money = 9;
	assert.equal( quota.claimSurvey( 'coastal-life' ), false ); assert.equal( quota.money, 9 ); assert.deepEqual( quota.surveyClaims, [] );
	assert.equal( coastal.claimSurvey( 'coastal-life' ), false, 'photographs cannot claim rewards remotely' );
	coastalApp.player.mode = 'walk'; coastalApp.player.position.copy( marta.position ); coastalApp.ui.ui._photo = false;
	coastal.hud.standOpen = true;
	assert.equal( coastal.claimSurvey( 'coastal-life' ), true ); assert.equal( coastalState.money, 120 );
	assert.equal( route(), undefined, 'completed commission marker is removed' );
	assert.equal( GameState.load( coastalStorage ).claimSurvey( 'coastal-life' ), false );
	assert.equal( Object.keys( GameState.load( coastalStorage ).fieldPhotos ).length, 4 );
	assert.deepEqual( surveyTitles( coastalState ), [ '海岸寻影者' ] );
	assert.match( coastal.messages.at( - 1 ), /海岸寻影者/ );
	const coastalHUD = Object.assign( Object.create( GameHUD.prototype ), { game: coastal } );
	assert.match( coastalHUD.marineSurveyMarkup(), /海岸寻影者/ );
	assert.doesNotMatch( coastalHUD.marineSurveyMarkup(), /data-survey-route="coastal-life"/ );
	coastalState.surveyClaims = [];
	assert.match( coastalHUD.marineSurveyMarkup(), /data-survey-route="coastal-life"/ );
	assert.doesNotMatch( coastalHUD.marineSurveyMarkup(), /data-survey="coastal-life"/ );
	assert.match( coastalHUD.marineSurveyMarkup( true ), /data-survey="coastal-life"/ );
	const button = { dataset: { surveyRoute: 'coastal-life' } }; let clicked;
	coastal.navigateSurvey = id => { clicked = id; };
	coastalHUD.bindSurveyRoutes( { querySelectorAll: () => [ button ] } ); button.onclick();
	assert.equal( clicked, 'coastal-life', 'the rendered navigation button is bound' );

} finally { globalThis.document = previousDocument; }
console.log( 'Marine survey passed: habitats, photo framing, four-photo coastal journey, automatic next/return destinations, saved-photo reuse, merchant-only reward, duplicate/quota guards and retained titles.' );

if ( process.argv.includes( '--render' ) ) {

	await import( './smaa-shim.mjs' );
	globalThis.__assetFile = async () => { throw new Error( 'native reef-only inspection retains original animal geometry' ); };
	const { setupLife } = await import( './life-harness.mjs' );
	const L = await setupLife( { W: 1440, H: 900, ground: { center: [ - 95, 125 ], size: 145, res: 0.5 } } );
	const errors = []; L.GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
	const actual = new Reef( { scene: L.scene, terrain } );
	const out = resolve( '../marine-survey' ); mkdirSync( out, { recursive: true } );
	L.sky = [ 0.009, 0.04, 0.055, 1 ];
	for ( const site of SURVEY_SITES ) {

		const subject = actual.surveySubjects.find( ( s ) => s.id === site.id );
		L.camera.position.copy( subject.point ).add( new Vector3( 0.4, 0.65, - 0.9 ) ); L.camera.lookAt( subject.point );
		await L.run( 5, ( dt ) => actual.update( dt, L.camera.position ) ); await L.save( out + '/' + site.id + '.png' );

	}
	assert.deepEqual( errors, [], 'new habitat instances render through the original reef batch and animated materials' );
	console.log( 'Native marine survey passed:', L.mr.stats ); await L.exit();

}
