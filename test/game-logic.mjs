// Plain-node tests of the fishing game logic (no GPU): bites, the catch fight, inventory, save.
import { FISH, FISH_IDS, fishValue, fishLengthCm } from '../src/game/FishTable.js';
import { habitatAt, fishGround, pickSpecies, rollWeight, biteDelay } from '../src/game/Bites.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { GameState } from '../src/game/GameState.js';
import { ORDERS, CHAPTERS, matchesOrder } from '../src/game/Orders.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
let seed = 12345;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

// ---- habitats and species
const spots = {
	sand: { depth: 0, reefDist: 200, pierDist: 200 },
	shallows: { depth: 1.5, reefDist: 200, pierDist: 80 },
	pier: { depth: 4, reefDist: 150, pierDist: 1 },
	reef: { depth: 5, reefDist: - 10, pierDist: 150 },
	deep: { depth: 40, reefDist: 300, pierDist: 400 },
};
for ( const [ name, s ] of Object.entries( spots ) ) {

	const h = habitatAt( s );
	const counts = {};
	for ( let i = 0; i < 2000; i ++ ) {

		const id = pickSpecies( h, 12, rng );
		if ( id ) counts[ id ] = ( counts[ id ] || 0 ) + 1;

	}

	const top = Object.entries( counts ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 5 ).map( ( [ k, v ] ) => `${ k } ${ ( v / 20 ).toFixed( 0 ) }%` ).join( ', ' );
	console.log( `     ${ name }: delay ~${ biteDelay( h, 12, () => 0.5 ).toFixed( 1 ) } s; ${ top || 'nothing' }` );

}
ok( pickSpecies( habitatAt( spots.sand ), 12, rng ) === null, 'nothing bites on dry sand' );
ok( biteDelay( habitatAt( spots.sand ), 12, rng ) === Infinity, 'no bite delay on sand' );
ok( fishGround( habitatAt( spots.pier ) ) === 'coast' && fishGround( habitatAt( spots.reef ) ) === 'reef' && fishGround( habitatAt( spots.deep ) ) === 'deep', 'pier, reef, and deep water map to campaign grounds' );
{

	let deepOnly = 0;
	for ( let i = 0; i < 500; i ++ ) if ( [ 'tuna', 'mahi', 'redSnapper', 'grouper', 'barracuda' ].includes( pickSpecies( habitatAt( spots.deep ), 12, rng ) ) ) deepOnly ++;
	ok( deepOnly === 500, 'deep water gives offshore species only' );
	let reefFish = 0;
	for ( let i = 0; i < 500; i ++ ) if ( FISH[ pickSpecies( habitatAt( spots.reef ), 12, rng ) ].habitat.reef ) reefFish ++;
	ok( reefFish > 400, `the reef gives mostly reef fish (${ reefFish / 5 }%)` );

}
{

	let tarponNight = 0, tarponDay = 0;
	for ( let i = 0; i < 4000; i ++ ) {

		if ( pickSpecies( habitatAt( spots.pier ), 22, rng ) === 'tarpon' ) tarponNight ++;
		if ( pickSpecies( habitatAt( spots.pier ), 12, rng ) === 'tarpon' ) tarponDay ++;

	}

	ok( tarponNight > tarponDay * 2, `tarpon bite at night (${ tarponNight } vs ${ tarponDay } by day)` );

}
for ( const id of FISH_IDS ) {

	const w = rollWeight( id, rng );
	if ( w < FISH[ id ].kg[ 0 ] || w > FISH[ id ].kg[ 1 ] ) ok( false, `weight in range for ${ id }` );

}
ok( fishValue( 'redSnapper', 5 ) > fishValue( 'redSnapper', 2 ), 'bigger fish is worth more' );

