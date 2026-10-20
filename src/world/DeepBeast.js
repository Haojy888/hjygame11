import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, MathUtils, Mesh, Quaternion, TubeGeometry, Vector3, Vector4 } from '../engine/index.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { Material } from '../engine/render/Material.js';
import { ShaderModule } from '../engine/gpu/Shader.js';
import { Texture } from '../engine/gpu/Texture.js';
import { GPU } from '../engine/gpu/GPU.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { loadGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { commonModule } from '../engine/render/wgsl/common.js';
import { GeoKit, alignY, roundedBox, lathe, sphere, tube } from './boat/GeoKit.js';
import { WORLD } from './WorldLayout.js';

const TAU = Math.PI * 2;
const V = ( x, y, z ) => new Vector3( x, y, z );
const up = V( 0, 1, 0 );
const REALISTIC_URL = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/creatures/abyssal-elder.glb';
const PATROL_RADIUS = 5, PATROL_SAMPLES = 720;

function patrolPose( phase ) {

	// Octopuses can glide sideways. Small turns preserve the slope-shaped arms;
	// a full turn would swap the uphill/downhill sides of this terrain-fitted mesh.
	return { x: 4.5 * Math.sin( phase ), z: 1.8 * Math.sin( phase * 2 ), yaw: 0.22 * Math.sin( phase ) + 0.08 * Math.sin( phase * 2 ) };

}

function patrolHeights( terrain, origin, geometry ) {

	// One low point per half-metre footprint cell bounds every source vertex.
	// Bake the static seabed once; moving the creature never rebuilds its mesh.
	const p = geometry.attributes.position, cells = new Map();
	let radius = 0;
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const cx = Math.floor( x * 2 ) / 2, cz = Math.floor( z * 2 ) / 2, key = cx + ',' + cz;
		if ( ! cells.has( key ) || y < cells.get( key ).y ) cells.set( key, { x: cx + 0.25, y, z: cz + 0.25 } );
		radius = Math.max( radius, Math.hypot( x, z ) );

	}
	// TerrainData is bilinear between texel centres. Bounds on both grid slopes
	// also bound terrain between samples, including the shader's 0.65m arm sway.
	const step = terrain.texel || 1, grid = ( terrain.origin || 0 ) + step / 2;
	const reach = PATROL_RADIUS + radius + 0.67 + step * 2;
	const x0 = grid + Math.floor( ( origin.x - reach - grid ) / step ) * step;
	const z0 = grid + Math.floor( ( origin.z - reach - grid ) / step ) * step;
	let slopeX = 0, slopeZ = 0;
	for ( let z = z0; z <= origin.z + reach; z += step ) for ( let x = x0; x <= origin.x + reach; x += step ) {

		const h = terrain.heightAt( x, z );
		slopeX = Math.max( slopeX, Math.abs( terrain.heightAt( x + step, z ) - h ) / step );
		slopeZ = Math.max( slopeZ, Math.abs( terrain.heightAt( x, z + step ) - h ) / step );

	}
	const phaseStep = TAU / PATROL_SAMPLES;
	// The spline blends at most two neighbouring poses. Its travel derivative
	// is <= hypot(4.5,3.6), and its yaw derivative <= 0.38 radians per phase.
	const margin = Math.hypot( slopeX, slopeZ ) * ( Math.SQRT1_2 / 2 + 0.67 + 2 * phaseStep * ( Math.hypot( 4.5, 3.6 ) + ( radius + Math.SQRT1_2 / 2 ) * 0.38 ) ) + 0.4;
	const heights = Float32Array.from( { length: PATROL_SAMPLES }, ( _, i ) => {

		const pose = patrolPose( i * phaseStep ), c = Math.cos( pose.yaw ), s = Math.sin( pose.yaw );
		let height = - Infinity;
		for ( const cell of cells.values() ) height = Math.max( height, terrain.heightAt( origin.x + pose.x + c * cell.x + s * cell.z, origin.z + pose.z - s * cell.x + c * cell.z ) - cell.y );
		return height + margin;

	} );
	// Folding shortens each arm by <= 22%. Lift by a slope bound so it cannot
	// retract through the uphill seabed, even between the baked patrol samples.
	return { heights, guardLift: 1 + 0.22 * ( radius + 0.67 ) * Math.hypot( slopeX, slopeZ ) };

}

