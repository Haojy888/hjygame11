import { Group, Mesh, Color, Vector3, SphereGeometry } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { prepare, mergePrepared, cylinder, box, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from './GameMaterials.js';
import { WORLD } from '../world/WorldLayout.js';

export const STORY_SPOTS = {
	bottle: { x: 24, z: - 50 },
	shore: { x: - 35, z: - 52 },
	reef: { x: WORLD.reef.center.x, z: WORLD.reef.center.z + WORLD.reef.radius + 14 },
	beacon: { x: 54.7, z: 38.5 },
};

// Three small props, no external assets: a letter bottle, an old shore mark and a working lamp.
export class StoryWorld {

	constructor( app ) {

		this.time = 0;
		const material = createPropMaterial( 'harborStory' );
		const prop = ( name, parts, y ) => {

			const group = new Group();
			const point = STORY_SPOTS[ name ];
			group.name = 'story-' + name;
			group.position.set( point.x, y ?? app.terrainData.heightAt( point.x, point.z ), point.z );
			const mesh = new Mesh( mergePrepared( parts ), material );
			mesh.castShadow = mesh.receiveShadow = true;
			group.add( mesh );
			app.scene.add( group );
			return group;

		};
		const part = ( geometry, color, matrix, pattern = PAT.plain, rough = 0.65, metal = 0 ) => prepare( geometry, { color, matrix, pattern, rough, metal } );
		this.bottle = prop( 'bottle', [
			part( cylinder( 0.08, 0.095, 0.3, 12 ), 0x317d73, mat4( 0, 0.16, 0, 0, 0, 1.1 ), PAT.plain, 0.2 ),
			part( cylinder( 0.035, 0.05, 0.12, 10 ), 0x296658, mat4( - 0.19, 0.25, 0, 0, 0, 1.1 ) ),
			part( cylinder( 0.036, 0.036, 0.05, 8 ), 0x96703f, mat4( - 0.25, 0.28, 0, 0, 0, 1.1 ), PAT.cork ),
			part( box( 0.11, 0.16, 0.012 ), 0xe9d9a4, mat4( 0, 0.16, 0.09, 0, 0, 1.1 ) ),
		] );
		this.shore = prop( 'shore', [
			part( cylinder( 0.1, 0.15, 1.2, 8 ), 0x6a5540, mat4( 0, 0.6, 0 ), PAT.wood ),
			part( box( 0.68, 0.2, 0.06 ), 0xddd2aa, mat4( 0, 0.9, 0.05, 0, 0, - 0.08 ), PAT.woodX ),
			part( box( 0.09, 0.12, 0.07 ), 0x546e91, mat4( - 0.2, 0.9, 0.06 ) ),
			part( box( 0.09, 0.12, 0.07 ), 0x546e91, mat4( 0.2, 0.87, 0.06 ) ),
		] );
		this.beacon = prop( 'beacon', [
			part( cylinder( 0.17, 0.24, 0.16, 12 ), 0x444c50, mat4( 0, 0.08, 0 ), PAT.rusty, 0.5, 0.6 ),
			part( cylinder( 0.065, 0.085, 1.7, 10 ), 0x49605c, mat4( 0, 1, 0 ), PAT.rusty, 0.5, 0.6 ),
			part( cylinder( 0.23, 0.23, 0.07, 12 ), 0x554631, mat4( 0, 1.85, 0 ), PAT.plain, 0.4, 0.8 ),
			part( cylinder( 0, 0.28, 0.22, 12 ), 0x596761, mat4( 0, 2.33, 0 ), PAT.rusty, 0.45, 0.6 ),
			part( box( 0.46, 0.22, 0.06 ), 0xb29459, mat4( 0, 1.3, - 0.09 ), PAT.plain, 0.4, 0.7 ),
			...Array.from( { length: 4 }, ( _, i ) => {

				const angle = i * Math.PI / 2;
				return part( cylinder( 0.018, 0.018, 0.38, 6 ), 0x56534c, mat4( Math.cos( angle ) * 0.19, 2.05, Math.sin( angle ) * 0.19 ), PAT.plain, 0.45, 0.8 );

			} ),
		], WORLD.pier.deckHeight );
		this.lampMaterial = new Material( { name: 'storyLamp', color: 0x776d52, roughness: 0.25, metalness: 0.1, underwaterLighting: 'lite' } );
		this.lamp = new Mesh( new SphereGeometry( 0.16, 12, 8 ), this.lampMaterial );
		this.lamp.position.y = 2.06;
		this.beacon.add( this.lamp );
		this.light = { position: this.beacon.position.clone().add( new Vector3( 0, 2.06, 0 ) ), color: new Color( 1, 0.72, 0.35 ), intensity: 10, range: 22, kind: 'storyBeacon', enabled: false };
		app.localLights?.add( this.light );
		app.colliders?.addCylinder( this.beacon.position.x, this.beacon.position.z, 0.23, WORLD.pier.deckHeight, WORLD.pier.deckHeight + 2.45, { tag: 'storyBeacon' } );
		this.update( app.game?.state?.story, app.settings.timeOfDay, 0 );

	}

	update( story, hour, dt ) {

		this.time += dt;
		this.bottle.visible = story?.stage === 1;
		const complete = story?.stage === 6;
		const night = hour >= 18 || hour < 6;
		// The chosen inscription also changes the light: remembrance is steady, homecoming breathes.
		const pulse = story?.ending === 'home' ? 0.75 + 0.25 * Math.cos( this.time * 1.2 ) : 1;
		const glow = complete && night ? pulse : 0;
		this.lampMaterial.emissive.setRGB( glow * 4, glow * 2.4, glow * 0.75 );
		this.light.enabled = complete;
		this.light.scale = glow;

	}

}
