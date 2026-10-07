import { Group, Mesh, BufferGeometry, Float32BufferAttribute, Vector3 } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';

// A single draw for the branching, world-space channel and its soft glow. The caller owns
// the flash envelope and thunder delay; no screen overlay or independent strobe timer.
export class Lightning {

	constructor() {

		this.group = new Group(); this.group.name = 'Lightning'; this.group.visible = false;
		this.position = new Vector3();
		this.material = new Material( {
			name: 'Lightning', lit: false, transparent: true, blending: 'additive', side: 'double',
			depthWrite: false, depthTest: true, receiveShadows: false, velocityWeight: 0,
			uniforms: { strength: [ 'f32', 0 ] },
			attributes: { channelEnd: 'vec3f', channelWidth: 'f32' },
			varyings: { boltUV: 'vec2f', boltWidth: 'f32' },
			vertex: /* wgsl */`
	let a = v.position; let b = v.channelEnd;
	let axis = normalize( b - a );
	let center = mix( a, b, v.uv.y );
	let view = normalize( frame.cameraPos - center );
	let across = normalize( cross( axis, view ) + vec3f( 0.00001, 0.0, 0.0 ) );
	let pixel = length( frame.cameraPos - center ) * 2.0 / max( frame.proj[ 1 ][ 1 ] * frame.resolution.y, 1.0 );
	let halfWidth = max( v.channelWidth * 4.5, pixel * 2.2 );
	let world = center + across * ( v.uv.x * 2.0 - 1.0 ) * halfWidth;
	o.boltUV = vec2f( v.uv.x * 2.0 - 1.0, v.uv.y ); o.boltWidth = max( v.channelWidth, pixel * 0.7 ) / halfWidth;
	v.useWorld = true; v.worldPos = world; v.prevWorldPos = world; v.worldNormal = view;
`,
			surface: /* wgsl */`
	let x = abs( in.vs.boltUV.x );
	let core = exp( -pow( x / max( in.vs.boltWidth, 0.04 ), 2.0 ) * 2.0 );
	let glow = exp( -x * x * 5.0 ) * 0.22;
	s.albedo = vec3f( 0.0 );
	s.emissive = ( vec3f( 10.0, 11.0, 13.0 ) * core + vec3f( 0.8, 1.0, 2.4 ) * glow ) * mat.strength;
	s.alpha = min( 1.0, ( core + glow ) * mat.strength );
`,
		} );
		this.mesh = new Mesh( new BufferGeometry(), this.material );
		this.mesh.name = 'LightningChannel'; this.mesh.frustumCulled = false;
		this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.renderOrder = 20;
		this.mesh.layers.set( LAYERS.TRANSPARENT ); this.group.add( this.mesh );
		this.active = false;
		// App precompiles hidden effects: keep the full vertex layout available before the first strike.
		this.strike( new Vector3(), { seed: 0 } ); this.clear();

	}

	strike( position, { height = 180, seed = Math.floor( Math.random() * 0xffffffff ) } = {} ) {

		if ( ! position || ! [ position.x, position.y, position.z ].every( Number.isFinite ) ) return false;
		height = Number.isFinite( height ) ? Math.max( 20, Math.min( height, 1200 ) ) : 180;
		this.position.copy( position );
		const random = () => { seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; return seed / 4294967296; };
		const positions = [], ends = [], widths = [], uvs = [], indices = [];
		const segment = ( a, b, width ) => {

			const start = positions.length / 3;
			for ( const [ x, y ] of [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ] ) {

				positions.push( a.x, a.y, a.z ); ends.push( b.x, b.y, b.z ); widths.push( width ); uvs.push( x, y );

			}
			indices.push( start, start + 1, start + 2, start + 2, start + 1, start + 3 );

		};
		const path = [], top = position.clone().add( new Vector3( ( random() - 0.5 ) * height * 0.22, height, ( random() - 0.5 ) * height * 0.2 ) );
		for ( let i = 0; i <= 26; i ++ ) {

			const t = i / 26, p = top.clone().lerp( position, t ), spread = Math.sin( t * Math.PI ) * height * 0.065;
			p.x += ( random() - 0.5 ) * spread; p.z += ( random() - 0.5 ) * spread;
			path.push( p );
			if ( i ) segment( path[ i - 1 ], p, 0.16 + ( 1 - t ) * 0.12 );

		}
		for ( const index of [ 5, 9, 13, 17 ] ) {

			let a = path[ index ];
			const direction = random() * Math.PI * 2, span = height * ( 0.08 + random() * 0.09 );
			const target = a.clone().add( new Vector3( Math.cos( direction ) * span, -height * ( 0.13 + random() * 0.09 ), Math.sin( direction ) * span ) );
			const origin = a.clone();
			for ( let i = 1; i <= 7; i ++ ) {

				const t = i / 7, b = origin.clone().lerp( target, t );
				b.x += ( random() - 0.5 ) * height * 0.025; b.z += ( random() - 0.5 ) * height * 0.025;
				segment( a, b, 0.13 * ( 1 - t * 0.75 ) ); a = b;

			}

		}
		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'channelEnd', new Float32BufferAttribute( ends, 3 ) );
		geometry.setAttribute( 'channelWidth', new Float32BufferAttribute( widths, 1 ) );
		geometry.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
		geometry.setIndex( indices );
		this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
		this.active = true; this.group.visible = true; this.material.set( 'strength', 1 );
		return this.position;

	}

	update( dt, camera, { intensity = 1 } = {} ) {

		const strength = Number.isFinite( intensity ) ? Math.max( 0, Math.min( intensity, 1 ) ) : 0;
		this.group.visible = this.active && strength > 0.001;
		this.material.set( 'strength', strength );

	}

	clear() { this.active = false; this.group.visible = false; this.material.set( 'strength', 0 ); }

	dispose() { this.clear(); this.mesh.geometry.dispose(); this.material.dispose(); }

}