// Original metre-scale mesh; no downloaded models or textures. +Z is its face.
// aux.z: skin / sucker / iris / pupil / luminous scar / ruins; aux.w: arm + longitudinal weight.
export function buildDeepBeast( floorAt = () => 0 ) {

	const kit = new GeoKit();
	const add = ( geo, part = 0, color = 0x687766, anim = 0 ) => kit.add( 'beast', geo, { color, pattern: part, anim } );
	const ellipsoid = ( x, y, z, sx, sy, sz, part = 0, color = 0x687766, detail = 24 ) => add( sphere( 1, detail, Math.round( detail * 0.65 ) ).scale( sx, sy, sz ).translate( x, y, z ), part, color );
	const mantle = sphere( 1, 72, 48 ).scale( 3.65, 4.7, 4.0 );
	const mp = mantle.attributes.position;
	for ( let i = 0; i < mp.count; i ++ ) {

		const x = mp.getX( i ), y = mp.getY( i ), z = mp.getZ( i );
		const ridge = Math.sin( Math.atan2( x, z ) * 9 ) * 0.075 * Math.max( 0, 1 - y * y / 23 );
		mp.setXYZ( i, x * ( 1 + ridge ), y + 6, z * ( 1 + ridge ) - 1.7 - y * 0.17 );

	}
	mantle.computeVertexNormals();
	add( mantle );
	ellipsoid( 0, 3.5, 1.5, 3.1, 2.25, 2.9 );
	// Brow hoods, horizontal pupils and folded siphons give a readable, non-cartoon face.
	for ( const side of [ - 1, 1 ] ) {

		const eye = V( side * 2.42, 4.55, 3.30 );
		ellipsoid( eye.x, eye.y, eye.z, 0.72, 0.52, 0.52, 0, 0x35493f );
		ellipsoid( eye.x, eye.y, eye.z + 0.43, 0.44, 0.235, 0.16, 2, 0xa5bf63 );
		ellipsoid( eye.x, eye.y, eye.z + 0.59, 0.31, 0.045, 0.025, 3, 0x061414 );
		add( tube( [ V( side * 1.6, 4.65, 3.65 ), V( side * 2.3, 4.90, 3.86 ), V( side * 3.0, 4.94, 3.2 ) ], 0.25, 18, 10 ) );
		add( tube( [ V( side * 2.7, 3.4, 1.4 ), V( side * 3.7, 3.7, 1.9 ), V( side * 3.65, 3.6, 2.6 ) ], 0.29, 14, 10 ), 0, 0x455c50 );

	}

	const arms = [];
	for ( let arm = 0; arm < 8; arm ++ ) {

		const angle = arm / 8 * TAU + Math.PI / 8;
		const forward = V( Math.sin( angle ), 0, Math.cos( angle ) );
		const side = V( forward.z, 0, - forward.x );
		const length = 11.5 + 2.8 * ( 0.5 + 0.5 * Math.sin( arm * 2.7 ) );
		const point = ( t ) => {

			const curl = Math.max( 0, ( t - 0.68 ) / 0.32 ) * Math.PI * 1.6;
			const curlR = length * 0.32 / ( Math.PI * 1.6 );
			const r = 1.8 + length * Math.min( t, 0.68 ) + curlR * Math.sin( curl );
			const lateral = Math.sin( t * 4.5 + arm ) * Math.min( t, 0.68 ) * 1.8;
			const p = forward.clone().multiplyScalar( r ).addScaledVector( side, lateral );
			p.y = floorAt( p.x, p.z ) + 0.9 + 2.6 * Math.pow( 1 - t, 3 ) + 1.25 * Math.sin( Math.min( t, 0.68 ) * Math.PI ) ** 2 + curlR * ( 1 - Math.cos( curl ) ) * ( arm % 3 === 0 ? 1.7 : 1 );
			return p;

		};
		const steps = 76, sides = 14;
		const path = new CatmullRomCurve3( Array.from( { length: 81 }, ( _, i ) => point( i / 80 ) ) );
		const g = new TubeGeometry( path, steps, 1, sides );
		const initialUp = up.clone().addScaledVector( g.tangents[ 0 ], - up.dot( g.tangents[ 0 ] ) ).normalize();
		const twist = Math.atan2( initialUp.dot( g.binormals[ 0 ] ), initialUp.dot( g.normals[ 0 ] ) );
		const frame = ( t ) => {

			const index = t * steps, i = Math.min( steps - 1, Math.floor( index ) ), f = index - i;
			const normal = g.normals[ i ].clone().lerp( g.normals[ i + 1 ], f ).multiplyScalar( Math.cos( twist ) ).addScaledVector( g.binormals[ i ].clone().lerp( g.binormals[ i + 1 ], f ), Math.sin( twist ) ).normalize();
			return { p: path.getPointAt( t ), across: normal.clone().cross( path.getTangentAt( t ) ).normalize(), normal, radius: 1.2 * Math.pow( 1 - t, 1.25 ) + 0.025 };

		};
		const pos = g.attributes.position, aux = [];
		for ( let i = 0; i <= steps; i ++ ) {

			const t = i / steps, f = frame( t );
			for ( let j = 0; j <= sides; j ++ ) {

				const k = i * ( sides + 1 ) + j;
				pos.setXYZ( k, f.p.x + ( pos.getX( k ) - f.p.x ) * f.radius, f.p.y + ( pos.getY( k ) - f.p.y ) * f.radius, f.p.z + ( pos.getZ( k ) - f.p.z ) * f.radius );
				aux.push( 0.68, 0, 0, arm + 1 + t * 0.9 );

			}

		}
		g.setAttribute( 'aux', new Float32BufferAttribute( aux, 4 ) );
		g.computeVertexNormals();
		add( g );
		// Two render rings per collision link retain the curls without testing
		// the high-resolution skin or rebuilding any geometry during a frame.
		const collisionPoints = Array.from( { length: steps / 2 + 1 }, ( _, i ) => {

			const t = i * 2 / steps;
			return { position: path.getPointAt( t ), t, radius: 1.2 * Math.pow( 1 - t, 1.25 ) + 0.095 };

		} );
		arms.push( { angle, length, collisionPoints } );
		for ( let j = 0; j < 16; j ++ ) for ( const row of [ - 1, 1 ] ) {

			const t = 0.10 + j / 15 * 0.78, f = frame( t );
			const r = f.radius * 0.37;
			const mouth = f.normal.clone().negate();
			const p = f.p.clone().addScaledVector( f.across, row * f.radius * 0.43 ).addScaledVector( mouth, f.radius * 0.76 );
			const cup = lathe( [ [ 0.02 * r, - 0.15 * r ], [ 0.72 * r, - 0.1 * r ], [ r, 0.15 * r ], [ r, 0.42 * r ], [ 0.75 * r, 0.47 * r ], [ 0.42 * r, - 0.01 * r ] ], 10 );
			cup.applyMatrix4( alignY( p, mouth ) );
			add( cup, 1, 0xc2a88f, arm + 1 + t * 0.9 );

		}

	}
	// Scalloped web between the eight muscular arm roots.
	const webPos = [], webIdx = [];
	for ( let i = 0; i <= 128; i ++ ) {

		const a = i / 128 * TAU + Math.PI / 8;
		const r = 2.5 + 2.2 * Math.pow( 0.5 + 0.5 * Math.cos( i / 128 * TAU * 8 ), 2 );
		for ( const s of [ 0, 1 ] ) {

			const d = s ? r : 1.7;
			const x = Math.sin( a ) * d, z = Math.cos( a ) * d;
			webPos.push( x, floorAt( x, z ) + ( s ? 1.9 : 3.2 ), z );

		}
		if ( i < 128 ) { const k = i * 2; webIdx.push( k, k + 2, k + 1, k + 1, k + 2, k + 3 ); }

	}
	const web = new BufferGeometry();
	web.setAttribute( 'position', new Float32BufferAttribute( webPos, 3 ) );
	web.setIndex( webIdx ); web.computeVertexNormals(); add( web, 0, 0x52624e );
	// Small papillae, back ridges and an ancient crown break the smooth mantle silhouette.
	for ( let i = 0; i < 76; i ++ ) {

		const a = i * 2.399963, h = - 0.65 + i / 76 * 1.5, r = Math.sqrt( 1 - h * h );
		const n = V( Math.cos( a ) * r, h, Math.sin( a ) * r );
		const p = V( n.x * 3.65, 6 + n.y * 4.7, - 1.7 + n.z * 4 - n.y * 0.8 );
		const size = 0.12 + 0.14 * ( 0.5 + 0.5 * Math.sin( i * 9.1 ) );
		ellipsoid( p.x, p.y, p.z, size, size * 0.65, size, 0, 0x6c7561, 10 );

	}
	for ( let i = - 2; i <= 2; i ++ ) {

		const points = [ V( i * 0.8, 8, - 4.2 ), V( i * 1.1, 10.8, - 3.8 ), V( i * 1.45, 12 - Math.abs( i ) * 0.5, - 5.4 ) ];
		add( tube( points, 0.11, 22, 7 ), 0, 0x48594d );
		add( tube( [ V( i * 0.6, 8.7, 1.55 ), V( i * 0.7, 7.1, 2.3 ), V( i * 0.6, 5.9, 2.95 ) ], 0.035, 16, 5 ), 4, 0x5dc0a8 );

	}
	const creature = kit.merged( 'beast' );
	creature.boundingSphere.radius += 2; // shader sway remains inside the culling bound
	return { geometry: creature, arms, suckerCount: 256 };

}

