import { Mesh, Vector3 } from '../../engine/index.js';
import { GeoKit, box, cylinder, rod, torus } from './GeoKit.js';

const V = ( x, y, z ) => new Vector3( x, y, z );
const STEEL = { color: 0xc6d4d9, rough: 0.24, metal: 1 };

// All attachments are built once in the unscaled boat root's metre frame. Hidden parts are
// precompiled with the boat; installing an option only changes visibility, never buoyancy geometry.
export class BoatOutfitting {

	constructor( boat ) {

		this.boat = boat;
		this.parts = {};
		const L = boat.lines, aft = L.zAft - 0.12, width = L.sheerX( 0 ) * 0.82;
		const add = ( name, build ) => {

			const kit = new GeoKit();
			build( ( geometry, options = STEEL ) => kit.add( 'part', geometry, options ) );
			const mesh = new Mesh( kit.merged( 'part' ), boat.materials.fittings );
			mesh.name = 'boat-refit-' + name;
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.visible = false;
			boat.group.add( mesh );
			boat.meshes[ 'refit-' + name ] = mesh;
			this.parts[ name ] = mesh;

		};
		add( 'rodRack', put => {

			put( rod( V( - width, 1.17, aft ), V( width, 1.17, aft ), 0.025, 8 ) );
			for ( const side of [ - 1, 1 ] ) {

				put( rod( V( side * width, 0.92, aft ), V( side * width, 1.40, aft ), 0.024, 8 ) );
				for ( const fraction of [ 0.45, 0.82 ] ) {

					const x = side * width * fraction, base = V( x, 1.05, aft ), tip = V( x + side * 0.20, 3.1, aft - 0.8 );
					put( rod( base, base.clone().lerp( tip, 0.22 ), 0.045, 10 ) );
					put( rod( base.clone().lerp( tip, 0.1 ), tip, 0.009, 6 ), { color: 0x203c4c, rough: 0.36 } );
					put( torus( 0.045, 0.008, 6, 10 ).translate( x, 1.65, aft - 0.22 ) );

				}

			}

		} );
		add( 'fenders', put => {

			for ( const side of [ - 1, 1 ] ) for ( const fraction of [ 0.31, 0.48 ] ) {

				const z = L.zAft + L.length * fraction, t = L.tAtSheerZ( z );
				const x = side * ( L.sheerX( t ) + 0.16 ), y = L.sheerY( t ) - 0.32;
				put( cylinder( 0.115, 0.10, 0.62, 12 ).translate( x, y, z ), { color: 0xe4e8e3, rough: 0.52 } );
				for ( const offset of [ - 0.24, 0.24 ] ) put( torus( 0.107, 0.017, 6, 12 ).rotateX( Math.PI / 2 ).translate( x, y + offset, z ), { color: 0x1b4d67, rough: 0.5 } );
				put( rod( V( x, y + 0.34, z ), V( x - side * 0.19, L.sheerY( t ) + 0.09, z ), 0.009, 6 ), { color: 0xc2b08d, rough: 0.9 } );

			}

		} );
		add( 'stability', put => {

			const z = - 1.25 * boat.visualScale.z;
			for ( const side of [ - 1, 1 ] ) put( box( 0.38, 0.035, 1.6 * boat.visualScale.z )
				.rotateZ( side * - 0.25 ).translate( side * ( L.hullXAt( z, - 0.25 ) + 0.10 ), - 0.26, z ), { color: 0x344c5a, rough: 0.42, metal: 0.65 } );

		} );
		add( 'propeller', put => {

			const p = boat.propeller;
			put( torus( 0.255, 0.035, 10, 32 ).scale( boat.visualScale.x, 1, 1 ).translate( p.x, p.y, p.z ), STEEL );

		} );

	}

	apply( config, upgrades = {} ) {

		this.boat.materials.applyCustomization( config );
		this.parts.rodRack.visible = config.rodRack;
		this.parts.fenders.visible = config.fenders;
		this.parts.stability.visible = ( upgrades.stability | 0 ) > 0;
		this.parts.propeller.visible = ( upgrades.propeller | 0 ) > 0;

	}

}
