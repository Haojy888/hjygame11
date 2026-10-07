import { Color, Group, Mesh, Vector3 } from '../engine/index.js';
import { BoatModel } from './BoatModel.js';
import { buildHullVolume } from './boat/HullBuilder.js';
import { GeoKit, box, cylinder, rod, roundedBox, torus } from './boat/GeoKit.js';
import { RHO_SEAWATER } from './boat/HullLines.js';

const SX = 1.35, SZ = 1.6, AREA = SX * SZ;
const SCALE = new Vector3( SX, 1, SZ );
const V = ( x, y, z ) => new Vector3( x, y, z );
const scaledSamples = ( samples ) => samples.map( ( sample ) => ( {
	...sample, position: sample.position.clone().multiply( SCALE ), area: sample.area * AREA,
} ) );

// Public geometry queries are in the unscaled root's real metre frame. The original
// lines remain private to the stretched visual and its procedural material coordinates.
function offshoreLines( base ) {

	return {
		zAft: base.zAft * SZ, zBow: base.zBow * SZ, length: base.length * SZ,
		deckY: base.deckY, shell: base.shell * SX,
		houseBack: base.houseBack * SZ, houseFront: base.houseFront * SZ,
		wlStart: base.wlStart * SZ, wlEnd: base.wlEnd * SZ,
		waterplaneArea: base.waterplaneArea * AREA, canoeVolume: base.canoeVolume * AREA,
		centerOfFlotationZ: base.centerOfFlotationZ * SZ,
		centerOfBuoyancy: base.centerOfBuoyancy.clone().multiply( SCALE ),
		sheerZ: ( t ) => base.sheerZ( t ) * SZ,
		tAtSheerZ: ( z ) => base.tAtSheerZ( z / SZ ),
		sheerX: ( t ) => base.sheerX( t ) * SX,
		sheerY: ( t ) => base.sheerY( t ),
		keelY: ( t ) => base.keelY( t ),
		stemZ: ( y ) => base.stemZ( y ) * SZ,
		halfBreadth: ( t, y ) => base.halfBreadth( t, y ) * SX,
		tAt: ( z, y ) => base.tAt( z / SZ, y ),
		zOnStation: ( t, y ) => base.zOnStation( t, y ) * SZ,
		hullXAt: ( z, y ) => base.hullXAt( z / SZ, y ) * SX,
		halfBeamAt: ( z ) => base.halfBeamAt( z / SZ ) * SX,
		draftAt: ( z ) => base.draftAt( z / SZ ),
		bottomAt: ( x, z ) => base.bottomAt( x / SX, z / SZ ),
		stationParams: ( count ) => base.stationParams( count ),
		station: ( t, density ) => base.station( t, density ).map( ( p ) => p.multiply( SCALE ) ),
		sectionCount: ( density ) => base.sectionCount( density ),
		buildHullSamples: ( slices ) => scaledSamples( base.buildHullSamples( slices ) ),
	};

}

// 13.12 m offshore fishing boat: larger working deck, normal cabin height and helm.
// Keep the root at scale 1 so controller anchors, water exclusion and buoyancy agree.
export class OffshoreBoatModel extends BoatModel {