const animation = new ShaderModule( {
	name: 'deepBeast', deps: [ commonModule ], code: /* wgsl */`
fn abyssEyeRotation( p: vec3f, gaze: vec2f ) -> vec3f {
	let cy = cos( gaze.x ); let sy = sin( gaze.x );
	let cp = cos( gaze.y ); let sp = sin( gaze.y );
	let raised = vec3f( p.x, p.y * cp + p.z * sp, -p.y * sp + p.z * cp );
	return vec3f( raised.x * cy + raised.z * sy, raised.y, -raised.x * sy + raised.z * cy );
}
fn abyssPose( p: vec3f, arm: f32, part: f32, time: f32, wake: f32, reaction: vec4f, guardLift: f32 ) -> vec3f {
	if ( arm < 1.0 ) {
		var body = p;
		if ( part > 1.5 && part < 3.5 ) {
			let eye = vec3f( sign( p.x ) * 2.42, 4.55, 3.30 );
			var local = p - eye;
			local.y *= 1.0 - reaction.z * 0.45;
			body = eye + abyssEyeRotation( local, reaction.xy );
		}
		return body * ( 1.0 + 0.008 * sin( time * 0.48 ) ) + vec3f( 0.0, wake * 0.28, 0.0 );
	}
	let id = floor( arm ) - 1.0;
	let t = fract( arm ) / 0.9;
	let a = id * 0.785398163 + 0.392699082;
	let w = t * t * ( 0.15 + wake * 0.85 );
	let wave = sin( time * 0.65 - t * 5.0 + id * 1.7 );
	let posed = p + vec3f( cos( a ) * wave * 0.65, ( sin( time * 0.48 - t * 4.0 + id ) * 0.35 + wake * 0.65 ) * w, -sin( a ) * wave * 0.65 ) * w;
	let fold = reaction.w * t * t;
	return vec3f( posed.x * ( 1.0 - fold * 0.22 ), posed.y + fold * guardLift, posed.z * ( 1.0 - fold * 0.22 ) );
}
`,
} );

