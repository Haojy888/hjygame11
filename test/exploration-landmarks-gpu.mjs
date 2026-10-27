// Native engine acceptance views with the real FFT ocean, terrain and original wreck assets.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './smaa-shim.mjs';
import { makeOceanScene } from './ocean-scene.mjs';
import { groundMesh } from './life-harness.mjs';
import { GPU } from '../src/engine/gpu/GPU.js';
import { G } from '../src/core/Globals.js';
import { Vector3 } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Colliders } from '../src/world/Colliders.js';
import { ExplorationWorld } from '../src/world/ExplorationWorld.js';
import { WreckScene } from '../src/world/WreckScene.js';
import { LIGHTHOUSE as L } from '../src/game/ExplorationLandmarks.js';
import { LocalLights, localLightsModule } from '../src/materials/LocalLights.js';
import { SceneLighting } from '../src/materials/SceneLighting.js';
import { readTexture } from '../src/engine/gpu/Readback.js';

const out = resolve( process.argv[ 2 ] || '../../work/exploration-render' ); mkdirSync( out, { recursive: true } );
globalThis.__assetFile = url => {

	const data = readFileSync( new URL( '../public/' + String( url ).replace( /^\//, '' ), import.meta.url ) );
	return data.buffer.slice( data.byteOffset, data.byteOffset + data.byteLength );

};
const ocean = await makeOceanScene( { W: 1280, H: 800, terrain: false, floor: false } );
const errors = []; GPU.device.addEventListener( 'uncapturederror', e => errors.push( e.error.message ) );
const terrain = new TerrainData(), colliders = new Colliders(), lights = new LocalLights();
SceneLighting.set( 'localLights', localLightsModule );
ocean.scene.add( groundMesh( terrain, - 40, 220, 610, 3 ) );
const app = { scene: ocean.scene, camera: ocean.camera, terrainData: terrain, colliders, localLights: lights, player: { mode: 'swim' } };
const world = new ExplorationWorld( app ), wreck = new WreckScene( { scene: ocean.scene, terrain, colliders } );
for ( const id of wreck.assets.ids ) assert.equal( await wreck.assets.load( id ), true );
assert.equal( await world.lighthouseAssets.load( 'lighthouse' ), true, 'Use the actual generated lighthouse' );
for ( const id of world.life.assets.ids ) assert.equal( await world.life.assets.load( id ), true, id + ': actual generated animal is required' );
world.update( 2, true );
world.life.updateAssets( 2 );
assert.equal( world.lighthouseFade, 1 ); assert.equal( world.baseShell.visible, false );
const V = ( x, y, z ) => new Vector3( x, y, z );
const views = [
	[ 'lighthouse', V( L.x + 32, 16, L.z + 40 ), V( L.x, 11, L.z ) ],
	[ 'lighthouse-opposite', V( L.x - 32, 16, L.z - 40 ), V( L.x, 11, L.z ) ],
	[ 'lighthouse-door', V( L.x + 1.6, 6.2, L.z + 7 ), V( L.x, 6.2, L.z + 2.4 ) ],
	[ 'boarding', V( L.x + 6, 4.7, L.z + 23 ), V( L.x, 6.8, L.z + 5 ) ],
	[ 'spiral-stairs', world.spiral[ 26 ].clone().add( V( 0, 1.62, 0 ) ), world.spiral[ 30 ].clone().add( V( 0, 1.1, 0 ) ) ],
	[ 'gallery', V( L.x + 8, world.galleryY + 4, L.z + 8 ), V( L.x, world.galleryY + 1.7, L.z ) ],
	[ 'dolphins', world.life.dolphins[ 0 ].pos.clone().add( V( 4, 0.5, 3 ) ), world.life.dolphins[ 0 ].pos.clone() ],
	[ 'dolphins-opposite', world.life.dolphins[ 0 ].pos.clone().add( V( - 4, 0.5, 3 ) ), world.life.dolphins[ 0 ].pos.clone() ],
	[ 'moray', world.life.morayPoint.clone().add( V( 1.8, 0.7, 2.7 ) ), world.life.morayPoint.clone() ],
	[ 'moray-opposite', world.life.morayPoint.clone().add( V( - 1.8, 0.7, 2.7 ) ), world.life.morayPoint.clone() ],
	[ 'seahorses', world.life.seahorsePoint.clone().add( V( 1.7, 0.3, 2.2 ) ), world.life.seahorsePoint.clone() ],
	[ 'seahorses-opposite', world.life.seahorsePoint.clone().add( V( - 1.7, 0.3, 2.2 ) ), world.life.seahorsePoint.clone() ],
	[ 'whalebones', world.targets.get( 'whalebones' ).clone().add( V( 8, 3.5, 11 ) ), world.targets.get( 'whalebones' ).clone() ],
	[ 'wreck-interior', wreck.position.clone().add( V( 1, 2.4, 5.8 ) ), wreck.position.clone().add( V( - 0.6, 1.0, - 3 ) ) ],
	[ 'lighthouse-night', V( L.x + 32, 16, L.z + 40 ), V( L.x, 11, L.z ) ],
];
const stats = [];
ocean.before.push( dt => { world.update( dt, true ); wreck.update( dt, ocean.camera ); lights.update( ocean.camera, dt ); } );
for ( const [ name, position, target ] of views ) {

	ocean.camera.position.copy( position ); ocean.camera.lookAt( target );
	const night = name.endsWith( '-night' ); G.night.value = night ? 1 : 0;
	lights.flashlight.on = position.y < - 1; lights.flashlight.primed = false;
	G.sunColor.value.setRGB( ...night ? [ 0.025, 0.035, 0.06 ] : [ 3.2, 3.0, 2.7 ] );
	G.skyIrradiance.value.setRGB( ...night ? [ 0.015, 0.025, 0.045 ] : [ 0.28, 0.36, 0.5 ] );
	ocean.sr.clearColor = night ? [ 0.015, 0.025, 0.05, 1 ] : [ 0.5, 0.65, 0.9, 1 ];
	for ( let i = 0; i < 4; i ++ ) { ocean.frame(); await GPU.pipelinesReady(); }
	const animal = name.startsWith( 'dolphins' ) ? 'dolphin' : name.startsWith( 'moray' ) ? 'moray' : name.startsWith( 'seahorses' ) ? 'seahorse' : null;
	if ( animal ) {

		assert.ok( world.life.views.get( animal ).some( view => view.visible ), name + ': actual generated model is rendered' );
		if ( animal === 'dolphin' ) assert.ok( world.life.dolphins.every( d => ! d.high.visible || ! d.group.visible ), 'Nearby procedural dolphins finish fading out' );
		else if ( animal === 'moray' ) assert.equal( world.life.eel.visible, false );
		else assert.ok( world.life.seahorses.every( fish => ! fish.visible ) );

	}
	if ( animal === 'moray' ) assert.ok( world.life.morayReaction > 0, 'The held flashlight drives the actual generated moray response' );
	if ( animal ) {

		const velocity = new Uint16Array( ( await readTexture( ocean.sr.velocityTexture ) ).data );
		let moving = 0;
		for ( let k = 0; k < velocity.length; k += 4 ) if ( ( velocity[ k ] & 0x7fff ) || ( velocity[ k + 1 ] & 0x7fff ) ) moving ++;
		assert.ok( moving > 20, name + ': motion vectors survive while the camera stays still' );

	}
	await GPU.queue.onSubmittedWorkDone(); await ocean.save( out + '/' + name + '.png' );
	stats.push( { name, ...ocean.mr.stats } );

}
assert.deepEqual( errors, [] );
writeFileSync( out + '/inspection.json', JSON.stringify( { lighthouseModelSource: 'Lux3D task 4229108, fitted textured GLB', animalModelSource: 'Lux3D tasks 4230352, 4230354, 4230356, prepared PBR GLBs', errors, stats }, null, 2 ) + '\n' );
console.log( 'PASS: lighthouse/interior/boarding/gallery/night, wreck, dolphins, reef animals and whale bones in the native FFT ocean; no GPU validation errors.' );
process.exit( 0 );