	constructor() {

		super();
		this.profileId = 'offshore';
		this.visualScale.copy( SCALE );
		this.visualGroup.scale.copy( SCALE );
		this.group = new Group();
		this.group.name = 'OffshoreFishingBoat';
		this.group.add( this.visualGroup );
		this.lines = offshoreLines( this.baseLines );
		this.dock = { position: V( 65.1, 0, 36.5 ), heading: 0 };
		this.deckForwardLimit *= SZ;
		this.chaseDistance = 18;

		for ( const key of [ 'length', 'waterlineLength' ] ) this.dimensions[ key ] *= SZ;
		for ( const key of [ 'beam', 'waterlineBeam' ] ) this.dimensions[ key ] *= SX;
		const h = this.hydro;
		for ( const key of [ 'waterplaneArea', 'canoeVolume', 'keelVolume', 'displacedVolume' ] ) h[ key ] *= AREA;
		h.suggestedMass = Math.round( RHO_SEAWATER * h.canoeVolume );
		h.massWithKeel = Math.round( RHO_SEAWATER * h.displacedVolume );
		h.centerOfBuoyancy.multiply( SCALE );
		h.centerOfMass.multiply( SCALE );
		for ( const key of [ 'centerOfFlotationZ', 'waterlineStart', 'waterlineEnd' ] ) h[ key ] *= SZ;
		h.metacentricRadius *= SX * SX;
		h.inertia.set(
			h.suggestedMass * ( 0.26 * this.dimensions.length ) ** 2,
			h.suggestedMass * ( 0.27 * this.dimensions.length ) ** 2,
			h.suggestedMass * ( 0.36 * this.dimensions.beam ) ** 2,
		);
		this.hullSamples = scaledSamples( this.hullSamples );
		for ( const collider of this.colliders ) {

			collider.center.multiply( SCALE );
			collider.half.multiply( SCALE );

		}
		for ( const point of [ this.boardPoint, this.propeller, this.rudder, ...this.exitPoints, ...this.bowSprayPoints ] ) point.multiply( SCALE );
		// A clear port-side landing lies within reach of the pier even with the wider hull.
		this.boardPoint.x = - 1.0;
		// The wider berth needs an exit beside the clear middle of the pier head, beyond its mooring bollards.
		const exitZ = - 0.85, exitT = this.lines.tAtSheerZ( exitZ );
		for ( const side of [ - 1, 1 ] ) this.exitPoints.push( V( side * ( this.lines.sheerX( exitT ) - 0.035 ), this.lines.sheerY( exitT ) + 0.05, exitZ ) );

		const oldWheel = this.wheelPivot.position.clone();
		const reach = oldWheel.z - this.helmSeat.z;
		this.helmSeat.multiply( SCALE );
		this.helmEye.set( this.helmSeat.x, this.helmEye.y, this.helmSeat.z + 0.04 );
		this.helmExit.set( this.helmSeat.x + 0.65, this.lines.deckY, this.helmSeat.z - 0.20 );
		// An extended steering column keeps the original human-size wheel within reach.
		// The shaft and wheel use root coordinates; the rest of the cabin remains in the visual group.
		this.group.add( this.wheelPivot );
		this.wheelPivot.position.set( oldWheel.x * SX, oldWheel.y, this.helmSeat.z + reach );

		const blue = new Color( 0x125b85 ).toArray().map( ( value ) => value.toFixed( 6 ) ).join( ', ' );
		this.materials.hull.name = 'offshoreHull';
		this.materials.hull.surface += `
	let offshoreBand = boatLstep( 0.17, 0.20, p.y ) * boatInvstep( 0.78, 0.81, p.y );
	s.albedo = mix( s.albedo, vec3f( ${ blue } ) * ( 0.92 + 0.08 * n1 ), offshoreBand );
`;
		// The flag keeps its original 3:2 shape and star geometry despite the enlarged hull.
		this.materials.fittings.vertex += `
	if ( aux.z > 1.5 && aux.z < 2.5 ) {
		v.position = mat.flagPivot + ( v.position - mat.flagPivot ) / vec3f( ${ SX }, 1.0, ${ SZ } );
	}
`;
		this._addOffshoreGear( oldWheel.multiply( SCALE ) );

	}

	createHullVolumeGeometry() {

		return buildHullVolume( this.baseLines ).scale( SX, 1, SZ );

	}

