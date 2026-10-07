import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Quaternion, Scene, Vector3 } from '../src/engine/index.js';
import { StorageBuffer } from '../src/engine/gpu/Texture.js';
import { SkinnedModel } from '../src/engine/render/Skinning.js';
import { PlayerAvatar } from '../src/player/PlayerAvatar.js';
import { HOUSE } from '../src/world/boat/Wheelhouse.js';

// Keep actual GLB parsing, skeleton evaluation and animations; only GPU allocation is stubbed.
StorageBuffer.prototype.write = function () {};
SkinnedModel.prototype._buildMeshes = async function () {

	this.materials = [ {}, {} ];
	this.meshes = [ 'body', 'head' ].map( ( name ) => { const mesh = new Group(); mesh.name = 'skinned:' + name; this.group.add( mesh ); return mesh; } );

};
globalThis.__assetFile = async ( url ) => {

	assert.ok( url.endsWith( '/models/characters/joe.glb' ) );
	const bytes = readFileSync( new URL( '../public/models/characters/joe.glb', import.meta.url ) );
	return bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );

};
const boat = {

	position: new Vector3( 30, 1, 20 ), quaternion: new Quaternion(),
	model: { helmEye: new Vector3( HOUSE.helmX, 1.85, 0.3 ) },
	toWorld( local, out ) { return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position ); },

};
const player = { position: new Vector3( 3, 2.3, 4 ), velocity: new Vector3(), boat, mode: 'walk', yaw: 0, pitch: - 1.5, grounded: true,
	deckPos: new Vector3( 0.2, 0.55, - 1 ), deckVel: new Vector3(), deckYaw: 0.3, deckGrounded: true, camMode: 'third' };
const app = { scene: new Scene(), player, freeCam: false, camera: { position: new Vector3( 10, 4, 10 ) } };
const avatar = new PlayerAvatar( app );
assert.equal( avatar.model, null, 'Construction must not block the first frame' );
assert.equal( avatar.group.visible, false, 'Never show a loading T-pose' );
assert.equal( await avatar.ready, true );
assert.equal( avatar.head.visible, false );
assert.equal( avatar.group.visible, true );
assert.ok( Math.abs( avatar.group.position.z - 4.28 ) < 1e-6 );
assert.ok( new Vector3( 0, 0, 1 ).applyQuaternion( avatar.group.quaternion ).z < - 0.999 );
assert.equal( avatar.model.current, 'idle_neutral_01' );

player.velocity.z = - 3;
avatar.update( app, 0.2 );
assert.equal( avatar.model.current, 'player_walk' );
const firstFoot = avatar.model.nodeWorld( 'Bip01 L Foot', new Vector3() );
avatar.update( app, 0.15 );
assert.ok( firstFoot.distanceTo( avatar.model.nodeWorld( 'Bip01 L Foot', new Vector3() ) ) > 0.05, 'Walking must articulate legs, not slide an idle mannequin' );
assert.ok( avatar.model.jointData.every( Number.isFinite ) );

app.freeCam = true;
avatar.update( app, 0.2 );
assert.equal( avatar.head.visible, true );
assert.equal( avatar.model.current, 'idle_neutral_01', 'Frozen player velocity must not walk in place in free camera' );
assert.ok( avatar.group.position.distanceTo( player.position ) < 1e-6 );
app.camera.position.copy( player.position ).add( new Vector3( 0, 1.62, 0 ) );
avatar.update( app, 0 );
assert.equal( avatar.group.visible, false, 'F begins inside the head: do not reveal a face around the camera' );
assert.equal( avatar.head.visible, false );
app.camera.position.x += 2;
avatar.update( app, 0 );
assert.equal( avatar.group.visible, true, 'The full body reappears when the free camera moves away' );
assert.equal( avatar.head.visible, true );
app.freeCam = false;