// Lux3D may split vertices at UV seams. Blender records each original vertex ID,
// so skin, suckers, eyes and arms keep their exact terrain placement and animation.
export function retargetDeepBeast( gltf, original ) {

	if ( gltf.meshes.length !== 1 || gltf.meshes[ 0 ].length !== 1 ) throw new Error( 'Expected one octopus primitive' );
	const p = gltf.meshes[ 0 ][ 0 ], A = p.attributes;
	if ( p.mode !== 4 || ! p.indices || ! A._SOURCE || ! A.TEXCOORD_0 || A._SOURCE.array.length * 2 !== A.TEXCOORD_0.array.length ) throw new Error( 'Missing octopus UV or source vertex IDs' );
	const n = A._SOURCE.array.length, geo = new BufferGeometry();
	for ( const name of [ 'position', 'normal', 'color', 'aux' ] ) {

		const source = original.attributes[ name ], size = source.itemSize, values = new Float32Array( n * size );
		for ( let i = 0; i < n; i ++ ) {

			const index = A._SOURCE.array[ i ];
			if ( ! Number.isInteger( index ) || index < 0 || index >= source.count ) throw new Error( 'Invalid octopus source vertex ID' );
			values.set( source.array.subarray( index * size, ( index + 1 ) * size ), i * size );

		}
		geo.setAttribute( name, new Float32BufferAttribute( values, size ) );

	}
	if ( ! A.TEXCOORD_0.array.every( Number.isFinite ) || p.indices.some( ( i ) => i < 0 || i >= n ) ) throw new Error( 'Invalid octopus UV or triangle' );
	geo.setAttribute( 'uv', new Float32BufferAttribute( A.TEXCOORD_0.array, 2 ) );
	geo.setIndex( Array.from( p.indices ) ); geo.computeBoundingBox(); geo.computeBoundingSphere();
	geo.boundingSphere.radius += 2;
	return geo;

}

function beastMaterial( textures = null ) {

	return new Material( {
		name: textures ? 'Abyssal elder · Lux3D skin' : 'Abyssal elder · living skin', vertexColors: ! textures, side: 'double',
		textures: textures || {},
		modules: [ animation ], attributes: { aux: 'vec4f' },
		varyings: { localP: 'vec3f', part: 'f32' },
		uniforms: { wake: [ 'f32', 0 ], previousWake: [ 'f32', 0 ], age: [ 'f32', 0 ], previousAge: [ 'f32', 0 ],
			reaction: [ 'vec4f', new Vector4( 0, 0, 0, 0 ) ], previousReaction: [ 'vec4f', new Vector4( 0, 0, 0, 0 ) ], guardLift: [ 'f32', 1 ] },
		vertex: /* wgsl */`
		o.localP = v.position; o.part = v.aux.z;
		let posed = abyssPose( v.position, v.aux.w, v.aux.z, mat.age, mat.wake, mat.reaction, mat.guardLift );
		let previous = abyssPose( v.position, v.aux.w, v.aux.z, mat.previousAge, mat.previousWake, mat.previousReaction, mat.guardLift );
		if ( v.aux.z > 1.5 && v.aux.z < 3.5 ) { v.normal = abyssEyeRotation( v.normal, mat.reaction.xy ); }
		v.prevWorldOffset = ( v.prevModel * vec4f( previous - posed, 0.0 ) ).xyz;
		v.position = posed;
`,
		surface: /* wgsl */`
		let p = in.vs.localP;
		let blotch = perlin3( p * 1.7 ) * 0.5 + 0.5;
		let pores = perlin3( p * 15.0 );
		let folds = sin( p.y * 11.0 + perlin3( p * 2.3 ) * 5.0 ) * 0.5 + 0.5;
		let relief = pores * 0.025 + folds * 0.035;
		s.normal = perturbNormalByHeight( in.P, in.N, dpdx( relief ), dpdy( relief ), 0.7 );
		${ textures ? /* wgsl */`
		s.albedo = textureSample( beastAlbedo, smpAnisoRepeat, in.uv ).rgb;
		let orm = textureSample( beastOrm, smpAnisoRepeat, in.uv );
		s.roughness = clamp( 0.52 + orm.g * 0.35, 0.55, 0.87 ); s.metalness = 0.0;
		s.specularIntensity = 0.4; s.translucency = s.albedo * 0.1;
		s.clearcoat = 0.12; s.clearcoatRoughness = 0.35;
		s.emissive = s.albedo * 0.05;
		if ( in.vs.part > 0.5 && in.vs.part < 1.5 ) { s.albedo = mix( s.albedo, vec3f( 0.52, 0.32, 0.22 ) * ( 0.85 + blotch * 0.15 ), 0.78 ); s.roughness = 0.56; s.normal = in.N; }
		if ( in.vs.part > 1.5 && in.vs.part < 2.5 ) { s.albedo = mix( s.albedo, vec3f( 0.32, 0.22, 0.06 ), 0.65 ); s.emissive = s.albedo * ( 0.12 + mat.wake * 0.7 ); s.roughness = 0.22; s.normal = in.N; }
		if ( in.vs.part > 2.5 && in.vs.part < 3.5 ) { s.albedo = vec3f( 0.002, 0.005, 0.004 ); s.emissive = vec3f( 0.0 ); s.roughness = 0.16; s.normal = in.N; }
		if ( in.vs.part > 3.5 ) { s.emissive = vec3f( 0.025, 0.18, 0.13 ) * ( 0.12 + mat.wake * 0.65 ); }
` : /* wgsl */`
		s.albedo *= mix( vec3f( 0.28, 0.42, 0.35 ), vec3f( 1.05, 0.90, 0.68 ), blotch );
		s.roughness = 0.54 + blotch * 0.20; s.specularIntensity = 0.35; s.translucency = s.albedo * 0.12;
		s.emissive = s.albedo * 0.08 + vec3f( 0.0, 0.008, 0.011 ) * blotch * ( 0.4 + mat.wake * 0.6 );
		if ( in.vs.part > 0.5 && in.vs.part < 1.5 ) { s.albedo = in.color.rgb * ( 0.75 + blotch * 0.25 ); s.roughness = 0.50; }
		if ( in.vs.part > 1.5 && in.vs.part < 2.5 ) { s.albedo = in.color.rgb; s.emissive = in.color.rgb * ( 0.16 + mat.wake * 1.2 ); s.roughness = 0.2; }
		if ( in.vs.part > 2.5 && in.vs.part < 3.5 ) { s.albedo = vec3f( 0.001, 0.006, 0.005 ); s.emissive = vec3f( 0.0 ); s.roughness = 0.14; }
		if ( in.vs.part > 3.5 ) { s.albedo = in.color.rgb * 0.3; s.emissive = in.color.rgb * ( 0.10 + mat.wake * 0.65 ); }
` }
		if ( in.vs.part > 1.5 && in.vs.part < 2.5 ) { s.emissive *= 1.0 + mat.reaction.z * 0.8; }
		if ( in.vs.part > 3.5 ) { s.emissive *= 1.0 + mat.reaction.z * ( 0.45 + 0.25 * sin( mat.age * 2.3 ) ); }
		s.albedo = mix( s.albedo, s.albedo * vec3f( 0.78, 0.61, 0.52 ), mat.reaction.w * 0.45 );
`,
	} );

}

