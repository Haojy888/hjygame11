import * as THREE from '../engine/index.js';

// Lightweight collision world for the character controller and boat.
// Boxes are oriented around Y only. Walkable boxes (decks, floors, stairs) act as ground.
export class Colliders {

	constructor() {

		this.boxes = [];
		this.cylinders = [];
		this.ellipsoids = [];
		this.capsules = [];
		this._v = new THREE.Vector3();
		this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._normal = new THREE.Vector3();

	}

	// center: world center, half: half extents (x, y, z) in the box's local frame, rotY: yaw (radians)
	addBox( center, half, rotY = 0, { walkable = false, solid = true, tag = '', climbTo = null } = {} ) {

		const b = {
			center: center.clone(), half: half.clone(), rotY,
			cos: Math.cos( rotY ), sin: Math.sin( rotY ),
			walkable, solid, tag,
			climbTo: climbTo?.clone() || null,
			top: center.y + half.y, bottom: center.y - half.y,
			radius: Math.hypot( half.x, half.z ),
		};
		this.boxes.push( b );
		return b;

	}

	addCylinder( x, z, radius, yMin, yMax, { tag = '' } = {} ) {

		const c = { x, z, radius, yMin, yMax, tag };
		this.cylinders.push( c );
		return c;

	}

	// Bake the placed vertices once, so seabed fitting and leaning blocks use
	// the same position for their visible model and their collision volume.
	addMeshBounds( geometry, offset, rotY = 0, options = {} ) {

		const bounds = new THREE.Box3(), point = new THREE.Vector3();
		const p = geometry.attributes.position, c = Math.cos( rotY ), s = Math.sin( rotY );
		for ( let i = 0; i < p.count; i ++ ) {

			const x = p.getX( i ), z = p.getZ( i );
			bounds.expandByPoint( point.set( x * c - z * s, p.getY( i ), x * s + z * c ) );

		}
		const center = bounds.getCenter( new THREE.Vector3() ), half = bounds.getSize( new THREE.Vector3() ).multiplyScalar( 0.5 );
		const x = center.x, z = center.z;
		center.set( x * c + z * s, center.y, - x * s + z * c ).add( offset );
		// ponytail: yaw bounds conservatively enclose tilted/rounded corners;
		// use convex contact if a narrow angled passage needs exact clearance.
		return this.addBox( center, half, rotY, options );

	}

	// Animated creatures use rounded solids, separate from static camera occluders:
	// a photograph's subject marker can be inside the creature itself.
	addEllipsoid( center, radii, rotation = new THREE.Quaternion() ) {

		const shape = { center: center.clone(), radii: radii.clone(), rotation: rotation.clone(), inverse: rotation.clone().conjugate() };
		this.ellipsoids.push( shape );
		return shape;

	}

	addCapsule( start, end, radius ) {

		const shape = { start: start.clone(), end: end.clone(), radius };
		this.capsules.push( shape );
		return shape;

	}

	_toLocal( b, x, z ) {

		const dx = x - b.center.x, dz = z - b.center.z;
		return [ dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos ];

	}

	_toWorldDir( b, lx, lz ) {

		return [ lx * b.cos + lz * b.sin, - lx * b.sin + lz * b.cos ];

	}

	// Highest walkable surface under (x, z) not higher than maxY.
	groundHeightAt( x, z, maxY, pad = 0 ) {

		let best = - Infinity;
		for ( const b of this.boxes ) {

			if ( ! b.walkable || b.top > maxY ) continue;
			if ( Math.abs( x - b.center.x ) > b.radius + pad + 0.01 || Math.abs( z - b.center.z ) > b.radius + pad + 0.01 ) continue;
			const [ lx, lz ] = this._toLocal( b, x, z );
			if ( Math.abs( lx ) <= b.half.x + pad && Math.abs( lz ) <= b.half.z + pad ) best = Math.max( best, b.top );

		}

		return best;

	}

