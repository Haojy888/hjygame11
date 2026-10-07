import { Group, Mesh, PlaneGeometry, Vector2, Vector3, Vector4, Matrix4 } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { UniformBlock, ShaderModule } from '../engine/gpu/Shader.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { G } from '../engine/render/Frame.js';

const MAX_SHELTERS = 32;
const BOX = 36, HEIGHT = 26;
const clamp01 = v => Number.isFinite( v ) ? Math.max( 0, Math.min( 1, v ) ) : 0;

// Two procedural instanced draws. Drops occupy a world-space volume around the camera;
// rings follow the same Eulerian water surface as the hull, including FFT, surf and wakes.
// Shelter rays travel upstream against the rain, so a tilted boat roof also blocks slanting rain.
export class Rain {

	constructor( { terrain = null, query = null, colliders = null, count = 3200, rippleCount = 640 } = {} ) {

		this.group = new Group();
		this.group.name = 'Rain';
		this.group.visible = false;
		this.colliders = colliders;
		this.sheltered = 0;
		this._boxes = [];
		this._nearby = [];
		this._lastPosition = new Vector3( Infinity, Infinity, Infinity );
		this._refresh = 0;
		this._point = new Vector3();
		this._upstream = new Vector3();
		this.uniforms = new UniformBlock( 'RainParams', {
			camera: [ 'vec3f', new Vector3() ], intensity: [ 'f32', 0 ],
			wind: [ 'vec2f', new Vector2() ], drift: [ 'vec2f', new Vector2() ],
			time: [ 'f32', 0 ], flash: [ 'f32', 0 ],
			boxCount: [ 'u32', 0 ], boatCount: [ 'u32', 0 ],
			boatInv: [ 'mat4x4f', new Matrix4() ],
			hull: [ 'vec4f', new Vector4() ], // aft, bow, half beam, enabled
			centers: [ `vec4f[${ MAX_SHELTERS }]`, Array.from( { length: MAX_SHELTERS }, () => new Vector4() ) ],
			halves: [ `vec4f[${ MAX_SHELTERS }]`, Array.from( { length: MAX_SHELTERS }, () => new Vector4() ) ],
		}, { label: 'rain' } );
		const hasTerrain = !! terrain?.module;
		const params = new ShaderModule( { name: 'rainParams', uniforms: this.uniforms, uniformName: 'rain', code: /* wgsl */`
fn rainHash( n: f32 ) -> vec3f {
	return fract( sin( vec3f( n, n + 17.13, n + 43.71 ) ) * vec3f( 43758.5453, 22578.1459, 19642.3490 ) );
}
fn rainCovered( p: vec3f ) -> bool {
	let upstream = vec3f( -rain.wind.x / 19.0, 1.0, -rain.wind.y / 19.0 );
	for ( var i = 0u; i < rain.boxCount; i++ ) {
		let b = rain.centers[ i ]; let h = rain.halves[ i ];
		var q = p; var d = upstream;
		if ( i < rain.boatCount ) {
			q = ( rain.boatInv * vec4f( q, 1.0 ) ).xyz;
			d = ( rain.boatInv * vec4f( d, 0.0 ) ).xyz;
		}
		q -= b.xyz;
		q = vec3f( q.x * b.w - q.z * h.w, q.y, q.x * h.w + q.z * b.w );
		d = vec3f( d.x * b.w - d.z * h.w, d.y, d.x * h.w + d.z * b.w );
		// Slabs, including parallel rays: never divide by zero or produce NaN at an edge.
		var near = 0.0; var far = 80.0;
		for ( var axis = 0u; axis < 3u; axis++ ) {
			if ( abs( d[ axis ] ) < 0.00001 ) {
				if ( abs( q[ axis ] ) > h[ axis ] ) { far = -1.0; }
			} else {
				let a = ( -h[ axis ] - q[ axis ] ) / d[ axis ];
				let z = ( h[ axis ] - q[ axis ] ) / d[ axis ];
				near = max( near, min( a, z ) ); far = min( far, max( a, z ) );
			}
		}
		if ( far >= near ) { return true; }
	}
	return false;
}
fn rainInsideHull( p: vec3f ) -> bool {
	if ( rain.hull.w < 0.5 ) { return false; }
	let q = ( rain.boatInv * vec4f( p, 1.0 ) ).xyz;
	// A conservative footprint also covers the hull hidden below the boat's water mask.
	return q.z > rain.hull.x - 0.2 && q.z < rain.hull.y + 0.2 && abs( q.x ) < rain.hull.z + 0.15;
}
` } );
		const shared = { lit: false, transparent: true, depthWrite: false, depthTest: true, side: 'double', blending: 'premultiplied', receiveShadows: false };
		this.material = new Material( {
			...shared, name: 'RainStreaks', modules: [ params, hasTerrain && terrain.module ].filter( Boolean ),
			// Like AirMotes, the narrow core owns depth and motion. Otherwise TAA follows the
			// stationary sky behind a falling drop and leaves long dotted trails across the view.
			depthWrite: true, defines: { VELOCITY_OPAQUE: 1 },
			varyings: { rainUV: 'vec2f', rainAlpha: 'f32' },
			vertex: /* wgsl */`
	let h = rainHash( f32( v.instance ) * 1.713 + 0.19 );
	let speed = 17.0 + h.z * 7.0;
	let xz = rain.camera.xz + ( fract( h.xz + ( rain.drift - rain.camera.xz ) / ${ BOX }.0 ) - 0.5 ) * ${ BOX }.0;
	let y = rain.camera.y + ( fract( h.y - rain.time * speed / ${ HEIGHT }.0 - rain.camera.y / ${ HEIGHT }.0 ) - 0.5 ) * ${ HEIGHT }.0;
	let p = vec3f( xz.x, y, xz.y );
	let vel = vec3f( rain.wind.x, -speed, rain.wind.y );
	let axis = normalize( vel );
	let toCam = rain.camera - p;
	let distance = max( length( toCam ), 0.01 );
	let view = toCam / distance;
	let across = normalize( cross( axis, view ) + vec3f( 0.0001, 0.0, 0.0 ) );
	let pixel = distance * 2.0 / max( frame.proj[ 1 ][ 1 ] * frame.resolution.y, 1.0 );
	let width = max( 0.006 + h.z * 0.005, pixel * 0.7 );
	let halfLength = length( vel ) * ( 0.009 + h.x * 0.007 );
	let ground = ${ hasTerrain ? 'max( terrainHeightAt( xz ), frame.seaLevel )' : 'frame.seaLevel' };
	let edge = 1.0 - smoothstep( ${ BOX * 0.35 }, ${ BOX * 0.5 }, max( abs( p.x - rain.camera.x ), abs( p.z - rain.camera.z ) ) );
	var alpha = rain.intensity * edge * smoothstep( 0.4, 1.6, distance ) * ( 1.0 - smoothstep( 17.0, 24.0, distance ) );
	alpha *= smoothstep( 0.0, 0.35, y - ground ) * ( 0.35 + h.y * 0.25 );
	if ( rainCovered( p - axis * halfLength ) || rainCovered( p + axis * halfLength ) ) { alpha = 0.0; }
	let world = p + across * v.position.x * width + axis * v.position.y * halfLength;
	o.rainUV = v.position.xy; o.rainAlpha = alpha;
	v.useWorld = true; v.worldPos = select( vec3f( 0.0, -1e5, 0.0 ), world, alpha > 0.002 );
	v.worldNormal = view; v.prevWorldPos = v.worldPos - vel * frame.dt;
`,
			surface: /* wgsl */`
	let uv = in.vs.rainUV;
	let a = in.vs.rainAlpha * exp( -uv.x * uv.x * 3.0 ) * ( 1.0 - smoothstep( 0.55, 1.0, abs( uv.y ) ) );
	if ( a < 0.006 ) { discard; }
	let light = 0.24 + min( length( frame.skyIrradiance ), 1.5 ) * 0.5 + rain.flash * 1.2;
	s.albedo = vec3f( 0.66, 0.76, 0.88 ) * light * a; s.alpha = a;
`,
			output: 'r.color = vec4f( s.albedo, s.alpha );',
		} );
		this.rippleMaterial = new Material( {
			...shared, name: 'RainWaterRings', modules: [ params, query?.heightModule, hasTerrain && terrain.module ].filter( Boolean ),
			varyings: { rainUV: 'vec2f', rainAlpha: 'f32', rainAge: 'f32' },
			vertex: /* wgsl */`
	let id = f32( v.instance );
	let h = rainHash( id * 2.317 + 9.2 );
	let cycle = rain.time * ( 1.15 + h.y * 0.7 ) + h.x;
	let age = fract( cycle );
	let seed = rainHash( id * 3.19 + floor( cycle ) * 13.77 );
	let B = 28.0;
	let xz = rain.camera.xz + ( fract( seed.xz - rain.camera.xz / B ) - 0.5 ) * B;
	let height = ${ query ? 'waterQueryHeightAtXZ( xz )' : 'frame.seaLevel' };
	let p = vec3f( xz.x, height + 0.035, xz.y );
	let r = mix( 0.025, 0.16 + h.z * 0.10, age );
	var alpha = rain.intensity * ( 1.0 - age ) * smoothstep( 0.0, 0.06, age );
	alpha *= 1.0 - smoothstep( 9.0, 14.0, length( p.xz - rain.camera.xz ) );
	if ( rainCovered( p ) || rainInsideHull( p ) ${ hasTerrain ? '|| terrainHeightAt( xz ) > height - 0.08' : '' } ) { alpha = 0.0; }
	var world = p + vec3f( v.position.x * r, 0.0, v.position.y * r );
	${ query ? 'world.y = waterQueryHeightAtXZ( world.xz ) + 0.035;' : '' }
	o.rainUV = v.position.xy; o.rainAlpha = alpha; o.rainAge = age;
	v.useWorld = true; v.worldPos = select( vec3f( 0.0, -1e5, 0.0 ), world, alpha > 0.002 );
	v.worldNormal = vec3f( 0.0, 1.0, 0.0 ); v.prevWorldPos = v.worldPos;
`,
			surface: /* wgsl */`
	let radius = length( in.vs.rainUV );
	let ring = exp( -pow( ( radius - 0.76 ) / 0.085, 2.0 ) );
	let inner = exp( -pow( ( radius - 0.43 ) / 0.08, 2.0 ) ) * ( 1.0 - in.vs.rainAge ) * 0.35;
	let a = ( ring + inner ) * in.vs.rainAlpha * 0.32;
	if ( a < 0.006 ) { discard; }
	s.albedo = vec3f( 0.48, 0.65, 0.74 ) * ( 0.55 + rain.flash ) * a; s.alpha = a;
`,
			output: 'r.color = vec4f( s.albedo, s.alpha );',
		} );
		const make = ( name, material, instances, order ) => {

			const geometry = new PlaneGeometry( 2, 2 );
			geometry.instanceCount = Math.max( 1, Math.floor( instances ) );
			const mesh = new Mesh( geometry, material );
			mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
			mesh.renderOrder = order; mesh.layers.set( LAYERS.TRANSPARENT ); this.group.add( mesh );
			return mesh;

		};
		this.mesh = make( 'RainStreaks', this.material, count, 23 );
		this.ripples = make( 'RainWaterRings', this.rippleMaterial, rippleCount, 22 );
		this._worldBoxes = this._buildWorldShelters();

	}

