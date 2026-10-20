import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene, PerspectiveCamera, Vector3, Mesh } from '../src/engine/index.js';
import { Material } from '../src/engine/render/Material.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { abyssPropGeometry } from '../src/world/AbyssAssets.js';
import { ExplorationWorld } from '../src/world/ExplorationWorld.js';
import { LIGHTHOUSE as L } from '../src/game/ExplorationLandmarks.js';

const bytes = readFileSync( new URL( '../public/models/landmarks/lighthouse.glb', import.meta.url ) );
assert.ok( bytes.length < 5 * 1024 * 1024 );
const gltf = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
const geometry = abyssPropGeometry( gltf ); geometry.scale( 19.7, 19.7, 19.7 ); geometry.computeBoundingBox();
assert.ok( geometry.index.count / 3 <= 20000 && geometry.boundingBox.max.y > 19.69 );
assert.ok( gltf.images.length >= 2 );
for ( const im of gltf.images ) {

	assert.equal( im.mimeType, 'image/png' );
	const png = new DataView( im.bytes.buffer, im.bytes.byteOffset, im.bytes.byteLength );
	assert.ok( png.getUint32( 16 ) <= 1024 && png.getUint32( 20 ) <= 1024 );

}
const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
const app = { scene: new Scene(), camera: new PerspectiveCamera(), terrainData: { heightAt: () => - 12 } };
const world = new ExplorationWorld( app );
assert.equal( world.lighthouseAssets.pending.size, 0, 'CPU construction does not request the generated model' );

// Check the actual exported triangles against sampled player capsules along the
// doorway, spiral and gallery exit. Gameplay collision alone cannot detect a
// generated surface that was left inside a correctly configured walking route.
const P = geometry.attributes.position, I = geometry.index.array, triangles = [];
for ( let k = 0; k < I.length; k += 3 ) {

	const points = [ I[ k ], I[ k + 1 ], I[ k + 2 ] ].map( n => V( P.getX( n ), P.getY( n ), P.getZ( n ) ) );
	triangles.push( { points, min: V( ...[ 'x', 'y', 'z' ].map( d => Math.min( ...points.map( p => p[ d ] ) ) ) ), max: V( ...[ 'x', 'y', 'z' ].map( d => Math.max( ...points.map( p => p[ d ] ) ) ) ) } );

}
function closest( p, a, b, c ) {

	const ab = b.clone().sub( a ), ac = c.clone().sub( a ), ap = p.clone().sub( a );
	const d1 = ab.dot( ap ), d2 = ac.dot( ap ); if ( d1 <= 0 && d2 <= 0 ) return a;
	const bp = p.clone().sub( b ), d3 = ab.dot( bp ), d4 = ac.dot( bp ); if ( d3 >= 0 && d4 <= d3 ) return b;
	const vc = d1 * d4 - d3 * d2; if ( vc <= 0 && d1 >= 0 && d3 <= 0 ) return a.clone().addScaledVector( ab, d1 / ( d1 - d3 ) );
	const cp = p.clone().sub( c ), d5 = ab.dot( cp ), d6 = ac.dot( cp ); if ( d6 >= 0 && d5 <= d6 ) return c;
	const vb = d5 * d2 - d1 * d6; if ( vb <= 0 && d2 >= 0 && d6 <= 0 ) return a.clone().addScaledVector( ac, d2 / ( d2 - d6 ) );
	const va = d3 * d6 - d5 * d4; if ( va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0 ) return b.clone().addScaledVector( c.clone().sub( b ), ( d4 - d3 ) / ( d4 - d3 + d5 - d6 ) );
	const den = 1 / ( va + vb + vc ); return a.clone().addScaledVector( ab, vb * den ).addScaledVector( ac, vc * den );

}
const route = world.spiral.map( p => p.clone().sub( V( L.x, L.baseY, L.z ) ) );
for ( let z = 2.5; z <= 6.5; z += 0.2 ) route.push( V( 0, 0, z ) );
for ( let z = 2.25; z <= 3.9; z += 0.1 ) route.push( V( 0, 13.2, z ) );
for ( let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24 ) route.push( V( Math.sin( angle ) * 3.85, 13.2, Math.cos( angle ) * 3.85 ) );
for ( const foot of route ) for ( let h = 0.3; h < 1.451; h += 0.1 ) {

	const p = foot.clone().add( V( 0, h, 0 ) );
	for ( const { points, min, max } of triangles ) {

		if ( [ 'x', 'y', 'z' ].some( d => p[ d ] < min[ d ] - 0.3 || p[ d ] > max[ d ] + 0.3 ) ) continue;
		assert.ok( closest( p, ...points ).distanceToSquared( p ) > 0.29 ** 2, 'Generated geometry intersects the walking capsule at ' + JSON.stringify( { p, triangle: points } ) );

	}

}
const fake = new Mesh( geometry, new Material() ); world.lighthouseAssets.models.set( 'lighthouse', fake );
world.update( 0.6, false ); assert.equal( world.baseShell.visible, true ); assert.equal( fake.material.opacity, 0.5 );
world.update( 0.6, true ); assert.equal( world.baseShell.visible, false ); assert.equal( fake.material.opacity, 1 ); assert.equal( world.innerWalls.visible, true );
const fallback = new ExplorationWorld( app ), requests = [];
globalThis.__assetFile = async url => { requests.push( url ); throw Error( 'offline fixture' ); };
const warn = console.warn; console.warn = () => {};
try {

	assert.equal( await fallback.lighthouseAssets.load( 'lighthouse' ), false );
	assert.equal( await fallback.lighthouseAssets.load( 'lighthouse' ), false );
	assert.equal( requests.length, 1 ); fallback.update( 2, false ); assert.equal( fallback.baseShell.visible, true );

} finally { console.warn = warn; delete globalThis.__assetFile; }
console.log( 'PASS: actual generated lighthouse, PBR/size/triangle budget, roof preservation, doorway/spiral/gallery capsule clearance, gradual replacement and deduplicated offline fallback.' );
