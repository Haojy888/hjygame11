// CPU regression: optional deep-sea memories survive saves without altering the fishing campaign.
import assert from 'node:assert/strict';
import { GameState } from '../src/game/GameState.js';
import { SEA_JOURNAL_TITLE, freshSeaJournal, normalizeSeaJournal, seaJournalObjective, seaJournalDialogue, seaJournalEntries } from '../src/game/SeaJournal.js';

const clone = ( value ) => JSON.parse( JSON.stringify( value ) );
const events = [ 'accept', 'ruins', 'witness', 'wonder', 'peace', 'unknown', 'bottle', 'light', null, undefined, {}, [], 1 ];
function harness() {

	const saved = new Map();
	const storage = { writes: 0, getItem: ( key ) => saved.get( key ) ?? null, setItem( key, value ) { this.writes ++; saved.set( key, value ); } };
	const state = new GameState( storage );
	state.fromJSON( { v: 2, orderIndex: 4, money: 235, fuel: 7.5, story: { stage: 3, route: 'shore', ending: null } } );
	state.addFish( 'grunt', 0.7, 11 );
	return { state, storage };

}

function reject( state, event ) {

	const before = clone( state.toJSON() ), writes = state.storage?.writes;
	let emitted = false;
	const unsubscribe = state.onChange( () => { emitted = true; } );
	assert.equal( state.seaJournalEvent( event ), false );
	unsubscribe();
	assert.deepEqual( state.toJSON(), before, 'out-of-order and invalid inputs preserve progress, property and other stories' );
	assert.equal( state.storage?.writes, writes, 'rejected events do not write the save' );
	assert.equal( emitted, false, 'rejected events do not emit changes' );

}

const property = ( state ) => {

	const saved = clone( state.toJSON() );
	delete saved.seaJournal;
	return saved;

};

assert.equal( SEA_JOURNAL_TITLE, '深海的回声' );
assert.deepEqual( freshSeaJournal(), { stage: 0, ending: null } );
assert.notEqual( freshSeaJournal(), freshSeaJournal(), 'new games own separate journal objects' );
for ( const invalid of [ null, undefined, false, 'completed', 4, [], [ { stage: 4 } ] ] ) assert.deepEqual( normalizeSeaJournal( invalid ), freshSeaJournal() );
for ( const stage of [ - 1, 5, 0.5, '4', NaN, Infinity, {}, null ] ) assert.deepEqual( normalizeSeaJournal( { stage, ending: 'wonder' } ), freshSeaJournal() );
for ( const stage of [ 0, 1, 2, 3 ] ) assert.deepEqual( normalizeSeaJournal( { stage, ending: 'wonder' } ), { stage, ending: null }, 'premature endings cannot leak into the journal' );
for ( const ending of [ 'wonder', 'peace' ] ) assert.deepEqual( normalizeSeaJournal( { stage: 4, ending } ), { stage: 4, ending } );

{
	const { state } = harness();
	state.orderIndex = 3;
	assert.equal( seaJournalObjective( state ).location, null, 'locked deep water does not point to Joe\'s rumor' );
	for ( const kind of [ 'buyer', 'joe', 'shop', 'marta', 'unknown' ] ) assert.equal( seaJournalDialogue( state, kind ), null );
	assert.deepEqual( seaJournalEntries( state ), [] );
	for ( const event of events ) reject( state, event );
	state.legacyAccess = true;
	assert.equal( seaJournalObjective( state ).location, 'joe', 'old saves with earned water access may hear the rumor' );
	assert.equal( state.seaJournalEvent( 'accept' ), true );
}

