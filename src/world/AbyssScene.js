import { Float32BufferAttribute, Group, Mesh, Vector3 } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { ShaderModule } from '../engine/gpu/Shader.js';
import { GeoKit, roundedBox, sphere } from './boat/GeoKit.js';
import { createBarrel, createBlackCoral, createMound, createSeaRod, createSeagrass, createTubes } from './reef/ReefGeometry.js';
import { mulberry32 } from '../util/Noise.js';
import { WORLD } from './WorldLayout.js';

const TAU = Math.PI * 2;
const CENTER_CLEARANCE = 24;
const DRAW_RANGE = 220;

// The tall outcrops form two broken walls, with a broad approach from the north
// and an exit to the south. No tall prop enters the creature's patrol clearing.
export function buildAbyssScene( terrain, colliders = null ) {

	const center = WORLD.abyss.center;
	const floor = ( x, z ) => terrain.heightAt( center.x + x, center.z + z );
	const rng = mulberry32( 44083 ), kit = new GeoKit(), features = [];
	const rand = ( a, b ) => a + ( b - a ) * rng();
	const place = ( bucket, geometry, x, z, { yaw = 0, scale = 1, lift = 0, color = 0x66716b, part = 0, tag = 'abyss-ruin' } = {} ) => {

		if ( bucket === 'life' ) {

			const data = geometry.attributes.aData, p = geometry.attributes.position;
			const values = new Float32Array( p.count * 4 );
			for ( let i = 0; i < p.count; i ++ ) values.set( [ 0.8, data ? data.getY( i ) : 1, part, data ? data.getX( i ) : scale ], i * 4 );
			geometry.setAttribute( 'aux', new Float32BufferAttribute( values, 4 ) );

		}
		geometry.scale( scale, scale, scale ).rotateY( yaw ).translate( x, 0, z );
		const p = geometry.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + floor( p.getX( i ), p.getZ( i ) ) + lift );
		geometry.computeVertexNormals();
		kit.add( bucket, geometry, { color, rough: 0.9, pattern: part } );
		if ( bucket === 'ruin' && colliders ) colliders.addMeshBounds( geometry, new Vector3( center.x, 0, center.z ), yaw, { tag } );
		return geometry;

	};
	const shape = ( geometry, w, h, d ) => {

		geometry.computeBoundingBox();
		const b = geometry.boundingBox, s = b.getSize( new Vector3() );
		return geometry.translate( - ( b.min.x + b.max.x ) / 2, - b.min.y, - ( b.min.z + b.max.z ) / 2 ).scale( w / s.x, h / s.y, d / s.z );

	};
	const rock = Array.from( { length: 3 }, () => createMound( rng, 2, 'rock' ) );
	const stoneColors = [ 0x647571, 0x596b68, 0x75807a, 0x526560 ];
	for ( const side of [ - 1, 1 ] ) for ( let i = 0; i < 9; i ++ ) {

		const angle = 0.49 + i / 8 * 2.16;
		const r = rand( 43, 48 ), x = side * Math.sin( angle ) * r, z = Math.cos( angle ) * r;
		const height = rand( 5.5, 11.2 ), width = rand( 4.8, 8.0 );
		place( 'rock', shape( rock[ i % 3 ].clone(), width, height, rand( 5, 8 ) ), x, z, { yaw: rand( - 0.4, 0.4 ), lift: - 0.22, color: stoneColors[ i % 4 ] } );
		features.push( { type: 'wall', x, z, height, radius: width * 0.6, floor: floor( x, z ) } );

	}
	// Rubble follows the walls in clusters instead of covering the whole basin.
	for ( let i = 0; i < 62; i ++ ) {

		const side = i % 2 ? - 1 : 1, angle = rand( 0.40, 2.72 ), r = rand( 30, 49 );
		const x = side * Math.sin( angle ) * r, z = Math.cos( angle ) * r;
		const h = rand( 0.4, 2.0 ), w = rand( 1.3, 3.5 );
		place( 'rock', shape( rock[ i % 3 ].clone(), w, h, w * rand( 0.6, 1.4 ) ), x, z, { yaw: rand( 0, TAU ), lift: - 0.12, color: stoneColors[ i % 4 ] } );
		features.push( { type: 'rubble', x, z, height: h, radius: w * 0.7, floor: floor( x, z ) } );

	}
	// Two open stone gateways: > 8 m wide and > 5 m high inside. The geometry
	// has an actual opening, rather than a dark patch on an impassable wall.
	const gateways = [ { x: 0, z: - 34, yaw: 0.12 }, { x: 1, z: 35, yaw: - 0.16 } ];
	for ( const gate of gateways ) {

		const addBlock = ( g ) => {

			place( 'ruin', g, gate.x, gate.z, { yaw: gate.yaw, lift: - 0.08, color: 0x8c9487, tag: 'abyss-gateway' } );

		};
		for ( const side of [ - 1, 1 ] ) for ( let j = 0; j < 4; j ++ ) addBlock( roundedBox( 1.7, 1.04, 2.35, 0.12, 1 ).translate( side * 5.5 + Math.sin( j * 3.1 ) * 0.08, 0.52 + j * 1.02, 0 ) );
		for ( let j = 0; j < 14; j ++ ) {

			const a = ( j + 0.5 ) / 14 * Math.PI;
			addBlock( roundedBox( 1.40, 1.30, 2.35, 0.12, 1 ).rotateZ( a + Math.PI / 2 ).translate( Math.cos( a ) * 5.5, 4.0 + Math.sin( a ) * 3.5, 0 ) );

		}
		Object.assign( gate, { width: 8.5, clearance: 5.5, height: 8.2, radius: 7, floor: floor( gate.x, gate.z ) } );
		features.push( { type: 'gateway', ...gate } );

	}
	// A half-collapsed colonnade on the east rim gives the ruins a direction
	// and a silhouette, with fallen lintels pointing toward the central creature.
	for ( let i = 0; i < 8; i ++ ) {

		const a = 0.70 + i / 7 * 1.65, r = 30 + i % 2 * 2.5, x = Math.sin( a ) * r, z = Math.cos( a ) * r;
		const h = i % 3 === 0 ? 5.8 : rand( 2.1, 4.4 );
		place( 'ruin', roundedBox( 1.35, h, 1.5, 0.15, 1 ).rotateZ( rand( - 0.18, 0.18 ) ).translate( 0, h / 2, 0 ), x, z, { yaw: a, lift: - 0.1, color: 0x7b887b, tag: 'abyss-column' } );
		place( 'ruin', roundedBox( 3.7, 0.7, 1.25, 0.15, 1 ).translate( 0, 0.35, 0 ), x - 2.5, z + 2, { yaw: a + 0.7, lift: - 0.04, color: 0x727c73, tag: 'abyss-lintel' } );
		features.push( { type: 'column', x, z, height: h, radius: 1.5, floor: floor( x, z ) } );

	}
	const colonies = [ createBarrel( rng, 1 ), createTubes( rng, 1, true ), createBlackCoral( rng, 1 ), createSeaRod( rng, 1 ), createSeagrass( rng, 1 ) ];
	const patches = [ [ - 27, - 12 ], [ - 34, 12 ], [ 27, 10 ], [ 22, - 22 ], [ - 20, 27 ], [ 27, 28 ] ];
	const colors = [ 0x886d62, 0xb6a387, 0x6f5572, 0x789c8e, 0x4e7667 ];
	for ( let patch = 0; patch < patches.length; patch ++ ) for ( let j = 0; j < 22; j ++ ) {

		const angle = rand( 0, TAU ), radius = Math.sqrt( rng() ) * 5.5;
		const x = patches[ patch ][ 0 ] + Math.sin( angle ) * radius, z = patches[ patch ][ 1 ] + Math.cos( angle ) * radius;
		if ( Math.hypot( x, z ) < CENTER_CLEARANCE || Math.abs( x ) < 7 ) continue;
		const type = j % 5, scale = type === 4 ? rand( 1.3, 2.6 ) : rand( 1.4, 3.4 );
		place( 'life', colonies[ type ].clone(), x, z, { scale, yaw: angle, part: type === 3 ? 4 : type === 2 || type === 4 ? 1 : 2, color: colors[ type ] } );
		features.push( { type: 'colony', x, z, height: scale * 0.9, radius: scale * 0.5, floor: floor( x, z ) } );

	}
	// Sparse marine snow in three pockets, not a uniform glowing grid. Opaque
	// tiny low-poly flecks share the life mesh and avoid transparent overdraw.
	for ( const [ px, pz ] of [ [ - 25, - 15 ], [ 24, 10 ], [ - 16, 29 ] ] ) for ( let j = 0; j < 24; j ++ ) {

		const x = px + rand( - 5, 5 ), z = pz + rand( - 6, 6 );
		if ( Math.hypot( x, z ) < CENTER_CLEARANCE ) continue;
		place( 'life', sphere( rand( 0.012, 0.027 ), 5, 3 ), x, z, { lift: rand( 1.6, 10 ), scale: 1, part: 3, color: 0x7b9996 } );

	}
	// Target heights are in metres; the asset loader normalizes each generated
	// model by its own bounding-box height before placing these shared instances.
	const assets = [
		[ 'vent', - 37, - 16, 0.3, 6.6 ], [ 'vent', - 42, 5, 1.1, 8.2 ], [ 'vent', 40, 15, 2.0, 6.8 ], [ 'vent', 35, - 23, 2.7, 5.8 ],
		[ 'arch', - 24, - 25, 0.65, 6.2 ], [ 'arch', 25, 26, 0.85, 6.0 ],
		[ 'coral', - 27, - 10, 0.3, 2.4 ], [ 'coral', - 31, 16, 1.4, 2.1 ], [ 'coral', 26, 10, 2.0, 2.7 ],
		[ 'coral', 22, - 23, 0.8, 2.2 ], [ 'coral', - 20, 28, 2.6, 2.4 ], [ 'coral', 31, 28, 1.1, 1.9 ],
	];
	const modelPlacements = assets.map( ( [ id, x, z, rotation, height ] ) => ( { id, position: new Vector3( center.x + x, floor( x, z ) - 0.08, center.z + z ), rotation, height, scale: height } ) );
	return { geometries: { rock: kit.merged( 'rock' ), ruin: kit.merged( 'ruin' ), life: kit.merged( 'life' ) }, features, modelPlacements, gateways };

}

