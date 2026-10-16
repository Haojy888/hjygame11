import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Mesh, TubeGeometry, Vector3 } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { ShaderModule } from '../engine/gpu/Shader.js';
import { commonModule } from '../engine/render/wgsl/common.js';
import { GeoKit, alignY, roundedBox, lathe, sphere, tube } from './boat/GeoKit.js';
import { WORLD } from './WorldLayout.js';

const TAU = Math.PI * 2;
const V = ( x, y, z ) => new Vector3( x, y, z );
const up = V( 0, 1, 0 );

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
		arms.push( { angle, length } );
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
fn abyssPose( p: vec3f, arm: f32, time: f32, wake: f32 ) -> vec3f {
	if ( arm < 1.0 ) { return p * ( 1.0 + 0.008 * sin( time * 0.48 ) ) + vec3f( 0.0, wake * 0.28, 0.0 ); }
	let id = floor( arm ) - 1.0;
	let t = fract( arm ) / 0.9;
	let a = id * 0.785398163 + 0.392699082;
	let w = t * t * ( 0.15 + wake * 0.85 );
	let wave = sin( time * 0.65 - t * 5.0 + id * 1.7 );
	return p + vec3f( cos( a ) * wave * 0.65, ( sin( time * 0.48 - t * 4.0 + id ) * 0.35 + wake * 0.65 ) * w, -sin( a ) * wave * 0.65 ) * w;
}
`,
} );

function beastMaterial() {

	return new Material( {
		name: 'Abyssal elder · living skin', vertexColors: true, side: 'double',
		modules: [ animation ], attributes: { aux: 'vec4f' },
		varyings: { localP: 'vec3f', part: 'f32' },
		uniforms: { wake: [ 'f32', 0 ], previousWake: [ 'f32', 0 ], age: [ 'f32', 0 ], previousAge: [ 'f32', 0 ] },
		vertex: /* wgsl */`
		o.localP = v.position; o.part = v.aux.z;
		let posed = abyssPose( v.position, v.aux.w, mat.age, mat.wake );
		let previous = abyssPose( v.position, v.aux.w, mat.previousAge, mat.previousWake );
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
		s.albedo *= mix( vec3f( 0.28, 0.42, 0.35 ), vec3f( 1.05, 0.90, 0.68 ), blotch );
		s.roughness = 0.54 + blotch * 0.20; s.specularIntensity = 0.35; s.translucency = s.albedo * 0.12;
		s.emissive = s.albedo * 0.08 + vec3f( 0.0, 0.008, 0.011 ) * blotch * ( 0.4 + mat.wake * 0.6 );
		if ( in.vs.part > 0.5 && in.vs.part < 1.5 ) { s.albedo = in.color.rgb * ( 0.75 + blotch * 0.25 ); s.roughness = 0.50; }
		if ( in.vs.part > 1.5 && in.vs.part < 2.5 ) { s.albedo = in.color.rgb; s.emissive = in.color.rgb * ( 0.16 + mat.wake * 1.2 ); s.roughness = 0.2; }
		if ( in.vs.part > 2.5 && in.vs.part < 3.5 ) { s.albedo = vec3f( 0.001, 0.006, 0.005 ); s.emissive = vec3f( 0.0 ); s.roughness = 0.14; }
		if ( in.vs.part > 3.5 ) { s.albedo = in.color.rgb * 0.3; s.emissive = in.color.rgb * ( 0.10 + mat.wake * 0.65 ); }
`,
	} );

}

export class DeepBeast {

	constructor( { scene, terrain, onDiscover = null } ) {

		this.position = WORLD.abyss.center.clone();
		this.position.y = terrain.heightAt( this.position.x, this.position.z );
		const floor = ( x, z ) => terrain.heightAt( this.position.x + x, this.position.z + z ) - this.position.y;
		this.group = new Group(); this.group.name = '沉睡古神 · 深渊巨章';
		this.group.position.copy( this.position );
		this.material = beastMaterial();
		this.model = buildDeepBeast( floor );
		this.mesh = new Mesh( this.model.geometry, this.material );
		this.mesh.name = '八臂古神'; this.mesh.castShadow = true;
		this.group.add( this.mesh );
		// Broken megaliths stand on the actual seabed, beyond the creature's reach.
		const ruins = new GeoKit();
		for ( let i = 0; i < 9; i ++ ) {

			const a = i / 9 * TAU, x = Math.sin( a ) * 19, z = Math.cos( a ) * 19;
			const height = 1.5 + ( i % 4 ) * 0.8;
			ruins.add( 'stone', roundedBox( 1.1, height, 1.0, 0.12, 2 ).rotateZ( Math.sin( i * 3 ) * 0.18 ).rotateY( a ).translate( x, floor( x, z ) + height / 2 - 0.15, z ), { color: 0x48544f } );

		}
		const stones = new Mesh( ruins.merged( 'stone' ), new Material( { name: 'Abyssal ruins', vertexColors: true, roughness: 0.95 } ) );
		stones.name = '深海遗迹'; stones.castShadow = true; this.group.add( stones );
		scene.add( this.group );
		this.time = 0; this.wake = 0; this.discovered = false; this.onDiscover = onDiscover;

	}

	update( dt, camera, player = null ) {

		dt = Math.min( Math.max( Number.isFinite( dt ) ? dt : 0, 0 ), 0.1 );
		const visitor = player?.position || camera.position;
		const underwater = visitor.y < - 4;
		const near = Math.hypot( visitor.x - this.position.x, visitor.z - this.position.z ) < 42 && Math.abs( visitor.y - this.position.y - 5 ) < 24;
		this.material.uniforms.previousWake.value = this.wake;
		this.wake += ( ( near && underwater ? 1 : 0 ) - this.wake ) * ( 1 - Math.exp( - dt * 1.5 ) );
		this.material.uniforms.previousAge.value = this.time;
		this.time += dt;
		this.material.uniforms.age.value = this.time;
		this.material.uniforms.wake.value = this.wake;
		this.group.visible = camera.position.distanceToSquared( this.position ) < 190 ** 2;
		if ( player && near && underwater && ! this.discovered ) {

			this.discovered = true;
			this.onDiscover?.( '你发现了「沉睡古神」……它的触手正在苏醒。按 L 开灯，保持距离观察。' );

		}

	}

}