	// Push a vertical capsule (feet at pos.y) out of solid geometry. Returns true if collided.
	resolveCapsule( pos, radius, height, stepHeight = 0.35 ) {

		let hit = false;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			if ( pos.y + height <= b.bottom + 0.00001 || pos.y + stepHeight >= b.top - 0.00001 ) continue;
			if ( Math.abs( pos.x - b.center.x ) > b.radius + radius || Math.abs( pos.z - b.center.z ) > b.radius + radius ) continue;
			const [ lx, lz ] = this._toLocal( b, pos.x, pos.z );
			const cx = Math.max( - b.half.x, Math.min( b.half.x, lx ) );
			const cz = Math.max( - b.half.z, Math.min( b.half.z, lz ) );
			let dx = lx - cx, dz = lz - cz;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= radius * radius ) continue;
			let nx, nz, pen;
			if ( d2 > 1e-8 ) {

				const d = Math.sqrt( d2 );
				nx = dx / d; nz = dz / d; pen = radius - d;

			} else {

				// center inside box: push out along the smallest axis
				const px = b.half.x - Math.abs( lx ), pz = b.half.z - Math.abs( lz );
				if ( px < pz ) { nx = Math.sign( lx ) || 1; nz = 0; pen = px + radius; } else { nx = 0; nz = Math.sign( lz ) || 1; pen = pz + radius; }

			}