const living = new ShaderModule( { name: 'abyssLivingScene', code: /* wgsl */`
fn abyssLifeOffset( p: vec3f, aux: vec4f, age: f32 ) -> vec3f {
	let phase = p.x * 0.7 + p.z * 1.1;
	if ( aux.z > 2.5 && aux.z < 3.5 ) { return vec3f( sin( age * 0.19 + phase ) * 0.28, sin( age * 0.13 + phase * 1.4 ) * 0.65, cos( age * 0.17 + phase ) * 0.23 ); }
	if ( aux.z < 1.5 || aux.z > 3.5 ) { return vec3f( sin( age * 0.55 + phase ), 0.0, cos( age * 0.43 + phase ) * 0.5 ) * aux.w * aux.w * 0.14; }
	return vec3f( 0.0 );
}` } );

export function stoneMaterial( ruins = false ) {

	return new Material( {
		name: ruins ? 'Abyss · weathered stone' : 'Abyss · fractured basalt', vertexColors: true, roughness: 0.94,
		surface: /* wgsl */`
		let grain = perlin3( in.P * 4.0 ) * 0.5 + 0.5;
		let crust = perlin3( in.P * 0.62 ) * 0.5 + 0.5;
		let strata = pow( abs( sin( in.P.y * 5.2 + perlin3( in.P * 1.2 ) * 2.0 ) ), 7.0 );
		s.albedo *= ( 0.65 + grain * 0.25 + crust * 0.25 ) * ( 1.0 - strata * 0.16 );
		s.albedo = mix( s.albedo, vec3f( 0.11, 0.18, 0.13 ), smoothstep( 0.60, 0.85, crust ) * 0.35 );
		let relief = grain * 0.035 + strata * 0.018;
		s.normal = perturbNormalByHeight( in.P, in.N, dpdx( relief ), dpdy( relief ), 0.65 );
		s.roughness = 0.85 + grain * 0.1;
		`,
	} );

}

