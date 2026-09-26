// Exercise the gameplay wiring and real island terrain without constructing a GPU scene.
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';
import { Minimap } from '../src/game/Minimap.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { ORDERS } from '../src/game/Orders.js';
import { FISH } from '../src/game/FishTable.js';
import { fishGround, pickSpecies } from '../src/game/Bites.js';
import { STAND } from '../src/game/FishStand.js';

const terrain = new TerrainData();
const game = Object.create( Game.prototype );
game.state = new GameState( null );
game._pier = WORLD.pier;
game.messages = [];
game.toast = ( text ) => game.messages.push( text );
let coins = 0;
game.app = {
	settings: { timeOfDay: 12 }, terrainData: terrain,
	player: { mode: 'deck' }, boatCtl: { driven: false, position: { x: 55, z: 450 } },
	audio: { coin: () => coins ++ },
};
game.rod = {
	bobber: { x: 55, z: 43 }, depth: 0, dip: 0, lineOut: 15, state: 'floating',
	retrieve() { this.state = 'retrieving'; },
	hook() { this.state = 'fighting'; },
};
const moveBobber = ( x, z ) => {
	game.rod.bobber = { x, z };
	game.rod.depth = Math.max( 0, - terrain.heightAt( x, z ) );
	game.rod.state = 'floating';
	game.bite = null;
	game.fight = null;
};

for ( const [ x, z ] of [ [ - 78, 58 ], [ 55, 450 ] ] ) {
	moveBobber( x, z );
	game.onBobberLanded( 'water' );
	assert.equal( game.bite, null, 'locked casts cannot start a bite timer' );
	assert.equal( game.rod.state, 'retrieving' );
	for ( const phase of [ 'wait', 'nibble', 'take' ] ) {
		game.rod.state = 'floating';
		game.bite = { phase, t: 1, species: 'grunt', kg: 0.6 };
		game.updateBite( 1 / 60 );
		assert.equal( game.bite, null, `locked water cancels the ${ phase } phase` );
		assert.equal( game.rod.state, 'retrieving' );
	}
}
moveBobber( 55, 43 );
game.onBobberLanded( 'water' );
assert.equal( game.bite.phase, 'wait' );
assert.ok( Number.isFinite( game.bite.t ) );
moveBobber( 55, 450 );
game.rod.depth = 2; // A delayed water query must not disagree with the map and sonar.
assert.equal( fishGround( game.habitat() ), 'deep' );
game.bite = { phase: 'take', t: 1, species: 'tuna', kg: 6 };
game.strike();
assert.equal( game.fight, null, 'a strike cannot bypass the water access check' );
assert.equal( game.rod.state, 'retrieving' );

game.state.upgrades.fishFinder = 1;
game._sonarT = 0;
game.updateBoat( 0.5 );
assert.equal( game._sonar.fish, 0, 'sonar suppresses fish signals in locked water' );
game.state.orderIndex = 4;
game._sonarT = 0;
game.updateBoat( 0.5 );
assert.ok( game._sonar.fish > 0, 'sonar resumes when deep water unlocks' );

const map = Object.create( Minimap.prototype );
map.game = game;
map.goalLabel = {};
for ( let i = 0; i < ORDERS.length; i ++ ) {
	game.state.orderIndex = i;
	game.state.orderDelivered = 0;
	game.state.inventory = [];
	map.updateGoal();
	assert.equal( map.goalLabel.hidden, false );
	const p = map._goalPos, depth = - terrain.heightAt( p.x, p.z );
	const habitat = game.habitatAtPoint( p.x, p.z, depth );
	assert.ok( depth > 0.25, `${ ORDERS[ i ].id } navigation points into water` );
	assert.ok( game.state.canFishAt( habitat ), `${ ORDERS[ i ].id } target is already unlocked` );
	const preferredHour = { any: 12, day: 12, dawnDusk: 6.5, night: 22 }[ FISH[ ORDERS[ i ].species ].time ];
	let found = false;
	for ( let sample = 0; sample < 2000; sample ++ ) {
		if ( pickSpecies( habitat, preferredHour, () => ( sample + 0.5 ) / 2000 ) === ORDERS[ i ].species ) found = true;
	}
	assert.ok( found, `${ ORDERS[ i ].id } is catchable at its recommended position` );
	assert.ok( ORDERS[ i ].minKg <= FISH[ ORDERS[ i ].species ].kg[ 1 ] );
	for ( let count = 0; count < ORDERS[ i ].count; count ++ ) game.state.addFish( ORDERS[ i ].species, ORDERS[ i ].minKg );
	map.updateGoal();
	assert.deepEqual( map._goalPos, { x: STAND.x, z: STAND.z }, 'a complete load directs the player to Joe' );
}
game.state = new GameState( null );
game.state.orderIndex = 1;
game.state.upgrades.line = 3;
const first = game.state.addFish( 'mullet', 0.4 );
const second = game.state.addFish( 'mullet', 0.4 );
const partial = game.sell( [ first.id ] );
assert.equal( partial.completedChapters.length, 0 );
assert.equal( game.state.orderDelivered, 1 );
assert.equal( game.state.inventory[ 0 ].id, second.id );
const completed = game.sellAll();
assert.equal( completed.completedChapters.length, 1 );
assert.equal( game.state.orderIndex, 2 );
assert.equal( game.state.upgrades.line, 3, 'chapter gear rewards do not downgrade purchased equipment' );
assert.ok( game.state.isGroundUnlocked( 'reef' ) );
assert.ok( game.messages.some( ( message ) => message.includes( '初识渔港完成' ) ) );
assert.equal( coins, 2 );
game.sellAll();
assert.equal( coins, 2, 'an empty sale does not trigger a coin sound' );

game.state.orderIndex = ORDERS.length;
map.game = game;
map.updateGoal();
assert.equal( map._goalPos, null );
assert.equal( map.goalLabel.hidden, true );
game.state.addFish( 'grunt', 0.5 );
assert.equal( game.sellAll().bonus, 0, 'selling remains available after completing the campaign' );

game.state.reset();
for ( const q of map._richest( - 78, 58, 100 ) ) {
	assert.ok( game.state.canFishAt( game.habitatAtPoint( q.x, q.z, - terrain.heightAt( q.x, q.z ) ) ), 'finder markers exclude locked water' );
}
assert.ok( game.state.fromJSON( { v: 1, orderIndex: 4, money: 200, upgrades: { line: 3 } } ) );
assert.equal( game.state.currentOrder.species, 'tuna', 'old saves resume at their existing species objective' );
assert.ok( game.state.isGroundUnlocked( 'deep' ) );
assert.equal( game.state.upgrades.line, 3 );
assert.equal( game.state.money, 200 );
const saved = game.state.toJSON();
game.state.reset();
assert.ok( game.state.fromJSON( saved ) );
assert.ok( game.state.legacyAccess, 'grandfathered water access survives the next save' );

console.log( 'Campaign integration passed: water access, bites, sonar, eight real-terrain destinations, sales, chapter rewards, completion and legacy saves.' );
