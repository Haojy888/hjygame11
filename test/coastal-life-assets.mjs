import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene, PerspectiveCamera, Vector3, Mesh } from '../src/engine/index.js';
import { Material } from '../src/engine/render/Material.js';
import { Colliders } from '../src/world/Colliders.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { abyssPropGeometry } from '../src/world/AbyssAssets.js';
import { CoastalLife } from '../src/world/marine/CoastalLife.js';

const budgets = { dolphin: 12000, moray: 8000, seahorse: 10000 };
const geometries = new Map();
for ( const [ id, budget ] of Object.entries( budgets ) ) {

	const data = readFileSync( new URL( '../public/models/coastal-life/' + id + '.glb', import.meta.url ) );
	assert.ok( data.length < 5 * 1024 * 1024, id + ': download budget' );
	const gltf = parseGLB( data.buffer.slice( data.byteOffset, data.byteOffset + data.byteLength ) );
	const geometry = abyssPropGeometry( gltf );
	geometries.set( id, geometry );
	assert.ok( geometry.index.count / 3 <= budget );
	const size = geometry.boundingBox.getSize( new Vector3() );
	assert.ok( Math.abs( size.y - 1 ) < 1e-5 );
	if ( id !== 'seahorse' ) assert.ok( size.z > size.x && size.z > 2, id + ': nose/tail are along +Z' );
	else assert.ok( size.z < 1.3 && size.x < 1, 'the seahorse stands upright rather than lying sideways' );
	assert.ok( gltf.images.length >= 1 );
	for ( const image of gltf.images ) {

		assert.equal( image.mimeType, 'image/png' );
		const view = new DataView( image.bytes.buffer, image.bytes.byteOffset );
		assert.ok( view.getUint32( 16 ) <= 1024 && view.getUint32( 20 ) <= 1024 );

	}

}

// No startup downloads; unsupported/failing sources keep usable procedural animals.
const parent = new Scene(), camera = new PerspectiveCamera();
const app = { camera, terrainData: { heightAt: () => - 12 } }, life = new CoastalLife( app, parent );
assert.equal( life.assets.pending.size, 0 );
const requests = []; globalThis.__assetFile = async url => { requests.push( url ); throw Error( 'offline fixture' ); };
const warn = console.warn; console.warn = () => {};
try {

	assert.equal( await life.assets.load( 'dolphin' ), false );
	assert.equal( await life.assets.load( 'dolphin' ), false ); assert.equal( requests.length, 1 );
	assert.equal( await life.assets.load( 'not-an-animal' ), false );
	for ( const [ id, point ] of [ [ 'dolphin', life.dolphins[ 0 ].pos ], [ 'moray', life.morayPoint ], [ 'seahorse', life.seahorsePoint ] ] ) {

		camera.position.copy( point ); life.update( 0.016 );
		assert.ok( id === 'dolphin' ? life.dolphins[ 0 ].high.visible : id === 'moray' ? life.eel.visible : life.seahorses[ 0 ].visible );

	}

} finally { console.warn = warn; delete globalThis.__assetFile; }

const colliders = new Colliders(), actual = new CoastalLife( { ...app, colliders, localLights: { flashlight: { on: true } } }, parent );
for ( const [ id, geometry ] of geometries ) actual.assets.models.set( id, new Mesh( geometry, new Material() ) );
camera.position.copy( actual.dolphins[ 0 ].pos );
actual.updateAssets( 0.6 ); assert.equal( actual.views.get( 'dolphin' )[ 0 ].material.opacity, 0.5 );
assert.equal( actual.dolphins[ 0 ].high.visible, true, 'Outgoing geometry covers a slow source handoff' );
actual.updateAssets( 0.6 ); assert.equal( actual.dolphins[ 0 ].high.visible, false );
assert.equal( actual.views.get( 'dolphin' ).length, 3 );
assert.ok( actual.views.get( 'dolphin' ).every( view => ! view.staticVelocity ), 'Moving views preserve per-animal transform history' );
camera.position.copy( actual.dolphins[ 0 ].pos ).add( new Vector3( 30, 0, 0 ) ); actual.updateAssets( 0 );
assert.equal( actual.dolphins[ 0 ].high.visible, true ); assert.equal( actual.dolphins[ 0 ].low.visible, false );
camera.position.copy( actual.dolphins[ 0 ].pos ).add( new Vector3( 38, 0, 0 ) ); actual.updateAssets( 0 );
assert.equal( actual.views.get( 'dolphin' )[ 0 ].visible, false ); assert.equal( actual.dolphins[ 0 ].low.visible, true );
camera.position.copy( actual.morayPoint ); actual.updateAssets( 0.016 );
assert.equal( actual.eel.visible, false ); assert.ok( actual.moraySolids.length >= 7 );
assert.equal( colliders.capsules.includes( actual.morayCollider ), false );
const count = colliders.capsules.length;
for ( const segment of actual.moraySolids ) {

	assert.ok( segment.shape.start.distanceTo( segment.shape.end ) > 0.01 );
	const inside = segment.shape.start.clone().add( segment.shape.end ).multiplyScalar( 0.5 );
	assert.equal( colliders.resolveCapsule( inside, 0.3, 0.55, 0 ), true, 'The curved visible eel body excludes a diver' );

}
assert.equal( actual.assets.models.get( 'moray' ).material.uniforms.reaction.value, 1 );
actual.app.localLights.flashlight.on = false; actual.updateAssets( 0.016 );
assert.equal( actual.assets.models.get( 'moray' ).material.uniforms.reaction.value, 0 );
assert.equal( actual.assets.models.get( 'moray' ).material.uniforms.previousReaction.value, 1 );
assert.equal( colliders.capsules.length, count, 'Collision fitting runs once per source' );
console.log( 'PASS: three actual PBR coastal GLBs; axes/budgets; deferred loading and offline dedup; loading/distance handoff, per-animal history, curved-body collision and flashlight response.' );
