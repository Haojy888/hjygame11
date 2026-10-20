import { Group, Mesh, Vector3 } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { GeoKit, roundedBox, box, cylinder, rod, torus } from './boat/GeoKit.js';
import { SECRET_SITES, NIGHT_TRAIL } from '../game/Secrets.js';
import { createMound } from './reef/ReefGeometry.js';
import { mulberry32 } from '../util/Noise.js';

const V = ( x = 0, y = 0, z = 0 ) => new Vector3( x, y, z );
function build( name, parts, parent, colliders = null, offset = V() ) {

	const kit = new GeoKit();
	for ( const [ geometry, color, solid = true, walkable = false ] of parts ) {

		kit.add( 'solid', geometry, { color, rough: 0.9 } );
		if ( solid ) colliders?.addMeshBounds( geometry, offset, 0, { tag: 'secret-' + name, walkable } );

	}
	const material = new Material( { name, vertexColors: true, roughness: 0.9,
		surface: 's.albedo *= 0.85 + perlin3( in.P * 4.0 ) * 0.15;' } );
	const mesh = new Mesh( kit.merged( 'solid' ), material ); mesh.name = name; mesh.castShadow = true; parent.add( mesh ); return mesh;

}
export class SecretsWorld {

	constructor( app ) {

		this.app = app; this.groups = []; this.points = new Map(); this.opening = 0;
		const terrain = app.terrainData;
		const group = site => {

			const g = new Group(); g.name = site.name; g.position.set( site.x, terrain.heightAt( site.x, site.z ), site.z );
			app.scene.add( g ); this.groups.push( g ); return g;

		};
		const cave = group( SECRET_SITES[ 0 ] ); this.cave = cave;
		const rng = mulberry32( 1917 );
		const rock = ( w, h, d, x, y, z ) => {

			const g = createMound( rng, 2, 'rock' ), bounds = g.boundingBox, size = bounds.getSize( V() ), centre = bounds.getCenter( V() );
			return g.translate( - centre.x, - centre.y, - centre.z ).scale( w / size.x, h / size.y, d / size.z ).translate( x, y, z );

		};
		// A shallow intertidal shelf, fitted above the actual ground at all corners.
		for ( const x of [ - 3.2, 0, 3.2 ] ) for ( const z of [ - 3.5, 0, 3.5 ] ) cave.position.y = Math.max( cave.position.y, terrain.heightAt( cave.position.x + x, cave.position.z + z ) + 0.02 );
		build( '潮蚀石窟', [
			[ box( 6.4, 0.18, 7 ).translate( 0, - 0.09, 0 ), 0x68786e, true, true ],
			// Four eroded rock masses form an arch with a clear swimming/walking passage.
			[ rock( 3.1, 3.4, 7.8, - 3.5, 1.45, - 0.2 ), 0x718176 ],
			[ rock( 3.1, 3.7, 7.6, 3.5, 1.6, - 0.1 ), 0x69796d ],
			[ rock( 8.8, 2.5, 8.4, 0, 3.45, - 0.2 ), 0x84907b ],
			[ rock( 7, 3.3, 2.3, 0, 1.45, - 3.8 ), 0x657568 ],
		], cave, app.colliders, cave.position );
		this.tideClue = build( '潮纹刻痕', [ [ box( 0.9, 0.06, 0.6 ).translate( 0, 0.06, - 2.3 ), 0xb3ba9d, false ],
			[ rod( V( - 0.33, 0.10, - 2.3 ), V( 0.33, 0.10, - 2.3 ), 0.014, 5 ), 0x384e4c, false ] ], cave );
		this.points.set( 'tide', cave.position.clone().add( V( 0, 0.16, - 2.3 ) ) );

		this.trail = NIGHT_TRAIL.map( ( p, i ) => V( p.x, terrain.heightAt( p.x, p.z ) + 0.22, p.z ) );
		const night = group( { ...SECRET_SITES[ 1 ], x: 0, z: 0 } ); night.position.set( 0, 0, 0 ); this.nightGroup = night;
		const marks = [], stones = [];
		for ( let i = 0; i < this.trail.length; i ++ ) {

			const p = this.trail[ i ];
			stones.push( [ roundedBox( 1.1, 0.20, 0.85, 0.08, 1 ).translate( p.x, p.y - 0.12, p.z ), 0x7b887a, true, true ] );
			marks.push( [ torus( 0.20, 0.018, 5, 16 ).rotateX( Math.PI / 2 ).translate( p.x, p.y, p.z ), 0x80f1d0, false ] );
			const next = this.trail[ i + 1 ];
			if ( next ) {

				const dir = next.clone().sub( p ).setY( 0 ).normalize();
				marks.push( [ rod( p, p.clone().addScaledVector( dir, 0.45 ), 0.018, 5 ), 0x80f1d0, false ] );

			}

		}
		build( '岸边旧石', stones, night, app.colliders ); this.glow = build( '夜航微光', marks, night );
		this.glow.material = new Material( { name: '夜间石痕', lit: false, color: 0x66e6c2, emissive: 0x164e43,
			surface: 's.emissive *= 0.85 + 0.15 * sin( frame.time * 0.8 + in.P.x );' } ); this.glow.castShadow = false;

		const cabin = group( SECRET_SITES[ 2 ] ); this.cabin = cabin;
		for ( const x of [ - 2.9, 0, 2.9 ] ) for ( const z of [ - 4.5, 0, 4.5 ] ) cabin.position.y = Math.max( cabin.position.y, terrain.heightAt( cabin.position.x + x, cabin.position.z + z ) + 0.03 );
		const wood = 0x70644c;
		const hull = [
			[ box( 5.6, 0.18, 9 ).translate( 0, - 0.09, 0 ), wood, true, true ],
			[ box( 0.22, 2.4, 9 ).translate( - 2.7, 1.2, 0 ), wood ], [ box( 0.22, 2.4, 9 ).translate( 2.7, 1.2, 0 ), wood ],
			[ box( 5.6, 2.4, 0.22 ).translate( 0, 1.2, - 4.4 ), wood ],
			[ box( 1.5, 2.4, 0.22 ).translate( - 2, 1.2, 4.4 ), wood ], [ box( 1.5, 2.4, 0.22 ).translate( 2, 1.2, 4.4 ), wood ],
			// A roof opening provides an additional way out even while the weather changes.
			[ box( 2.25, 0.18, 9 ).translate( - 1.65, 2.5, 0 ), wood ], [ box( 2.25, 0.18, 9 ).translate( 1.65, 2.5, 0 ), wood ],
		];
		// Exposed ribs, a keel and a snapped mast make the cabin part of a wreck.
		// All stay outside the swimming passage and the open roof escape route.
		for ( const side of [ - 1, 1 ] ) {

			for ( const z of [ - 3.6, - 1.2, 1.2, 3.6 ] ) {

				hull.push( [ rod( V( side * 2.7, 0.05, z ), V( side * 3.15, 1.5, z ), 0.13, 6 ), 0x493d2c ],
					[ rod( V( side * 3.15, 1.5, z ), V( side * 2.85, 2.9, z ), 0.12, 6 ), 0x857454 ] );

			}
			hull.push( [ rod( V( side * 2.85, 2.5, - 5.1 ), V( side * 2.85, 2.5, 4.7 ), 0.12, 6 ), 0x8a7756 ] );

		}
		hull.push( [ rod( V( 0, - 0.18, - 5.7 ), V( 0, - 0.18, 4.6 ), 0.2, 6 ), 0x4c3b29 ],
			[ rod( V( - 2.9, 0.15, - 3 ), V( - 3.8, 5.4, - 3.5 ), 0.18, 7 ), 0x786345 ],
			[ rod( V( - 4.6, 4.5, - 3.4 ), V( - 2.7, 4.8, - 3.4 ), 0.08, 6 ), 0x9a865d ] );
		build( '风暴沉船侧舱', hull, cabin, app.colliders, cabin.position );
		this.hinge = new Group(); this.hinge.position.set( - 1.25, 0, 4.4 ); cabin.add( this.hinge );
		const planks = Array.from( { length: 6 }, ( _, i ) => [ box( 2.5, 0.35, 0.16 ).translate( 1.25, 0.2 + i * 0.37, 0 ), i % 2 ? 0x6e765e : 0x7c7c63, false ] );
		build( '被浮木卡住的舱门', planks, this.hinge );
		this.door = app.colliders?.addBox( cabin.position.clone().add( V( 0, 1.15, 4.4 ) ), V( 1.25, 1.15, 0.1 ), 0, { tag: 'secret-storm-door' } );
		build( '归航名牌', [ [ box( 0.9, 0.08, 0.45 ).translate( 0, 0.3, - 2.7 ), 0xbda978, false ], [ cylinder( 0.08, 0.08, 0.13, 10 ).translate( - 0.3, 0.4, - 2.7 ), 0x5b7469, false ] ], cabin );
		this.points.set( 'storm', cabin.position.clone().add( V( 0, 0.42, - 2.7 ) ) );

	}

	update( dt, { low, night, revealed }, player, camera ) {

		this.tideClue.visible = low; this.glow.visible = night;
		const p = player.position, c = this.cabin.position;
		const inside = Math.abs( p.x - c.x ) < 3.1 && p.z > c.z - 4.7 && p.z < c.z + 7.2 && p.y > c.y - 0.5 && p.y < c.y + 4;
		const target = revealed || this.opening > 0.05 && inside ? 1 : 0;
		this.opening += ( target - this.opening ) * ( 1 - Math.exp( - dt * 3 ) );
		const angle = - this.opening * Math.PI / 2; this.hinge.rotation.y = angle;
		if ( this.door ) {

			this.door.center.set( 1.25, 1.15, 0 ).applyAxisAngle( V( 0, 1, 0 ), angle ).add( this.hinge.position ).add( c );
			this.door.rotY = angle; this.door.cos = Math.cos( angle ); this.door.sin = Math.sin( angle );

		}
		this.cave.visible = camera.position.distanceToSquared( this.cave.position ) < 180 ** 2;
		this.cabin.visible = camera.position.distanceToSquared( c ) < 180 ** 2;
		this.nightGroup.visible = this.trail.some( p => p.distanceToSquared( camera.position ) < 180 ** 2 );

	}

}