	_buildWorldShelters() {

		const boxes = ( this.colliders?.boxes || [] ).filter( b => b.solid !== false && b.half.x * b.half.z > 0.3 ).slice();
		// The open boathouse has wall colliders, but its rendered gable roof has no collider.
		const walls = ( this.colliders?.boxes || [] ).filter( b => b.tag === 'boathouse' && b.half.x < b.half.z );
		if ( walls.length === 2 ) {

			const a = walls[ 0 ], b = walls[ 1 ], center = a.center.clone().add( b.center ).multiplyScalar( 0.5 );
			center.y = Math.max( a.top, b.top ) + 0.08;
			boxes.push( { center, half: new Vector3( Math.hypot( a.center.x - b.center.x, a.center.z - b.center.z ) / 2 + 0.45, 0.1, a.half.z + 0.45 ), rotY: a.rotY } );

		}
		// Market roofs are visual geometry over sets of four posts. Recover their eave rectangles.
		const posts = ( this.colliders?.cylinders || [] ).filter( c => c.tag === 'stall' );
		for ( let i = 0; i + 3 < posts.length; i += 4 ) {

			const [ a, b, c, d ] = posts.slice( i, i + 4 );
			const center = new Vector3( ( a.x + b.x + c.x + d.x ) / 4, Math.max( a.yMax, b.yMax, c.yMax, d.yMax ), ( a.z + b.z + c.z + d.z ) / 4 );
			boxes.push( { center, half: new Vector3( Math.hypot( c.x - a.x, c.z - a.z ) / 2 + 0.5, 0.12, Math.hypot( b.x - a.x, b.z - a.z ) / 2 + 0.5 ), rotY: Math.atan2( b.x - a.x, b.z - a.z ) } );

		}
		return boxes;

	}

