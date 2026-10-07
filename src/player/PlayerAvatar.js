import { Group, Matrix4, Quaternion, Vector3 } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';

const Y = new Vector3( 0, 1, 0 );
const X = new Vector3( 1, 0, 0 );
const IDLE = 'idle_neutral_01';
const WALK = 'player_walk';
const HELM = 'player_helm';

// Reuse the shipped, clothed Rocketbox man with his own skeleton and materials.
// This is visual only: the existing player capsule, camera and save remain authoritative.
export class PlayerAvatar {

	constructor( app ) {

		this.group = new Group();
		this.group.name = 'PlayerAvatar';
		this.group.visible = false;
		app.scene.add( this.group );
		this.model = null;
		this.head = null;
		this._offset = new Vector3();
		this._rotation = new Quaternion();
		this._lastMode = null;
		this.ready = this.load( app ).catch( ( error ) => {

			console.warn( 'PlayerAvatar: character failed to load', error );
			return false;

		} );

	}

	async load( app ) {

		const base = ( import.meta.env && import.meta.env.BASE_URL ) || '/';
		const model = await SkinnedModel.create( await loadGLB( base + 'models/characters/joe.glb' ) );
		for ( const material of model.materials ) material.underwaterLighting = 'lite';
		model.play( IDLE, { fade: 0.01 } );
		model.update( 0 );
		addPlayerClips( model );
		this.head = model.meshes.find( ( mesh ) => mesh.name === 'skinned:head' );
		this.model = model;
		this.group.add( model.group );
		this.update( app, 0 );
		return true;

	}

	update( app, dt ) {

		const model = this.model;
		if ( ! model ) return;
		const p = app.player, boat = p.boat, group = this.group;
		const aboard = p.mode === 'boat' || p.mode === 'deck';
		const external = app.freeCam || ( p.mode === 'boat' && p.camMode === 'third' );
		// Swimming's eye is at the float point, not standing height. Keep the first-person
		// transition unobstructed; the free camera can still see the horizontal swimmer.
		group.visible = p.mode !== 'swim' || external;
		if ( this.head ) this.head.visible = external;
		if ( aboard ) {

			group.quaternion.copy( boat.quaternion );
			if ( p.mode === 'boat' ) {

				boat.toWorld( boat.model.helmSeat || this._offset.set( HOUSE.helmX, boat.model.helmEye.y - 1.62, HOUSE.seatZ + 0.04 ), group.position );

			} else {

				boat.toWorld( p.deckPos, group.position );
				group.quaternion.multiply( this._rotation.setFromAxisAngle( Y, p.deckYaw ) );

			}

		} else {

			group.position.copy( p.position );
			group.quaternion.setFromAxisAngle( Y, p.yaw + Math.PI );
			if ( p.mode === 'swim' ) {

				group.position.add( this._offset.set( 0, 0.05, - 1.55 ).applyQuaternion( group.quaternion ) );
				group.quaternion.multiply( this._rotation.setFromAxisAngle( X, Math.PI / 2 ) );

			}

		}
		// Keep the collar behind the eye when looking straight down (inside the 0.3 m capsule).
		if ( ! external && p.mode !== 'boat' ) group.position.add( this._offset.set( 0, 0, - 0.28 ).applyQuaternion( group.quaternion ) );

		const velocity = p.mode === 'deck' ? p.deckVel : p.velocity;
		const speed = app.freeCam || p.mode === 'swim' ? 0 : Math.hypot( velocity.x, velocity.z );
		const grounded = p.mode === 'deck' ? p.deckGrounded : p.grounded;
		const clip = p.mode === 'boat' ? HELM : grounded && speed > 0.18 ? WALK : IDLE;
		const modeChanged = this._lastMode !== p.mode;
		if ( model.current !== clip ) {

			model.play( clip, { fade: 0.18 } );
			// A seated-to-standing blend would briefly put legs through the helm chair.
			if ( modeChanged ) {

				model.layers = model.layers.filter( ( layer ) => layer.target === 1 );
				model.layers[ 0 ].weight = 1;

			}

		}
		const active = model.layers.find( ( layer ) => layer.target === 1 );
		if ( active ) active.speed = clip === WALK ? Math.max( 0.5, Math.min( 1.9, speed / 2.1 ) ) : 1;
		model.update( modeChanged ? 0 : dt );
		this._lastMode = p.mode;
		// F starts the free camera at the current eye. Reveal the full body only after
		// flying out of its head/shoulders, without moving the camera on the player's behalf.
		if ( app.freeCam && app.camera ) {

			const head = model.nodeWorld( 'Bip01 Head', this._offset );
			if ( head ) {

				model.group.localToWorld( head );
				group.visible = head.distanceTo( app.camera.position ) > 0.45;
				if ( this.head ) this.head.visible = group.visible;

			}

		}

	}

}

// Small in-place clips, derived from the asset's relaxed idle pose. No root motion or
// engine pose hooks: ordinary animation channels keep skinning, shadows and blending intact.
function addPlayerClips( model ) {

	const base = model.local.map( ( node ) => ( { t: [ ...node.t ], r: [ ...node.r ], s: [ ...node.s ] } ) );
	const axes = model.gltf.nodes.map( ( _, i ) => {

		const rotation = new Matrix4().extractRotation( new Matrix4().fromArray( model.world, i * 16 ) );
		return X.clone().applyQuaternion( new Quaternion().setFromRotationMatrix( rotation ).invert() );

	} );
	const make = ( name, frames, angle ) => {

		const duration = name === WALK ? 0.9 : 1;
		const times = Float32Array.from( { length: frames }, ( _, frame ) => frame * duration / ( frames - 1 ) );
		const channels = [];
		for ( let i = 0; i < base.length; i ++ ) {

			const node = model.gltf.nodes[ i ], pose = base[ i ];
			for ( const [ path, value ] of [ [ 'translation', pose.t ], [ 'scale', pose.s ] ] ) channels.push( { node: i, path, times: new Float32Array( [ 0 ] ), values: Float32Array.from( value ) } );
			const values = new Float32Array( frames * 4 );
			for ( let frame = 0; frame < frames; frame ++ ) {

				new Quaternion().fromArray( pose.r ).multiply( new Quaternion().setFromAxisAngle( axes[ i ], angle( node.name, frame / ( frames - 1 ) * Math.PI * 2 ) ) ).normalize().toArray( values, frame * 4 );

			}
			channels.push( { node: i, path: 'rotation', times, values } );

		}
		model.clips.set( name, { name, duration, channels } );

	};
	make( WALK, 17, ( name, phase ) => {

		const swing = Math.sin( phase + ( name.includes( ' R ' ) ? Math.PI : 0 ) );
		if ( name.endsWith( ' Thigh' ) ) return swing * 0.42;
		if ( name.endsWith( ' Calf' ) ) return Math.max( 0, - swing ) * 0.65;
		if ( name.endsWith( ' UpperArm' ) ) return - swing * 0.25;
		if ( name.endsWith( ' Forearm' ) ) return - 0.1;
		return 0;

	} );
	make( HELM, 2, ( name ) => {

		if ( name === 'Bip01 Spine1' ) return 0.4;
		if ( name.endsWith( ' Thigh' ) ) return - 1.45;
		if ( name.endsWith( ' Calf' ) ) return 1.45;
		if ( name.endsWith( ' UpperArm' ) ) return - 1.5;
		if ( name.endsWith( ' Forearm' ) ) return 0.3;
		return 0;

	} );

}