	_addOffshoreGear( wheelShaft ) {

		const kit = new GeoKit();
		const white = { color: 0xf6f5ed, rough: 0.4 };
		const navy = { color: 0x16476a, rough: 0.45 };
		const steel = { color: 0xc7d4dc, rough: 0.22, metal: 1 };
		kit.add( 'fittings', rod( this.wheelPivot.position, wheelShaft, 0.027, 12 ), steel );
		// Full-width canopy over the enlarged work deck, with clear central boarding access.
		kit.add( 'gelcoat', roundedBox( 3.28, 0.09, 3.50, 0.035, 2 ).translate( 0, 2.64, - 3.85 ), white );
		for ( const x of [ - 1.58, 1.58 ] ) {

			kit.add( 'gelcoat', box( 0.08, 0.20, 3.50 ).translate( x, 2.58, - 3.85 ), navy );
			for ( const z of [ - 5.46, - 2.24 ] ) {

				kit.add( 'fittings', rod( V( x, this.lines.deckY, z ), V( x, 2.60, z ), 0.035, 10 ), steel );
				this.colliders.push( { tag: 'canopyPost', center: V( x, 1.48, z ), half: V( 0.05, 1.13, 0.05 ), solid: true, walkable: false } );

			}
		}
		for ( const z of [ - 5.55, - 2.15 ] ) kit.add( 'gelcoat', box( 3.20, 0.20, 0.08 ).translate( 0, 2.58, z ), navy );
		for ( const z of [ - 5.35, - 3.85, - 2.35 ] ) kit.add( 'fittings', rod( V( - 1.55, 2.58, z ), V( 1.55, 2.58, z ), 0.022, 8 ), steel );
		this.colliders.push( { tag: 'canopyRoof', center: V( 0, 2.64, - 3.85 ), half: V( 1.64, 0.045, 1.75 ), solid: true, walkable: true } );

		// A stern guard rail and bow handrails give the larger deck a distinct working-boat silhouette.
		for ( const x of [ - 1.45, 0, 1.45 ] ) kit.add( 'fittings', rod( V( x, 1.04, - 6.15 ), V( x, 1.52, - 6.15 ), 0.025, 8 ), steel );
		for ( const y of [ 1.27, 1.52 ] ) kit.add( 'fittings', rod( V( - 1.45, y, - 6.15 ), V( 1.45, y, - 6.15 ), 0.025, 8 ), steel );
		// A stern lifebuoy, soft side fenders and aft rod holders stay clear of the boarding aisle.
		kit.add( 'fittings', torus( 0.27, 0.065, 10, 32 ).translate( 0, 1.18, - 6.30 ), { color: 0xf76916, rough: 0.65 } );
		for ( let i = 0; i < 4; i ++ ) kit.add( 'fittings', torus( 0.27, 0.067, 10, 5, 0.30 ).rotateZ( i * Math.PI / 2 - 0.15 ).translate( 0, 1.18, - 6.30 ), white );
		for ( const side of [ - 1, 1 ] ) {

			for ( const z of [ - 4.2, 0.4 ] ) {

				const x = side * ( this.lines.sheerX( this.lines.tAtSheerZ( z ) ) + 0.13 );
				kit.add( 'fittings', cylinder( 0.10, 0.10, 0.62, 14 ).translate( x, 0.70, z ), white );
				for ( const y of [ 0.38, 1.02 ] ) kit.add( 'fittings', cylinder( 0.08, 0.09, 0.07, 14 ).translate( x, y, z ), navy );
				kit.add( 'fittings', rod( V( x, 1.05, z ), V( x - side * 0.14, 1.22, z ), 0.009, 6 ), { color: 0xcbbd91, rough: 0.9 } );

			}
			kit.add( 'fittings', cylinder( 0.055, 0.055, 0.38, 12, 1, true ).rotateX( - 0.30 ).translate( side * 1.38, 1.26, - 5.95 ), steel );
		}
		for ( const side of [ - 1, 1 ] ) {

			const tops = [];
			for ( const z of [ 2.8, 3.9, 4.9, 5.75, 6.4 ] ) {

				const t = this.lines.tAtSheerZ( z );
				const x = side * Math.max( 0.08, this.lines.sheerX( t ) - 0.10 ), y = this.lines.sheerY( t ) + 0.04;
				const top = V( x, y + 0.52, z );
				kit.add( 'fittings', rod( V( x, y, z ), top, 0.021, 8 ), steel );
				tops.push( top );

			}
			for ( let i = 1; i < tops.length; i ++ ) kit.add( 'fittings', rod( tops[ i - 1 ], tops[ i ], 0.023, 8 ), steel );

		}
		for ( const bucket of [ 'fittings', 'gelcoat' ] ) {

			const mesh = new Mesh( kit.merged( bucket ), this.materials[ bucket ] );
			mesh.name = 'offshore-' + bucket;
			mesh.castShadow = mesh.receiveShadow = true;
			this.group.add( mesh );
			this.meshes[ 'offshore-' + bucket ] = mesh;

		}

	}

}