function inkCloud() {

	const kit = new GeoKit();
	for ( let i = 0; i < 9; i ++ ) {

		const a = i * 2.399963, r = i === 0 ? 0 : 0.55;
		kit.add( 'ink', sphere( 0.58 + i % 3 * 0.05, 12, 8 ).scale( 0.8, 0.9, 1.3 ).translate( Math.cos( a ) * r, ( i % 3 - 1 ) * 0.27, ( i - 4 ) * 0.18 ) );

	}
	const material = new Material( {
		name: '巨章 · 扩散墨雾', lit: false, transparent: true, side: 'double', depthWrite: false, receiveShadows: false, velocityWeight: 0.2,
		uniforms: { age: [ 'f32', 0 ], density: [ 'f32', 0 ] },
		surface: /* wgsl */`
		let swirl = perlin3( in.P * 2.2 + vec3f( mat.age * 0.25, -mat.age * 0.3, 0.0 ) ) * 0.5 + 0.5;
		let edge = pow( abs( dot( in.N, in.V ) ), 0.7 );
		s.albedo = vec3f( 0.003, 0.009, 0.012 ); s.emissive = vec3f( 0.002, 0.005, 0.007 );
		s.alpha = mat.density * edge * smoothstep( 0.15, 0.80, swirl ) * 0.65;
		`,
	} );
	const mesh = new Mesh( kit.merged( 'ink' ), material );
	mesh.name = '巨章喷墨'; mesh.visible = false; mesh.userData.late = true; mesh.layers.set( LAYERS.TRANSPARENT );
	mesh.castShadow = false; mesh.receiveShadow = false;
	return mesh;

}

export class DeepBeast {