player.mode = 'boat';
boat.quaternion.setFromAxisAngle( new Vector3( 0, 0, 1 ), 0.25 );
avatar.update( app, 1 / 60 );
assert.equal( avatar.model.current, 'player_helm' );
assert.equal( avatar.head.visible, true );
assert.ok( avatar.group.quaternion.angleTo( boat.quaternion ) < 1e-6 );
assert.ok( avatar.group.position.distanceTo( boat.toWorld( new Vector3( HOUSE.helmX, 0.23, HOUSE.seatZ + 0.04 ), new Vector3() ) ) < 1e-6 );
const knee = avatar.model.nodeWorld( 'Bip01 L Calf', new Vector3() );
const hip = avatar.model.nodeWorld( 'Bip01 L Thigh', new Vector3() );
const ankle = avatar.model.nodeWorld( 'Bip01 L Foot', new Vector3() );
assert.ok( knee.z - hip.z > 0.35, 'Sitting thighs point toward the console' );
assert.ok( knee.y - ankle.y > 0.3, 'Sitting calves point down to the deck' );
for ( const side of [ 'L', 'R' ] ) {

	const hand = avatar.model.nodeWorld( 'Bip01 ' + side + ' Hand', new Vector3() );
	assert.ok( hand.y + 0.23 < 1.4 && hand.z + HOUSE.seatZ + 0.04 > 0.79, 'Hands should reach toward the wheel rather than hover above the lap' );

}
player.camMode = 'first';
for ( const helmYaw of [ - 2.2, 0, 2.2 ] ) {

	player.helmYaw = helmYaw;
	avatar.update( app, 1 / 60 );
	assert.equal( avatar.head.visible, false );
	assert.ok( avatar.group.quaternion.angleTo( boat.quaternion ) < 1e-6, 'Looking around must not turn the torso away from the wheel' );

}

player.mode = 'deck';
app.freeCam = true;
avatar.update( app, 1 / 60 );
assert.ok( avatar.group.position.distanceTo( boat.toWorld( player.deckPos, new Vector3() ) ) < 1e-6 );
boat.position.x += 5;
avatar.update( app, 1 / 60 );
assert.ok( avatar.group.position.distanceTo( boat.toWorld( player.deckPos, new Vector3() ) ) < 1e-6, 'Free camera still carries the deck body with the boat' );

player.mode = 'swim';
app.freeCam = false;
avatar.update( app, 1 / 60 );
assert.equal( avatar.group.visible, false, 'Swimming and capsize transitions must not put a standing torso through the camera' );
app.freeCam = true;
avatar.update( app, 1 / 60 );
assert.equal( avatar.group.visible, true );
assert.ok( Math.abs( new Vector3( 0, 1, 0 ).applyQuaternion( avatar.group.quaternion ).y ) < 1e-6, 'External swimmer lies horizontally' );

player.mode = 'walk';
player.position.set( 61, 2.3, 36.5 );
app.freeCam = false;
avatar.update( app, 1 / 60 );
assert.equal( avatar.group.visible, true );
assert.ok( avatar.group.position.distanceTo( player.position ) < 0.29, 'Rescue/teleport must immediately move the visual body' );
const other = new PlayerAvatar( app );
assert.equal( await other.ready, true );
assert.notEqual( avatar.model, other.model );
assert.notEqual( avatar.model.jointBuffer, other.model.jointBuffer, 'NPC/player instances cannot share mutable skeletons' );

const warn = console.warn;
console.warn = () => {};
globalThis.__assetFile = async () => { throw new Error( 'simulated offline asset' ); };
try {

	const failed = new PlayerAvatar( app );
	assert.equal( await failed.ready, false );
	assert.equal( failed.group.visible, false );
	assert.doesNotThrow( () => failed.update( app, 1 / 60 ) );

} finally { console.warn = warn; }
console.log( 'PASS: player body loading, walk/helm poses, first-person head hiding, free camera, boat attachment, swim, rescue and offline fallback.' );