// Each choice can be completed after a reload at every step, with no extra cash or campaign unlocks.
for ( const ending of [ 'wonder', 'peace' ] ) {

	const { state, storage } = harness();
	const initial = property( state );
	const path = [ 'accept', 'ruins', 'witness', ending ];
	const targets = [ 'joe', 'abyss', 'elder', 'joe', null ];
	let current = state, changes = 0;
	for ( let stage = 0; stage < path.length; stage ++ ) {

		assert.equal( seaJournalObjective( current ).location, targets[ stage ] );
		assert.equal( seaJournalEntries( current ).length, stage, 'the journal reveals only acquired memories' );
		for ( const kind of [ 'buyer', 'joe' ] ) assert.deepEqual( seaJournalDialogue( current, kind ).choices.map( ( choice ) => choice.id ), stage === 0 ? [ 'accept' ] : stage === 3 ? [ 'wonder', 'peace' ] : [] );
		for ( const kind of [ 'shop', 'marta' ] ) assert.deepEqual( seaJournalDialogue( current, kind )?.choices ?? [], [], 'Marta cannot change the voyage stage' );
		assert.equal( seaJournalDialogue( current, 'unknown' ), null );
		const allowed = stage === 3 ? [ 'wonder', 'peace' ] : [ path[ stage ] ];
		for ( const event of events.filter( ( event ) => ! allowed.includes( event ) ) ) reject( current, event );
		current.onChange( () => {

			changes ++;
			assert.equal( current.seaJournalEvent( path[ stage ] ), false, 'an observer reentering the same action cannot repeat it' );

		} );
		const writes = storage.writes;
		assert.equal( current.seaJournalEvent( path[ stage ] ), true );
		assert.equal( storage.writes, writes + 1 );
		assert.equal( current.seaJournal.stage, stage + 1 );
		assert.equal( changes, stage + 1 );
		assert.deepEqual( property( current ), initial, 'optional memories never spend or grant property, campaign progress or another story stage' );
		const reloaded = GameState.load( storage );
		assert.deepEqual( reloaded.seaJournal, current.seaJournal );
		assert.deepEqual( property( reloaded ), initial );
		current = reloaded;

	}
	assert.equal( current.seaJournal.ending, ending );
	assert.equal( seaJournalObjective( current ).location, null );
	assert.equal( seaJournalEntries( current ).length, 4 );
	assert.match( seaJournalEntries( current ).at( - 1 ).text, ending === 'wonder' ? /敬畏/ : /宁静/ );
	assert.notEqual( seaJournalEntries( current ).at( - 1 ).text, seaJournalEntries( { seaJournal: { stage: 4, ending: ending === 'wonder' ? 'peace' : 'wonder' } } ).at( - 1 ).text );
	for ( const kind of [ 'buyer', 'joe', 'shop', 'marta' ] ) assert.deepEqual( seaJournalDialogue( current, kind ).choices, [] );
	for ( const event of events ) reject( current, event );
	for ( const invalid of [ undefined, null, 'home', '__proto__', {}, [], false ] ) {

		const damaged = clone( current.toJSON() );
		damaged.seaJournal.ending = invalid;
		assert.equal( current.fromJSON( damaged ), true );
		assert.deepEqual( current.seaJournal, { stage: 4, ending: null }, 'a lost or polluted ending preserves completion' );
		assert.equal( seaJournalEntries( current ).length, 4 );
		assert.match( seaJournalObjective( current ).text, /平安/ );
		for ( const event of events ) reject( current, event );

	}
	current.reset();
	const reset = GameState.load( storage );
	assert.deepEqual( reset.seaJournal, freshSeaJournal() );
	assert.equal( reset.money, 0 );
	assert.equal( reset.orderIndex, 0 );
	assert.deepEqual( reset.inventory, [] );
	assert.deepEqual( reset.story, { stage: 0, route: null, ending: null } );

}

for ( const version of [ 1, 2 ] ) {

	const { state } = harness();
	const old = clone( state.toJSON() );
	old.v = version;
	delete old.seaJournal;
	state.seaJournal = { stage: 4, ending: 'wonder' };
	assert.equal( state.fromJSON( old ), true );
	assert.deepEqual( state.seaJournal, freshSeaJournal(), 'old saves start this optional story without resetting earned property' );
	assert.equal( state.money, old.money );
	assert.deepEqual( state.inventory, old.inventory );
	assert.deepEqual( state.story, old.story );
	assert.equal( state.fuel, old.fuel );
	assert.equal( state.toJSON().v, 2, 'save version and key migration remain unchanged' );

}

{
	const { state } = harness();
	assert.equal( state.seaJournalEvent( 'accept' ), true );
	const seaBefore = clone( state.seaJournal );
	assert.equal( state.storyEvent( 'survey', { hour: 12 } ), true );
	assert.equal( state.storyEvent( 'home' ), true );
	assert.equal( state.storyEvent( 'light', { hour: 22 } ), true );
	assert.deepEqual( state.seaJournal, seaBefore, 'the existing harbor story remains independently completable' );
	assert.equal( state.money, 385, 'only the pre-existing harbor story awards its original reward' );
}

{
	const state = new GameState( null );
	state.orderIndex = 4;
	for ( const event of [ 'accept', 'ruins', 'witness', 'peace' ] ) assert.equal( state.seaJournalEvent( event ), true );
	assert.equal( state.seaJournal.stage, 4, 'blocked storage does not prevent playing the optional story' );
	assert.equal( state.money, 0 );
}

console.log( 'Sea journal passed: unlock gate, both endings, ordered events, save interruption, old saves, damaged completion, reentry, reset, retained property and independent harbor story.' );