// ---- the fight: three players
const policies = {
	careful: ( g ) => g.tension < 0.68 && g.surge < 0.6,
	mash: () => true,
	idle: () => false,
};
const fight = ( species, kg, policy, lineKg = 7, reelSpeed = 1.1 ) => {

	const g = new CatchMinigame( { species, kg, lineKg, reelSpeed, distance: 18, rng } );
	let st = 'fighting';
	for ( let i = 0; i < 60 * 180 && st === 'fighting'; i ++ ) st = g.update( 1 / 60, policy( g ) );
	return { st, t: g.time };

};
const table = {};
for ( const [ species, kg ] of [ [ 'grunt', 0.8 ], [ 'yellowtail', 1.2 ], [ 'jack', 6 ], [ 'redSnapper', 5 ], [ 'tuna', 6 ], [ 'tuna', 13 ], [ 'tarpon', 35 ] ] ) {

	for ( const p of Object.keys( policies ) ) {

		const r = fight( species, kg, policies[ p ] );
		table[ `${ species }/${ p }` ] = r;
		console.log( `     ${ species } ${ kg } kg, ${ p }: ${ r.st } after ${ r.t.toFixed( 1 ) } s` );

	}

}
ok( table[ 'grunt/careful' ].st === 'caught' && table[ 'yellowtail/careful' ].st === 'caught', 'careful reeling lands small fish' );
ok( table[ 'jack/careful' ].st === 'caught', 'careful reeling lands a 6 kg jack on the starter line' );
ok( table[ 'tuna/mash' ].st === 'snapped' && table[ 'tarpon/mash' ].st === 'snapped', 'holding reel on a big fish snaps the line' );
ok( table[ 'tuna/careful' ].st !== 'caught' && fight( 'tuna', 13, policies.careful, 26, 1.6 ).st === 'caught', 'a 13 kg tuna needs the 30 lb line' );
ok( [ 'escaped' ].includes( table[ 'grunt/idle' ].st ), 'never reeling loses the fish' );
ok( fight( 'tarpon', 35, policies.careful ).st !== 'caught', 'a 35 kg tarpon beats the starter line' );
ok( fight( 'tarpon', 35, policies.careful, 50, 2.2 ).st === 'caught', 'the top line and reel land it' );