	constructor( { scene, terrain, colliders = null, onDiscover = null } ) {

		this.position = WORLD.abyss.center.clone();
		this.terrain = terrain; this.colliders = colliders;
		this.position.y = terrain.heightAt( this.position.x, this.position.z );
		const floor = ( x, z ) => terrain.heightAt( this.position.x + x, this.position.z + z ) - this.position.y;
		this.group = new Group(); this.group.name = '沉睡古神 · 深渊巨章';
		this.group.position.copy( this.position );
		this.material = beastMaterial();
		this.model = buildDeepBeast( floor );
		this.mesh = new Mesh( this.model.geometry, this.material );
		this.mesh.name = '八臂古神'; this.mesh.castShadow = true;
		this.group.add( this.mesh );
		this.patrolRadius = PATROL_RADIUS; this.patrolPhase = 0;
		this.creaturePosition = this.position.clone();
		const patrol = patrolHeights( terrain, this.position, this.model.geometry );
		this._patrolHeights = patrol.heights; this.guardLift = patrol.guardLift;
		this.material.uniforms.guardLift.value = this.guardLift;
		// x/y: eye yaw/pitch, z: beam response, w: defensive arm fold.
		this.reaction = new Vector4( 0, 0, 0, 0 );
		this._localVisitor = new Vector3(); this._focus = new Vector3(); this._direction = new Vector3(); this._linePoint = new Vector3(); this._inverse = new Quaternion();
		this._closeTime = 0; this._inkArmed = true;
		this.ink = { age: - 1, cooldown: 0, bursts: 0, density: 0, origin: new Vector3(), velocity: new Vector3() };
		this.inkMesh = inkCloud(); scene.add( this.inkMesh );
		// Broken megaliths stand on the actual seabed, beyond the creature's reach.
		const ruins = new GeoKit();
		for ( let i = 0; i < 9; i ++ ) {

			const a = i / 9 * TAU, x = Math.sin( a ) * 19, z = Math.cos( a ) * 19;
			const height = 1.5 + ( i % 4 ) * 0.8;
			const geometry = roundedBox( 1.1, height, 1.0, 0.12, 2 ).rotateZ( Math.sin( i * 3 ) * 0.18 ).rotateY( a ).translate( x, floor( x, z ) + height / 2 - 0.15, z );
			ruins.add( 'stone', geometry, { color: 0x48544f } );
			colliders?.addMeshBounds( geometry, this.position, a, { tag: 'abyss-megalith' } );

		}
		const stones = new Mesh( ruins.merged( 'stone' ), new Material( { name: 'Abyssal ruins', vertexColors: true, roughness: 0.95 } ) );
		stones.name = '深海遗迹'; stones.castShadow = true; this.group.add( stones );
		scene.add( this.group );
		this.time = 0; this.wake = 0; this.discovered = false; this.onDiscover = onDiscover;
		this.ready = null; this.realistic = false;
		this._collisionBodies = []; this._collisionArms = [];
		if ( colliders ) {

			// Mantle principal axes enclose its ridges and rearward shear. Rounded
			// head/eye pieces leave the surrounding ruins and arm gaps navigable.
			for ( const [ center, radii, tilt = 0 ] of [
				[ V( 0, 6, - 1.7 ), V( 4.0, 5.04, 4.15 ), - 0.598 ],
				[ V( 0, 3.5, 1.5 ), V( 3.16, 2.31, 2.96 ) ],
				[ V( - 2.42, 4.65, 3.55 ), V( 0.86, 0.64, 0.68 ) ],
				[ V( 2.42, 4.65, 3.55 ), V( 0.86, 0.64, 0.68 ) ],
			] ) {

				const rotation = new Quaternion().setFromAxisAngle( V( 1, 0, 0 ), tilt );
				this._collisionBodies.push( { center, radii, rotation, shape: colliders.addEllipsoid( center, radii, rotation ) } );

			}
			this._collisionArms = this.model.arms.map( ( arm ) => {

				const points = arm.collisionPoints.map( p => ( { ...p, world: new Vector3() } ) );
				const segments = points.slice( 1 ).map( ( p, i ) => colliders.addCapsule( points[ i ].position, p.position, Math.max( points[ i ].radius, p.radius ) ) );
				return { points, segments, angle: arm.angle };

			} );

		}
		this._moveCreature();

	}

	_moveCreature() {

		const pose = patrolPose( this.patrolPhase ), heights = this._patrolHeights, n = heights.length;
		const sample = this.patrolPhase / TAU * n, i = Math.floor( sample ), f = sample - i;
		const h = ( offset ) => heights[ ( i + offset + n ) % n ];
		// Uniform cubic B-spline: continuous position, velocity and acceleration,
		// with positive weights so the baked conservative height bound is retained.
		const height = ( ( 1 - f ) ** 3 * h( - 1 ) + ( 3 * f ** 3 - 6 * f * f + 4 ) * h( 0 ) + ( - 3 * f ** 3 + 3 * f * f + 3 * f + 1 ) * h( 1 ) + f ** 3 * h( 2 ) ) / 6;
		this.mesh.position.set( pose.x, height - this.position.y + this.wake * 0.04 * ( 1 + Math.sin( this.time * 0.5 ) ), pose.z );
		this.mesh.rotation.y = pose.yaw;
		this.creaturePosition.copy( this.position ).add( this.mesh.position );
		this._updateCollisions();

	}

	_updateCollisions() {

		const breath = 1 + 0.008 * Math.sin( this.time * 0.48 );
		for ( const { center, radii, rotation, shape } of this._collisionBodies ) {

			shape.center.copy( center ).multiplyScalar( breath ); shape.center.y += this.wake * 0.28;
			shape.center.applyQuaternion( this.mesh.quaternion ).add( this.creaturePosition );
			shape.radii.copy( radii ).multiplyScalar( breath );
			shape.rotation.copy( this.mesh.quaternion ).multiply( rotation );
			shape.inverse.copy( shape.rotation ).conjugate();

		}
		for ( let id = 0; id < this._collisionArms.length; id ++ ) {

			const { points, segments, angle } = this._collisionArms[ id ];
			for ( const { position, t, world } of points ) {

				// Same deformation as abyssPose in WGSL, including the squared
				// vertical weight. Both original and textured skins share this pose.
				const w = t * t * ( 0.15 + this.wake * 0.85 ), wave = Math.sin( this.time * 0.65 - t * 5 + id * 1.7 );
				world.copy( position );
				world.x += Math.cos( angle ) * wave * 0.65 * w;
				world.y += ( Math.sin( this.time * 0.48 - t * 4 + id ) * 0.35 + this.wake * 0.65 ) * w * w;
				world.z -= Math.sin( angle ) * wave * 0.65 * w;
				const fold = this.reaction.w * t * t;
				world.x *= 1 - fold * 0.22; world.z *= 1 - fold * 0.22; world.y += fold * this.guardLift;
				world.applyQuaternion( this.mesh.quaternion ).add( this.creaturePosition );

			}
			for ( let i = 0; i < segments.length; i ++ ) {

				segments[ i ].start.copy( points[ i ].world );
				segments[ i ].end.copy( points[ i + 1 ].world );

			}

		}

	}