export class AbyssScene {

	constructor( { scene, terrain, colliders = null } ) {

		const built = buildAbyssScene( terrain, colliders );
		this.group = new Group(); this.group.name = '深海遗迹 · 裂谷与海绵花园';
		this.group.position.set( WORLD.abyss.center.x, 0, WORLD.abyss.center.z );
		this.position = WORLD.abyss.center.clone(); this.position.y = terrain.heightAt( this.position.x, this.position.z );
		this.features = built.features; this.gateways = built.gateways; this.modelPlacements = built.modelPlacements;
		if ( colliders ) for ( const f of this.features ) {

			// Tight cores keep the scattered rock edges forgiving while the large
			// outcrops remain solid. Doorways and the central clearing stay open.
			if ( f.type === 'wall' || f.type === 'rubble' && f.height > 1.5 ) colliders.addCylinder( WORLD.abyss.center.x + f.x, WORLD.abyss.center.z + f.z, f.radius * 0.53, f.floor - 0.2, f.floor + f.height * 0.80, { tag: 'abyssRock' } );

		}
		this.time = 0;
		this.lifeMaterial = new Material( {
			name: 'Abyss · cold-water colonies and marine snow', vertexColors: true, side: 'double', roughness: 0.83,
			modules: [ living ], attributes: { aux: 'vec4f' }, varyings: { life: 'vec4f' },
			uniforms: { age: [ 'f32', 0 ], previousAge: [ 'f32', 0 ] },
			vertex: /* wgsl */`
			o.life = v.aux;
			let offset = abyssLifeOffset( v.position, v.aux, mat.age );
			let previous = abyssLifeOffset( v.position, v.aux, mat.previousAge );
			v.prevWorldOffset = ( v.prevModel * vec4f( previous - offset, 0.0 ) ).xyz;
			v.position += offset;
			`,
			surface: /* wgsl */`
			s.ao *= clamp( in.vs.life.y, 0.3, 1.0 );
			let pores = perlin3( in.P * 26.0 ) * 0.5 + 0.5;
			s.albedo *= 0.80 + pores * 0.35;
			if ( in.vs.life.z > 3.5 ) { s.emissive = vec3f( 0.10, 0.37, 0.28 ) * smoothstep( 0.65, 1.0, in.vs.life.w ) * ( 0.5 + 0.12 * sin( mat.age * 0.38 + in.P.x ) ); }
			if ( in.vs.life.z > 2.5 && in.vs.life.z < 3.5 ) { s.emissive = vec3f( 0.04, 0.075, 0.07 ); s.roughness = 1.0; }
			`,
		} );
		for ( const [ name, geometry ] of Object.entries( built.geometries ) ) {

			const mesh = new Mesh( geometry, name === 'life' ? this.lifeMaterial : stoneMaterial( name === 'ruin' ) );
			mesh.name = { rock: '错落裂谷岩壁', ruin: '沉没门廊与断柱', life: '海绵珊瑚与海雪' }[ name ];
			mesh.castShadow = name !== 'life';
			if ( name === 'life' ) geometry.boundingSphere.radius += 0.8;
			this.group.add( mesh );

		}
		scene.add( this.group );

	}

	update( dt, camera ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.1 );
		this.lifeMaterial.uniforms.previousAge.value = this.time;
		this.time += dt; this.lifeMaterial.uniforms.age.value = this.time;
		this.group.visible = camera.position.distanceToSquared( this.position ) < DRAW_RANGE ** 2;

	}

}