	update( dt, camera, { intensity = 0, windSpeed = G.windSpeed.value, windDirection = G.windDir.value, underwater = false, boat = null, flash = 0 } = {} ) {

		const u = this.uniforms.fields;
		intensity = clamp01( intensity );
		this.group.visible = intensity > 0.001 && ! underwater;
		if ( ! this.group.visible ) { this.sheltered = 0; return; }
		const elapsed = Number.isFinite( dt ) ? Math.max( 0, Math.min( dt, 0.1 ) ) : 0;
		u.camera.value.copy( camera.position ); u.intensity.value = intensity; u.flash.value = clamp01( flash );
		u.time.value += elapsed;
		const speed = Number.isFinite( windSpeed ) ? Math.max( 0, Math.min( windSpeed, 40 ) ) * 0.42 : 0;
		u.wind.value.set( windDirection?.x || 0, windDirection?.y || 0 ).normalize().multiplyScalar( speed );
		u.drift.value.addScaledVector( u.wind.value, elapsed );
		u.drift.value.x %= BOX; u.drift.value.y %= BOX;
		this._refresh -= elapsed;
		if ( this._refresh <= 0 || this._lastPosition.distanceToSquared( camera.position ) > 9 ) {

			this._refresh = 0.5; this._lastPosition.copy( camera.position );
			const distance = b => Math.hypot( b.center.x - camera.position.x, b.center.z - camera.position.z ) - Math.hypot( b.half.x, b.half.z );
			this._nearby = this._worldBoxes.filter( b => distance( b ) < BOX * 0.8 ).sort( ( a, b ) => distance( a ) - distance( b ) ).slice( 0, MAX_SHELTERS );

		}
		this._boxes.length = 0;
		const model = boat?.model || boat;
		if ( model?.group && model?.lines ) {

			model.group.updateMatrixWorld( true );
			u.boatInv.value.copy( model.group.matrixWorld ).invert();
			u.hull.value.set( model.lines.zAft, model.lines.zBow, model.dimensions.beam / 2, 1 );
			for ( const b of model.colliders || [] ) if ( [ 'roof', 'canopyRoof', 'houseWall', 'console', 'deck', 'foredeck' ].includes( b.tag ) ) this._boxes.push( b );

		} else u.hull.value.w = 0;
		u.boatCount.value = this._boxes.length;
		this._boxes.push( ...this._nearby.slice( 0, MAX_SHELTERS - this._boxes.length ) );
		u.boxCount.value = this._boxes.length;
		for ( let i = 0; i < this._boxes.length; i ++ ) {

			const b = this._boxes[ i ], yaw = b.rotY || 0;
			u.centers.value[ i ].set( b.center.x, b.center.y, b.center.z, Math.cos( yaw ) );
			u.halves.value[ i ].set( b.half.x, b.half.y, b.half.z, Math.sin( yaw ) );

		}
		this.sheltered = this.isSheltered( camera.position ) ? 1 : 0;

	}

