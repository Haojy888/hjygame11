import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GameState } from '../src/game/GameState.js';
import { Game } from '../src/game/Game.js';
import { GameHUD } from '../src/game/GameHUD.js';
import { FIELD_SUBJECTS } from '../src/game/Expedition.js';
import { MARINE_SURVEYS, SURVEY_SITES, normalizeSurveyClaims, surveyProgress } from '../src/game/MarineSurvey.js';
import { fieldSubjects, subjectVisible } from '../src/game/FieldCamera.js';
import { Scene, Vector3, PerspectiveCamera } from '../src/engine/index.js';
import { Reef } from '../src/world/Reef.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { mulberry32, Noise2D } from '../src/util/Noise.js';
import { Vendor } from '../src/game/Vendor.js';
import { mapLocations } from '../src/game/WorldMap.js';

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
assert.equal( Object.keys( state.fieldPhotos ).length, 9, 'surveys retain all photos' );
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
assert.equal( mapLocations( game ).filter( ( e ) => e.id.startsWith( 'survey-' ) ).length, 3 );
console.log( 'Marine survey passed: three real habitats, visible photo targets, nine saved categories, ground gates, one-time rewards, quota rollback, merchant proximity and input guards.', Object.fromEntries( SURVEY_SITES.map( ( site ) => [ site.id, reef.surveySubjects.filter( ( s ) => s.id === site.id ).length ] ) ) );

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