// ---- inventory, wallet, save round trip
const mem = new Map();
const storage = { getItem: ( k ) => mem.get( k ) ?? null, setItem: ( k, v ) => mem.set( k, v ) };
const s = new GameState( storage );
ok( s.stats.holdKg === 30, 'cooler holds 30 kg' );
const a = s.addFish( 'grunt', 0.84, 9.5 );
const b = s.addFish( 'yellowtail', 1.31, 10 );
ok( a && b && s.inventory.length === 2, 'fish go into the cooler' );
ok( s.addFish( 'tarpon', 40, 22 ) === null && s.log.tarpon.count === 1, 'a fish too big for the hold is logged but not kept' );
const value = s.holdValue;
const sale = s.sell( [ a.id ] );
ok( sale.count === 1 && sale.total === a.value && sale.bonus === ORDERS[ 0 ].reward && s.money === a.value + sale.bonus && s.inventory.length === 1, 'selling a matching fish pays its base price and request bonus' );
s.upgrades.hold = 1;
const s2 = new GameState( storage );
s.save();
ok( s2.load() && s2.money === s.money && s2.inventory.length === 1 && s2.log.grunt.bestKg === 0.84 && s2.stats.holdKg === 70, 'save / load round trip' );
ok( s2.addFish( 'grunt', 0.5 ).id > b.id, 'ids keep counting after a load' );
// ---- Joe's chapter campaign
{

	const requestStore = new Map();
	const requestStorage = { getItem: ( k ) => requestStore.get( k ) ?? null, setItem: ( k, v ) => requestStore.set( k, v ) };
	const requests = new GameState( requestStorage );
	ok( ORDERS.length === 8 && CHAPTERS.length === 4 && ORDERS.map( ( order ) => order.count ).join( ',' ) === '1,2,2,1,2,1,1,1'
		&& CHAPTERS.map( ( chapter ) => `${ chapter.start }-${ chapter.end }` ).join( ',' ) === '0-2,2-4,4-6,6-8'
		&& requests.currentOrder === ORDERS[ 0 ] && matchesOrder( ORDERS[ 0 ], { species: 'grunt', kg: 0.5 } )
		&& ! matchesOrder( ORDERS[ 0 ], { species: 'grunt', kg: 0.49 } ) && ! matchesOrder( ORDERS[ 0 ], { species: 'yellowtail', kg: 1 } ), 'campaign data and fish eligibility' );
	ok( requests.currentChapter === CHAPTERS[ 0 ] && ! requests.legacyAccess && requests.canFishAt( habitatAt( spots.pier ) )
		&& ! requests.canFishAt( habitatAt( spots.reef ) ) && ! requests.canFishAt( habitatAt( spots.deep ) ), 'a new player begins with only coastal fishing unlocked' );
	const small = requests.addFish( 'grunt', 0.49 );
	const other = requests.addFish( 'mullet', 0.4 );
	const wrong = requests.sell( [ small.id, other.id ] );
	ok( wrong.count === 2 && wrong.total === small.value + other.value && wrong.bonus === 0 && wrong.completedOrders.length === 0
		&& wrong.completedChapters.length === 0 && requests.orderIndex === 0 && requests.orderDelivered === 0, 'undersized or wrong-species fish sell without campaign progress' );
	const first = requests.addFish( 'grunt', 0.5 );
	const delivered = requests.sell( [ first.id ] );
	ok( delivered.count === 1 && delivered.total === first.value && delivered.bonus === 35 && delivered.completedOrders[ 0 ] === ORDERS[ 0 ]
		&& delivered.completedChapters.length === 0 && requests.money === small.value + other.value + first.value + 35
		&& requests.orderIndex === 1 && requests.orderDelivered === 0, 'selling the first qualifying fish pays base price and advances the campaign' );
	const partial = requests.addFish( 'mullet', 0.4 );
	const partSale = requests.sell( [ partial.id ] );
	ok( partSale.count === 1 && partSale.bonus === 0 && partSale.completedOrders.length === 0 && requests.orderIndex === 1
		&& requests.orderDelivered === 1 && ! requests.canFishAt( habitatAt( spots.reef ) ), 'quantity task records a partial delivery without awarding money or unlocking the reef' );
	const moneyAfterPart = requests.money;
	const repeat = requests.sell( [ partial.id ] );
	ok( repeat.count === 0 && repeat.bonus === 0 && repeat.completedOrders.length === 0 && requests.money === moneyAfterPart
		&& requests.orderIndex === 1 && requests.orderDelivered === 1, 'selling the same fish again cannot count it twice' );
	const loadedRequests = new GameState( requestStorage );
	ok( loadedRequests.load() && loadedRequests.orderIndex === 1 && loadedRequests.orderDelivered === 1
		&& loadedRequests.currentOrder === ORDERS[ 1 ] && loadedRequests.currentChapter === CHAPTERS[ 0 ] && ! loadedRequests.legacyAccess,
		'partial campaign progress survives save and load' );
	const second = loadedRequests.addFish( 'mullet', 0.5 );
	const chapter1 = loadedRequests.sell( [ second.id ] );
	ok( chapter1.bonus === 45 && chapter1.completedOrders[ 0 ] === ORDERS[ 1 ] && chapter1.completedChapters[ 0 ] === CHAPTERS[ 0 ]
		&& loadedRequests.orderIndex === 2 && loadedRequests.orderDelivered === 0 && loadedRequests.upgrades.line >= 1
		&& loadedRequests.canFishAt( habitatAt( spots.reef ) ) && ! loadedRequests.canFishAt( habitatAt( spots.deep ) ),
		'completing chapter one awards line gear once and unlocks the reef' );
	const extra = loadedRequests.addFish( 'mullet', 0.4 );
	const extraSale = loadedRequests.sell( [ extra.id ] );
	ok( extraSale.bonus === 0 && extraSale.completedChapters.length === 0 && loadedRequests.upgrades.line === 1
		&& loadedRequests.orderIndex === 2, 'repeating the previous task cannot claim its chapter reward again' );
	const chapter2Fish = [ [ 'parrot', 1.2 ], [ 'yellowtail', 0.7 ], [ 'yellowtail', 0.8 ] ].map( ( [ species, kg ] ) => loadedRequests.addFish( species, kg ) );
	const chapter2 = loadedRequests.sell( chapter2Fish.map( ( fish ) => fish.id ) );
	ok( chapter2.completedOrders.length === 2 && chapter2.completedOrders[ 0 ] === ORDERS[ 2 ] && chapter2.completedOrders[ 1 ] === ORDERS[ 3 ]
		&& chapter2.bonus === 55 + 80 && chapter2.completedChapters[ 0 ] === CHAPTERS[ 1 ] && loadedRequests.orderIndex === 4
		&& loadedRequests.upgrades.fishFinder >= 1 && loadedRequests.canFishAt( habitatAt( spots.deep ) ),
		'batch sale completes two tasks in order, awards chapter two gear, and unlocks deep water' );
	const chapter3Fish = [ [ 'tuna', 6 ], [ 'redSnapper', 3 ], [ 'redSnapper', 3.5 ] ].map( ( [ species, kg ] ) => loadedRequests.addFish( species, kg ) );
	const chapter3 = loadedRequests.sell( chapter3Fish.map( ( fish ) => fish.id ) );
	ok( chapter3.completedOrders.length === 2 && chapter3.completedChapters[ 0 ] === CHAPTERS[ 2 ] && loadedRequests.orderIndex === 6
		&& loadedRequests.upgrades.lights >= 1 && loadedRequests.upgrades.hold >= 1, 'chapter three awards deck lights and a larger hold' );
	const chapter4Fish = [ [ 'tarpon', 12 ], [ 'mahi', 8 ] ].map( ( [ species, kg ] ) => loadedRequests.addFish( species, kg ) );
	const chapter4 = loadedRequests.sell( chapter4Fish.map( ( fish ) => fish.id ) );
	ok( chapter4.completedOrders.length === 2 && chapter4.completedChapters[ 0 ] === CHAPTERS[ 3 ] && loadedRequests.orderIndex === 8
		&& loadedRequests.upgrades.engine >= 1 && loadedRequests.campaignComplete && loadedRequests.currentOrder === null,
		'chapter four awards the engine and the campaign ends without looping' );
	const finalSave = new GameState( requestStorage );
	ok( finalSave.load() && finalSave.orderIndex === 8 && finalSave.orderDelivered === 0 && finalSave.campaignComplete
		&& finalSave.currentOrder === null && finalSave.upgrades.engine >= 1 && ! finalSave.legacyAccess, 'completed campaign survives save and load' );
	const afterFinish = finalSave.addFish( 'grunt', 0.5 );
	const finishedSale = finalSave.sell( [ afterFinish.id ] );
	ok( finishedSale.bonus === 0 && finishedSale.completedOrders.length === 0 && finishedSale.completedChapters.length === 0
		&& finalSave.orderIndex === 8, 'post-campaign fish sell at base price without starting a new cycle' );
	finalSave.reset();
	const resetRequests = new GameState( requestStorage );
	ok( resetRequests.load() && resetRequests.money === 0 && resetRequests.orderIndex === 0 && resetRequests.orderDelivered === 0
		&& resetRequests.currentOrder === ORDERS[ 0 ] && ! resetRequests.legacyAccess && resetRequests.upgrades.line === 0
		&& resetRequests.canFishAt( habitatAt( spots.pier ) ) && ! resetRequests.canFishAt( habitatAt( spots.reef ) )
		&& ! resetRequests.canFishAt( habitatAt( spots.deep ) ), 'reset starts a new coastal campaign with no inherited rewards' );

	let writes = 0, changes = 0;
	const batch = new GameState( { setItem: () => { writes ++; } } );
	batch.upgrades.hold = 1; // keep the complete test haul in one sale
	const fish = [ [ 'tarpon', 12 ], [ 'mahi', 8 ], [ 'tuna', 6 ], [ 'redSnapper', 3 ], [ 'redSnapper', 3 ],
		[ 'parrot', 1.2 ], [ 'yellowtail', 0.7 ], [ 'yellowtail', 0.7 ], [ 'mullet', 0.4 ], [ 'mullet', 0.4 ], [ 'grunt', 0.5 ] ]
		.map( ( [ species, kg ] ) => batch.addFish( species, kg ) );
	const base = fish.reduce( ( sum, f ) => sum + f.value, 0 );
	const writesBeforeSale = writes;
	batch.onChange( () => { changes ++; } );
	const all = batch.sell();
	ok( fish.every( Boolean ) && all.count === fish.length && all.total === base && all.bonus === ORDERS.reduce( ( sum, order ) => sum + order.reward, 0 )
		&& all.completedOrders.every( ( order, i ) => order === ORDERS[ i ] ) && all.completedChapters.every( ( chapter, i ) => chapter === CHAPTERS[ i ] )
		&& all.completedOrders.length === 8 && all.completedChapters.length === 4 && batch.money === base + all.bonus
		&& batch.orderIndex === 8 && batch.campaignComplete && writes === writesBeforeSale + 1 && changes === 1,
		'sell all completes every task and chapter in one save and event, even with fish stored in reverse order' );

}
// ---- lengths and the catch card's record logic
{

	let sane = true;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		const lo = fishLengthCm( id, f.kg[ 0 ] ), hi = fishLengthCm( id, f.kg[ 1 ] );
		if ( ! ( lo > 5 && hi < 200 && hi > lo && typeof f.sci === 'string' ) ) sane = false;

	}

	ok( sane, 'every species has a scientific name and a plausible, increasing length (5–200 cm)' );
	ok( Math.abs( fishLengthCm( 'mahi', 10 ) - 108 ) < 3 && Math.abs( fishLengthCm( 'grunt', 0.84 ) - 36 ) < 2, 'length-weight: a 10 kg mahi ~108 cm, a 0.84 kg grunt ~36 cm' );
	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const c1 = st.addFish( 'jack', 3.2 ), i1 = st.lastCatch;
	ok( c1 && i1.newSpecies && ! i1.record && c1.cm === i1.cm && i1.cm > 50, 'first of a species: new species, not a record, length stored' );
	st.addFish( 'jack', 2.1 );
	const i2 = st.lastCatch;
	ok( ! i2.newSpecies && ! i2.record && i2.prevBestKg === 3.2 && st.log.jack.bestKg === 3.2, 'a smaller one: no record, best unchanged' );
	st.addFish( 'jack', 4.05 );
	const i3 = st.lastCatch;
	ok( i3.record && i3.prevBestKg === 3.2 && i3.prevBestCm === i1.cm && st.log.jack.bestKg === 4.05 && st.log.jack.bestCm === i3.cm, 'a bigger one: new record, previous best reported, log updated' );
	st.addFish( 'tarpon', 40 );
	ok( st.lastCatch.kept === false && st.lastCatch.newSpecies, 'a fish that does not fit: logged, card says released' );
	// a save from before lengths: inventory and log get lengths on load
	const old = { v: 1, money: 5, inventory: [ { id: 1, species: 'grunt', kg: 0.84, value: 6, caughtAt: 9 } ], log: { grunt: { count: 1, bestKg: 0.84 } }, upgrades: {}, fuel: null, nextId: 2 };
	const st2 = new GameState( { getItem: () => JSON.stringify( old ), setItem: () => {} } );
	ok( st2.load() && st2.inventory[ 0 ].cm === 36 && st2.log.grunt.bestCm === 36 && st2.orderIndex === 0
		&& st2.legacyAccess && st2.canFishAt( habitatAt( spots.reef ) ) && st2.canFishAt( habitatAt( spots.deep ) ),
		'old saves load with lengths and keep unrestricted fishing access' );
	const migration = [ [ 0, 0 ], [ 1, 2 ], [ 2, 3 ], [ 3, 4 ], [ 4, 5 ], [ 5, 7 ], [ 6, 8 ], [ 20, 8 ] ];
	for ( const [ oldIndex, newIndex ] of migration ) {

		const oldProgress = { ...old, orderIndex: oldIndex, inventory: [], money: 123 };
		const migrated = new GameState( { getItem: () => JSON.stringify( oldProgress ), setItem: () => {} } );
		ok( migrated.load() && migrated.orderIndex === newIndex && migrated.orderDelivered === 0 && migrated.money === 123
			&& migrated.legacyAccess && migrated.canFishAt( habitatAt( spots.reef ) ) && migrated.canFishAt( habitatAt( spots.deep ) )
			&& migrated.currentOrder === ( ORDERS[ newIndex ] ?? null ), `old save request ${ oldIndex } migrates without losing money or water access` );

	}
	const carried = new Map();
	const carriedStorage = { getItem: ( key ) => carried.get( key ) ?? null, setItem: ( key, value ) => carried.set( key, value ) };
	carriedStorage.setItem( 'tidewater.save.v1', JSON.stringify( { ...old, orderIndex: 5, inventory: [], money: 123 } ) );
	const migrated = new GameState( carriedStorage );
	ok( migrated.load() && migrated.orderIndex === 7 && migrated.upgrades.line >= 1 && migrated.upgrades.fishFinder >= 1
		&& migrated.upgrades.lights >= 1 && migrated.upgrades.hold >= 1 && migrated.money === 123,
		'completed chapters on an old save recover missing chapter gear without extra cash' );
	migrated.save();
	const persistedLegacy = new GameState( carriedStorage );
	ok( persistedLegacy.load() && persistedLegacy.legacyAccess && persistedLegacy.canFishAt( habitatAt( spots.deep ) )
		&& persistedLegacy.orderIndex === 7 && JSON.parse( carriedStorage.getItem( 'tidewater.save.v1' ) ).v === 2,
		'legacy water access survives conversion to the v2 save format' );
	persistedLegacy.reset();
	ok( ! persistedLegacy.legacyAccess && ! persistedLegacy.canFishAt( habitatAt( spots.reef ) )
		&& ! persistedLegacy.canFishAt( habitatAt( spots.deep ) ) && persistedLegacy.orderIndex === 0,
		'reset of an old profile starts the new coastal campaign' );

}
ok( new GameState( { getItem: () => { throw new Error( 'blocked' ); }, setItem: () => { throw new Error( 'blocked' ); } } ).load() === false, 'blocked storage does not throw' );
ok( s.spend( 1e9 ) === false, 'cannot spend more than you have' );
ok( Object.keys( defaultUpgrades() ).length === Object.keys( UPGRADES ).length && gearStats( defaultUpgrades() ).finder === false, 'gear stats' );
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	st.money = 100;
	ok( st.buy( 'reel' ) && st.upgrades.reel === 1 && st.money === 10 && st.stats.reelSpeed === 1.6, 'buying the reel upgrade' );
	ok( st.buy( 'reel' ) === null && st.upgrades.reel === 1, 'cannot buy what you cannot afford' );
	ok( st.fuelL === 40 && st.burn( 30 ) === 10 && st.refuelCost() === 45, 'fuel burns and costs to refill' );
	st.money = 20;
	ok( st.refuel() === 13 && st.money === 0 && Math.abs( st.fuelL - 23 ) < 1e-6, 'refuel stops when the money runs out' );
	st.money = 1000;
	ok( st.buy( 'fuel' ) && st.fuelL === 80, 'a new tank comes full' );
	ok( st.buy( 'fishFinder' ) && st.stats.finder === true && st.buy( 'fishFinder' ) === null, 'fish finder: one level' );

}
console.log( `value check ${ value }` );
console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