	isSheltered( position ) {

		const u = this.uniforms.fields, p = this._point, d = this._upstream;
		for ( let i = 0; i < this._boxes.length; i ++ ) {

			const b = this._boxes[ i ];
			p.copy( position ); d.set( -u.wind.value.x / 19, 1, -u.wind.value.y / 19 );
			if ( i < u.boatCount.value ) { p.applyMatrix4( u.boatInv.value ); d.transformDirection( u.boatInv.value ); }
			p.sub( b.center );
			const c = Math.cos( b.rotY || 0 ), s = Math.sin( b.rotY || 0 );
			p.set( p.x * c - p.z * s, p.y, p.x * s + p.z * c ); d.set( d.x * c - d.z * s, d.y, d.x * s + d.z * c );
			let near = 0, far = 80;
			for ( const axis of [ 'x', 'y', 'z' ] ) {

				if ( Math.abs( d[ axis ] ) < 1e-5 ) { if ( Math.abs( p[ axis ] ) > b.half[ axis ] ) far = -1; }
				else { const a = ( -b.half[ axis ] - p[ axis ] ) / d[ axis ], z = ( b.half[ axis ] - p[ axis ] ) / d[ axis ]; near = Math.max( near, Math.min( a, z ) ); far = Math.min( far, Math.max( a, z ) ); }

			}
			if ( far >= near ) return true;

		}
		return false;

	}

	dispose() {

		this.group.visible = false;
		for ( const mesh of [ this.mesh, this.ripples ] ) { mesh.geometry.dispose(); mesh.material.dispose(); }

	}

}