	loadRealistic() {

		if ( this.ready ) return this.ready;
		const textures = [];
		this.ready = loadGLB( REALISTIC_URL ).then( async ( gltf ) => {

			const geometry = retargetDeepBeast( gltf, this.model.geometry );
			const gm = gltf.materials[ gltf.meshes[ 0 ][ 0 ].material ]?.pbrMetallicRoughness;
			const bindings = {};
			for ( const [ name, info, srgb ] of [ [ 'beastAlbedo', gm?.baseColorTexture, true ], [ 'beastOrm', gm?.metallicRoughnessTexture, false ] ] ) {

				const image = gltf.images[ gltf.textures[ info?.index ]?.source ];
				if ( ! image?.bytes ) throw new Error( 'Missing embedded octopus texture' );
				const px = await decodeImage( image.bytes, image.mimeType );
				const texture = new Texture( { label: name, width: px.width, height: px.height, format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm', data: px.data, mips: true, sampler: 'anisoRepeat' } );
				textures.push( texture ); texture.getGPU(); generateMipmaps( texture ); bindings[ name ] = texture;

			}
			const material = beastMaterial( bindings );
			for ( const key of [ 'wake', 'previousWake', 'age', 'previousAge', 'reaction', 'previousReaction', 'guardLift' ] ) material.uniforms[ key ].value = this.material.uniforms[ key ].value;
			this.mesh.geometry.dispose();
			this.material = material; this.mesh.material = material; this.mesh.geometry = geometry;
			this.realistic = true;
			return true;

		} ).catch( ( error ) => {

			for ( const texture of textures ) texture.destroy();
			console.warn( 'DeepBeast: original model retained', error );
			return false;

		} );
		return this.ready;

	}

	_lineOfSight( from, to ) {

		const dir = this._direction.subVectors( to, from ), distance = dir.length();
		if ( distance < 0.01 ) return true;
		dir.divideScalar( distance );
		if ( this.colliders?.raycast( from, dir, distance ) < distance - 0.25 ) return false;
		for ( let i = 1; i < 8; i ++ ) {

			const p = this._linePoint.copy( from ).lerp( to, i / 8 );
			if ( this.terrain.heightAt( p.x, p.z ) + 0.15 > p.y ) return false;

		}
		return true;

	}

	_updateReaction( dt, camera, player, lights ) {

		const active = player?.mode === 'swim' && player.position.y < - 4;
		const local = this._localVisitor;
		let yaw = 0, pitch = 0, beam = 0, guard = 0, gap = Infinity;
		if ( active && player.position.distanceToSquared( this.creaturePosition ) < 42 ** 2 ) {

			local.copy( player.position ).sub( this.creaturePosition ).applyQuaternion( this._inverse.copy( this.mesh.quaternion ).conjugate() );
			const skinGap = ( x, y, z, rx, ry, rz ) => {

				const norm = Math.hypot( x / rx, y / ry, z / rz );
				return norm > 1 ? Math.hypot( x, y, z ) * ( 1 - 1 / norm ) : 0;

			};
			gap = Math.min( skinGap( local.x, local.y - 3.5, local.z - 1.5, 3.1, 2.25, 2.9 ), skinGap( local.x, local.y - 6, local.z + 1.7 + ( local.y - 6 ) * 0.17, 3.65, 4.7, 4 ) );
			this._focus.set( 0, 4.55, 3.3 ).applyQuaternion( this.mesh.quaternion ).add( this.creaturePosition );
			const visible = this._lineOfSight( this._focus, player.position );
			if ( visible && local.z > 3.3 ) {

				yaw = MathUtils.clamp( Math.atan2( local.x, local.z - 3.3 ), - 0.45, 0.45 );
				pitch = MathUtils.clamp( Math.atan2( local.y + 0.162 - 4.55, Math.hypot( local.x, local.z - 3.3 ) ), - 0.3, 0.3 );

			}
			const fl = lights?.flashlight;
			if ( fl?.on && lights.enabled !== false ) {

				const from = fl.primed ? fl.position : camera.position;
				const direction = fl.primed ? fl.dir : camera.getWorldDirection( this._linePoint );
				const toward = this._direction.subVectors( this._focus, from ), distance = toward.length();
				const cosine = distance > 0.01 ? toward.divideScalar( distance ).dot( direction ) : 1;
				if ( distance < ( fl.range ?? 30 ) && cosine > ( fl.cosOuter ?? 0.819 ) && this._lineOfSight( from, this._focus ) ) {

					beam = MathUtils.smoothstep( cosine, fl.cosOuter ?? 0.819, fl.cosInner ?? 0.988 ) * ( 1 - MathUtils.smoothstep( distance, 18, fl.range ?? 30 ) );

				}

			}
			guard = 1 - MathUtils.smoothstep( gap, 0.8, 3.5 );

		}
		this.ink.cooldown = Math.max( 0, this.ink.cooldown - dt );
		if ( gap > 5 ) this._inkArmed = true;
		this._closeTime = gap < 1.4 ? this._closeTime + dt : 0;
		if ( this._closeTime >= 1.6 && this._inkArmed && this.ink.cooldown === 0 && this.ink.age < 0 ) {

			this.ink.age = 0; this.ink.cooldown = 18; this.ink.bursts ++; this._inkArmed = false;
			const side = local.x < 0 ? - 1 : 1;
			this.ink.origin.set( side * 3.65, 3.6, 2.6 ).applyQuaternion( this.mesh.quaternion ).add( this.creaturePosition );
			// The siphon jets forwards: aiming directly at a very close visitor
			// would send the cloud backwards through the head before it emerges.
			this.ink.velocity.set( MathUtils.clamp( local.x - side * 3.65, - 0.7, 0.7 ), MathUtils.clamp( local.y - 3.6, - 0.1, 0.5 ), 2 ).normalize().multiplyScalar( 2 ).applyQuaternion( this.mesh.quaternion );
			this.inkMesh.quaternion.copy( this.mesh.quaternion );
			this.inkMesh.resetVelocity = true;

		}
		if ( this.ink.age >= 0 && this.ink.age < 1.5 ) guard = Math.max( guard, 0.8 );
		const gazeK = 1 - Math.exp( - dt * 4 ), bodyK = 1 - Math.exp( - dt * 2.5 );
		this.reaction.x += ( yaw - this.reaction.x ) * gazeK;
		this.reaction.y += ( pitch - this.reaction.y ) * gazeK;
		this.reaction.z += ( beam - this.reaction.z ) * bodyK;
		this.reaction.w += ( guard - this.reaction.w ) * bodyK;

	}

	_updateInk( dt, camera ) {

		const ink = this.ink;
		if ( ink.age >= 0 ) {

			ink.age += dt;
			if ( ink.age > 6 ) ink.age = - 1;

		}
		ink.density = ink.age < 0 ? 0 : MathUtils.smoothstep( ink.age, 0, 0.2 ) * ( 1 - MathUtils.smoothstep( ink.age, 2.8, 6 ) );
		this.inkMesh.visible = ink.age >= 0 && camera.position.distanceToSquared( ink.origin ) < 100 ** 2;
		if ( ink.age < 0 ) return;
		this.inkMesh.position.copy( ink.origin ).addScaledVector( ink.velocity, Math.min( ink.age, 3 ) );
		this.inkMesh.position.y += ink.age * 0.22;
		this.inkMesh.scale.setScalar( 0.55 + ink.age * 0.55 );
		this.inkMesh.material.uniforms.age.value = ink.age;
		this.inkMesh.material.uniforms.density.value = ink.density;

	}

	inkOccludes( from, to ) {

		// ponytail: a dense sphere approximates the puff cluster for sight checks;
		// sample cloud density if photography at its wispy edges needs finer contact.
		if ( this.ink.age < 0 || this.ink.density < 0.22 ) return false;
		const delta = this._direction.subVectors( to, from ), length2 = delta.lengthSq();
		if ( length2 < 0.0001 ) return false;
		const p = this._linePoint.subVectors( this.inkMesh.position, from );
		const t = MathUtils.clamp( p.dot( delta ) / length2, 0, 1 );
		p.copy( from ).addScaledVector( delta, t );
		const radius = this.inkMesh.geometry.boundingSphere.radius * this.inkMesh.scale.x * 0.72;
		return p.distanceToSquared( this.inkMesh.position ) < radius * radius;

	}

	update( dt, camera, player = null, lights = null ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.1 );
		const visitor = player?.position || camera.position;
		const underwater = visitor.y < - 4;
		const near = Math.hypot( visitor.x - this.creaturePosition.x, visitor.z - this.creaturePosition.z ) < 42 && Math.abs( visitor.y - this.creaturePosition.y - 5 ) < 24;
		this.material.uniforms.previousWake.value = this.wake;
		this.material.uniforms.previousReaction.value.copy( this.reaction );
		this._updateReaction( dt, camera, player, lights );
		this._updateInk( dt, camera );
		this.wake += ( ( near && underwater ? 1 : 0 ) - this.wake ) * ( 1 - Math.exp( - dt * 1.5 ) );
		this.material.uniforms.previousAge.value = this.time;
		this.time += dt;
		// Slow breathing pauses between glides; sleep slows the same continuous
		// route rather than snapping the creature back to its starting point.
		this.patrolPhase = ( this.patrolPhase + dt * 0.045 * ( 0.18 + this.wake * 0.82 ) * ( 0.08 + 0.92 * Math.cos( this.time * 0.045 ) ** 2 ) ) % TAU;
		this._moveCreature();
		this.material.uniforms.age.value = this.time;
		this.material.uniforms.wake.value = this.wake;
		this.material.uniforms.reaction.value.copy( this.reaction );
		const visible = camera.position.distanceToSquared( this.position ) < 190 ** 2;
		if ( visible && ! this.group.visible ) this.mesh.resetVelocity = true; // no stale model matrix after distant culling
		this.group.visible = visible;
		if ( this.group.visible && ! this.ready && GPU.device ) this.loadRealistic();
		if ( player && near && underwater && ! this.discovered ) {

			this.discovered = true;
			this.onDiscover?.( '你发现了「沉睡古神」……它的触手正在苏醒。按 L 开灯，保持距离观察。' );

		}

	}

}
