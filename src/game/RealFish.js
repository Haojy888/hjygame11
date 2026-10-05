import { Color } from '../engine/index.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
import { loadGLB } from '../engine/loaders/GLTF.js';

const SPECIES = new Set( [ 'grunt', 'yellowtail', 'tuna', 'grouper', 'mahi', 'wrasse', 'angel', 'redSnapper', 'barracuda', 'tarpon' ] );
const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/fish-realistic/';

// Close-up assets only. Loading never changes the portrait's current selection; the next live
// frame chooses a ready model. Cache promises (including failures) so reopening a card cannot
// duplicate requests or repeatedly fetch an unavailable asset. Other fish keep FishProps.
export class RealFish {

	constructor() {

		this.models = new Map();
		this.pending = new Map();

	}

	get( species ) {

		return this.models.get( species ) || null;

	}

	load( species ) {

		if ( ! SPECIES.has( species ) ) return Promise.resolve( null );
		if ( this.pending.has( species ) ) return this.pending.get( species );
		const promise = loadGLB( BASE + species + '.glb' ).then( async ( gltf ) => {

			const nodes = gltf.nodes.filter( ( n ) => n.mesh !== undefined && n.skin !== undefined );
			if ( nodes.length !== 1 || nodes[ 0 ].skin !== 0 || ! gltf.skins[ 0 ] ) throw new Error( 'Expected one fish mesh using the first skin' );
			for ( const primitive of gltf.meshes[ nodes[ 0 ].mesh ] ) {

				if ( primitive.mode !== 4 ) throw new Error( 'Fish geometry must use triangles' );
				for ( const name of [ 'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0' ] ) {

					if ( ! primitive.attributes[ name ] ) throw new Error( 'Fish geometry is missing ' + name );

				}

			}
			const model = await SkinnedModel.create( gltf, {
				materials: ( { gltfMaterial } ) => ( {
					color: new Color( ...( gltfMaterial.pbrMetallicRoughness?.baseColorFactor || [ 1, 1, 1 ] ).slice( 0, 3 ) ),
					// Opaque fish textures may still contain unused alpha in their embedded image.
					alphaMode: 'OPAQUE', surface: 's.alpha = 1.0;',
				} ),
			} );
			model.group.name = 'RealFish:' + species;
			model.group.visible = false;
			if ( model.clips.has( 'idle' ) ) model.play( 'idle', { fade: 0.01 } );
			model.update( 0 );
			this.models.set( species, model );
			return model;

		} ).catch( ( error ) => {

			console.warn( 'RealFish: keeping the original ' + species + ' model', error );
			return null;

		} );
		this.pending.set( species, promise );
		return promise;

	}

}