			const [ wx, wz ] = this._toWorldDir( b, nx, nz );
			pos.x += wx * pen;
			pos.z += wz * pen;
			hit = true;

		}

		for ( const c of this.cylinders ) {

			if ( pos.y + height <= c.yMin + 0.00001 || pos.y + stepHeight >= c.yMax - 0.00001 ) continue;
			const dx = pos.x - c.x, dz = pos.z - c.z;
			const r = c.radius + radius;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= r * r ) continue;
			const d = Math.sqrt( d2 );
			pos.x = c.x + ( d > 1e-8 ? dx / d : 1 ) * r;
			pos.z = c.z + ( d > 1e-8 ? dz / d : 0 ) * r;
			hit = true;

		}

		// Several touching body/arm pieces form one creature. Recheck neighbours
		// after pushing out so a correction cannot leave the swimmer inside another.
		for ( let pass = 0; pass < 6; pass ++ ) {

			let roundedHit = false;
			for ( const shape of this.ellipsoids ) roundedHit = this._resolveEllipsoid( shape, pos, radius, height ) || roundedHit;
			for ( const shape of this.capsules ) roundedHit = this._resolveRoundSegment( shape, pos, radius, height ) || roundedHit;
			hit ||= roundedHit;
			if ( ! roundedHit ) break;

		}
		return hit;

	}

	_resolveEllipsoid( shape, pos, radius, height ) {

		const { center, radii, inverse, rotation } = shape;
		const reach = Math.max( radii.x, radii.y, radii.z ) + radius;
		if ( Math.abs( pos.x - center.x ) > reach || Math.abs( pos.z - center.z ) > reach || pos.y > center.y + reach || pos.y + height < center.y - reach ) return false;
		// Conservative ellipsoid enclosing the sphere-expanded skin. The aspect
		// factor bounds the expansion in every direction, including tilted mantles.
		const padding = radius * Math.max( radii.x, radii.y, radii.z ) / Math.min( radii.x, radii.y, radii.z );
		const rx = radii.x + padding, ry = radii.y + padding, rz = radii.z + padding;
		const a = this._a.copy( pos ).add( this._v.set( 0, radius, 0 ) ).sub( center ).applyQuaternion( inverse );
		a.set( a.x / rx, a.y / ry, a.z / rz );
		const b = this._b.set( 0, Math.max( 0, height - 2 * radius ), 0 ).applyQuaternion( inverse );
		b.set( b.x / rx, b.y / ry, b.z / rz );
		const bb = b.lengthSq(), t = bb > 1e-12 ? THREE.MathUtils.clamp( - a.dot( b ) / bb, 0, 1 ) : 0;
		const n = this._normal.copy( a ).addScaledVector( b, t );
		if ( n.lengthSq() >= 1 - 1e-8 ) return false;
		n.set( n.x / rx, n.y / ry, n.z / rz ).applyQuaternion( rotation );
		if ( n.lengthSq() < 1e-12 ) n.set( 1, 0, 0 ); // also recover a saved position at the exact centre
		n.normalize();
		const d = this._v.copy( n ).applyQuaternion( inverse );
		d.set( d.x / rx, d.y / ry, d.z / rz );
		// Find the first clear position of the entire vertical capsule, rather
		// than just its feet. This also blocks approaching from above or below.
		let lo = 0, hi = reach * 2 + height;
		for ( let i = 0; i < 22; i ++ ) {

			const mid = ( lo + hi ) / 2;
			const x = a.x + d.x * mid, y = a.y + d.y * mid, z = a.z + d.z * mid;
			const u = bb > 1e-12 ? THREE.MathUtils.clamp( - ( x * b.x + y * b.y + z * b.z ) / bb, 0, 1 ) : 0;
			if ( ( x + b.x * u ) ** 2 + ( y + b.y * u ) ** 2 + ( z + b.z * u ) ** 2 < 1 ) lo = mid;
			else hi = mid;

		}
		pos.addScaledVector( n, hi + 0.00001 );
		return true;

	}

	_resolveRoundSegment( shape, pos, radius, height ) {

		const { start, end } = shape, reach = radius + shape.radius;
		if ( pos.x < Math.min( start.x, end.x ) - reach || pos.x > Math.max( start.x, end.x ) + reach || pos.z < Math.min( start.z, end.z ) - reach || pos.z > Math.max( start.z, end.z ) + reach || pos.y > Math.max( start.y, end.y ) + reach || pos.y + height < Math.min( start.y, end.y ) - reach ) return false;
		const h = Math.max( 0, height - 2 * radius ), dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
		const x = pos.x - start.x, y = pos.y + radius - start.y, z = pos.z - start.z;
		const aa = h * h, ee = dx * dx + dy * dy + dz * dz, ff = dx * x + dy * y + dz * z;
		let s = 0, t = 0;
		if ( aa < 1e-12 ) t = ee > 1e-12 ? THREE.MathUtils.clamp( ff / ee, 0, 1 ) : 0;
		else {

			const cc = h * y, bb = h * dy, denom = aa * ee - bb * bb;
			if ( ee < 1e-12 ) s = THREE.MathUtils.clamp( - cc / aa, 0, 1 );
			else {

				s = denom > 1e-12 ? THREE.MathUtils.clamp( ( bb * ff - cc * ee ) / denom, 0, 1 ) : 0;
				t = ( bb * s + ff ) / ee;
				if ( t < 0 ) { t = 0; s = THREE.MathUtils.clamp( - cc / aa, 0, 1 ); }
				else if ( t > 1 ) { t = 1; s = THREE.MathUtils.clamp( ( bb - cc ) / aa, 0, 1 ); }

			}

		}
		const n = this._normal.set( x - dx * t, y + h * s - dy * t, z - dz * t ), distance = n.length();
		if ( distance >= reach - 1e-8 ) return false;
		if ( distance < 1e-8 ) n.set( dz || 1, 0, - dx ).normalize();
		else n.divideScalar( distance );
		pos.addScaledVector( n, reach - distance + 0.00001 );
		return true;

	}

	// Character movement uses short steps to preserve thin walls and descending landings at low FPS.
	// The force-based boat solver still uses resolveCapsule directly.
	moveCapsule( pos, delta, radius, height, stepHeight = 0.35 ) {

		const steps = Math.max( 1, Math.ceil( delta.length() / ( radius * 0.5 ) ) );
		const step = delta.clone().divideScalar( steps );
		for ( let i = 0; i < steps; i ++ ) {

			const oldY = pos.y, dy = step.y;
			pos.add( step );
			if ( dy !== 0 ) for ( const b of this.boxes ) {

				if ( ! b.solid ) continue;
				const ceiling = dy > 0 && oldY + height <= b.bottom + 0.00001 && pos.y + height > b.bottom;
				const top = dy < 0 && oldY >= b.top - 0.00001 && pos.y < b.top;
				if ( ! ceiling && ! top ) continue;
				const [ x, z ] = this._toLocal( b, pos.x, pos.z );
				const dx = Math.max( 0, Math.abs( x ) - b.half.x ), dz = Math.max( 0, Math.abs( z ) - b.half.z );
				if ( dx * dx + dz * dz >= radius * radius ) continue;
				pos.y = ceiling ? b.bottom - height : b.top; step.y = 0;

			}
			if ( dy !== 0 ) for ( const c of this.cylinders ) {

				const ceiling = dy > 0 && oldY + height <= c.yMin + 0.00001 && pos.y + height > c.yMin;
				const top = dy < 0 && oldY >= c.yMax - 0.00001 && pos.y < c.yMax;
				if ( ! ceiling && ! top || ( pos.x - c.x ) ** 2 + ( pos.z - c.z ) ** 2 >= ( c.radius + radius ) ** 2 ) continue;
				pos.y = ceiling ? c.yMin - height : c.yMax; step.y = 0;

			}
			if ( dy < 0 ) {

				const ground = this.groundHeightAt( pos.x, pos.z, oldY + 0.00001 );
				if ( pos.y < ground ) { pos.y = ground; step.y = 0; }

			}
			this.resolveCapsule( pos, radius, height, stepHeight );

		}

	}

	// Segment/ray against static solids for photography occlusion; returns at most maxDist.
	raycast( origin, dir, maxDist ) {

		let best = maxDist;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			const ox = origin.x - b.center.x, oz = origin.z - b.center.z, oy = origin.y - b.center.y;
			const lox = ox * b.cos - oz * b.sin, loz = ox * b.sin + oz * b.cos;
			const ldx = dir.x * b.cos - dir.z * b.sin, ldz = dir.x * b.sin + dir.z * b.cos;
			let tmin = 0, tmax = best;
			const slab = ( o, d, h ) => {

				if ( Math.abs( d ) < 1e-8 ) return Math.abs( o ) <= h;
				let t1 = ( - h - o ) / d, t2 = ( h - o ) / d;
				if ( t1 > t2 ) { const t = t1; t1 = t2; t2 = t; }
				tmin = Math.max( tmin, t1 );
				tmax = Math.min( tmax, t2 );
				return tmin <= tmax;

			};

			if ( slab( lox, ldx, b.half.x ) && slab( oy, dir.y, b.half.y ) && slab( loz, ldz, b.half.z ) ) best = Math.min( best, tmin );

		}
		for ( const c of this.cylinders ) {

			const x = origin.x - c.x, z = origin.z - c.z;
			const aa = dir.x * dir.x + dir.z * dir.z, bb = x * dir.x + z * dir.z, cc = x * x + z * z - c.radius * c.radius;
			let lo = 0, hi = best;
			if ( aa < 1e-12 ) { if ( cc > 0 ) continue; }
			else {

				const disc = bb * bb - aa * cc;
				if ( disc < 0 ) continue;
				const root = Math.sqrt( disc );
				lo = Math.max( lo, ( - bb - root ) / aa ); hi = Math.min( hi, ( - bb + root ) / aa );

			}
			if ( Math.abs( dir.y ) < 1e-12 ) { if ( origin.y < c.yMin || origin.y > c.yMax ) continue; }
			else {

				const a = ( c.yMin - origin.y ) / dir.y, b = ( c.yMax - origin.y ) / dir.y;
				lo = Math.max( lo, Math.min( a, b ) ); hi = Math.min( hi, Math.max( a, b ) );

			}
			if ( lo <= hi ) best = lo;

		}

		return best;

	}

}
