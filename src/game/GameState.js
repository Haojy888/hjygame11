import { FISH, fishValue, fishLengthCm } from './FishTable.js';
import { defaultUpgrades, gearStats, nextLevel, UPGRADES, FUEL_PRICE } from './Gear.js';
import { ORDERS, CHAPTERS, GROUNDS, matchesOrder } from './Orders.js';
import { fishGround } from './Bites.js';
import { freshStory, normalizeStory } from './Story.js';
import { DEFAULT_BOAT_ID, getBoatProfile } from './Boats.js';

const SAVE_KEY = 'tidewater.save.v1';

// Everything the player owns: wallet, the fish in the cooler / hold, the fish log and the gear
// levels. Saved to localStorage (per browser) after every change; storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and the game runs without it.
export class GameState {

	constructor( storage = safeStorage() ) {

		this.storage = storage;
		this.money = 0;
		this.inventory = []; // { id, species, kg, cm, value, caughtAt (game hours), record }
		this.log = {}; // species -> { count, bestKg, bestCm }
		// the last addFish: { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept } (the catch card)
		this.lastCatch = null;
		this.upgrades = defaultUpgrades();
		this.fuel = null; // litres left (null = full tank)
		this.boatId = DEFAULT_BOAT_ID;
		this.orderIndex = 0;
		this._nextId = 1;
		this.orderDelivered = 0;
		this.legacyAccess = false;
		this.story = freshStory();
		this.listeners = new Set();

	}

	static load( storage = safeStorage() ) {

		const state = new GameState( storage );
		state.load();
		return state;

	}

	get stats() {

		return gearStats( this.upgrades );

	}

	get currentOrder() {

		return ORDERS[ this.orderIndex ] || null;

	}

	get campaignComplete() {

		return this.orderIndex >= ORDERS.length;

	}

	get currentChapter() {

		return CHAPTERS[ this.currentOrder?.chapter ?? CHAPTERS.length - 1 ];

	}

	isGroundUnlocked( id ) {

		return !! GROUNDS[ id ] && ( this.legacyAccess || this.orderIndex >= GROUNDS[ id ].unlockAfter );

	}

	canFishAt( habitat ) {

		return this.isGroundUnlocked( fishGround( habitat ) );

	}

	awardChapter( chapter ) {

		for ( const [ key, level ] of Object.entries( chapter.gear ) ) this.upgrades[ key ] = Math.max( this.upgrades[ key ], level );

	}

	// World interactions validate distance and movement mode before asking to advance.
	storyEvent( event, payload = {} ) {

		const s = this.story, hour = payload?.hour;
		const validHour = Number.isFinite( hour ) && hour >= 0 && hour < 24;
		if ( s.stage === 0 && event === 'accept' && this.orderIndex >= 1 ) s.stage = 1;
		else if ( s.stage === 1 && event === 'bottle' ) s.stage = 2;
		else if ( s.stage === 2 && [ 'chart', 'shore' ].includes( event ) && this.orderIndex >= 2 ) {

			s.route = event;
			s.stage = 3;

		} else if ( s.stage === 3 && event === 'survey' && validHour && ( s.route === 'chart' ? hour >= 17 && hour < 20 : hour >= 6 && hour < 18 ) ) s.stage = 4;
		else if ( s.stage === 4 && [ 'names', 'home' ].includes( event ) ) {

			s.ending = event;
			s.stage = 5;

		} else if ( s.stage === 5 && event === 'light' && validHour && ( hour >= 18 || hour < 6 ) ) {

			s.stage = 6;
			this.money += 150;

		} else return false;
		this.save();
		this.emit();
		return true;

	}

	get holdKg() {

		let kg = 0;
		for ( const f of this.inventory ) kg += f.kg;
		return kg;

	}

	get holdValue() {

		let v = 0;
		for ( const f of this.inventory ) v += f.value;
		return v;

	}

	// room in the cooler / hold for a fish of `kg`?
	fits( kg ) {

		return this.holdKg + kg <= this.stats.holdKg + 1e-6;

	}

	// store a caught fish; returns the entry, or null when the hold is full (it is logged either way).
	// A record beats an earlier catch of the species; the first one of a species is a new species.
	addFish( species, kg, timeOfDay = 12 ) {

		kg = Math.round( kg * 100 ) / 100;
		const cm = Math.round( fishLengthCm( species, kg ) );
		const logEntry = this.log[ species ] || ( this.log[ species ] = { count: 0, bestKg: 0 } );
		const newSpecies = logEntry.count === 0;
		const prevBestKg = logEntry.bestKg, prevBestCm = logEntry.bestCm ?? ( prevBestKg > 0 ? Math.round( fishLengthCm( species, prevBestKg ) ) : 0 );
		const record = ! newSpecies && kg > prevBestKg;
		logEntry.count ++;
		if ( kg > prevBestKg ) {

			logEntry.bestKg = kg;
			logEntry.bestCm = cm;

		}

		const value = fishValue( species, kg );
		const kept = this.fits( kg );
		this.lastCatch = { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept };
		if ( ! kept ) {

			this.save();
			this.emit();
			return null;

		}

		const f = { id: this._nextId ++, species, kg, cm, value, caughtAt: timeOfDay, record };
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// sell the given fish ids (all when omitted); returns the money made
	sell( ids = null ) {

		const keep = [], sold = [];
		for ( const f of this.inventory ) ( ids === null || ids.includes( f.id ) ? sold : keep ).push( f );
		let total = 0;
		for ( const f of sold ) total += f.value;
		let bonus = 0;
		const completedOrders = [], completedChapters = [], used = new Set();
		while ( this.currentOrder && used.size < sold.length ) {

			const order = this.currentOrder;
			const match = sold.findIndex( ( fish, i ) => ! used.has( i ) && matchesOrder( order, fish ) );
			if ( match < 0 ) break;
			used.add( match );
			this.orderDelivered ++;
			if ( this.orderDelivered < order.count ) continue;
			completedOrders.push( order );
			bonus += order.reward;
			this.orderIndex ++;
			this.orderDelivered = 0;
			const chapter = CHAPTERS[ order.chapter ];
			if ( this.orderIndex === chapter.end ) {

				this.awardChapter( chapter );
				completedChapters.push( chapter );

			}

		}
		this.inventory = keep;
		this.money += total + bonus;
		this.save();
		this.emit();
		return { total, count: sold.length, bonus, completedOrders, completedChapters };

	}

	release( id ) {

		this.inventory = this.inventory.filter( ( f ) => f.id !== id );
		this.save();
		this.emit();

	}

	// spend money (upgrade shop); false when it can't be afforded
	spend( amount ) {

		if ( amount > this.money ) return false;
		this.money -= amount;
		this.save();
		this.emit();
		return true;

	}

	// buy the next level of an upgrade track; returns the new level entry or null
	buy( key ) {

		if ( ! UPGRADES[ key ] ) return null;
		const next = nextLevel( this.upgrades, key );
		if ( ! next || next.cost > this.money ) return null;
		this.money -= next.cost;
		this.upgrades[ key ] = next.index;
		if ( key === 'fuel' ) this.fuel = null; // a new tank comes full
		this.save();
		this.emit();
		return next;

	}

	get fuelL() {

		return this.fuel === null ? this.stats.fuelL : Math.min( this.fuel, this.stats.fuelL );

	}

	// burn litres (no save: that happens when the boat stops or at the next sale / purchase)
	burn( litres ) {

		this.fuel = Math.max( 0, this.fuelL - litres );
		return this.fuel;

	}

	refuelCost() {

		return Math.ceil( ( this.stats.fuelL - this.fuelL ) * FUEL_PRICE );

	}

	// fill up as far as the money goes; returns litres bought
	refuel() {

		const missing = this.stats.fuelL - this.fuelL;
		const litres = Math.min( missing, Math.floor( this.money / FUEL_PRICE ) );
		if ( litres <= 0 ) return 0;
		this.money -= Math.ceil( litres * FUEL_PRICE );
		this.fuel = this.fuelL + litres;
		if ( this.fuel >= this.stats.fuelL - 1e-3 ) this.fuel = null;
		this.save();
		this.emit();
		return litres;

	}

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	emit() {

		for ( const fn of this.listeners ) fn( this );

	}

	toJSON() {

		return { v: 2, money: this.money, inventory: this.inventory, log: this.log, upgrades: this.upgrades, fuel: this.fuel, boatId: this.boatId, nextId: this._nextId, orderIndex: this.orderIndex, orderDelivered: this.orderDelivered, legacyAccess: this.legacyAccess, story: this.story };

	}

	fromJSON( d ) {

		if ( ! d || ! [ 1, 2 ].includes( d.v ) ) return false;
		this.money = Number.isFinite( d.money ) ? d.money : 0;
		this.inventory = Array.isArray( d.inventory ) ? d.inventory.filter( ( f ) => f && FISH[ f.species ] && Number.isFinite( f.kg ) ) : [];
		// saves from before lengths were recorded
		for ( const f of this.inventory ) if ( ! Number.isFinite( f.cm ) ) f.cm = Math.round( fishLengthCm( f.species, f.kg ) );
		this.log = d.log && typeof d.log === 'object' ? d.log : {};
		for ( const [ k, v ] of Object.entries( this.log ) ) if ( FISH[ k ] && v && v.bestKg > 0 && ! Number.isFinite( v.bestCm ) ) v.bestCm = Math.round( fishLengthCm( k, v.bestKg ) );
		this.upgrades = { ...defaultUpgrades(), ...( d.upgrades || {} ) };
		this.fuel = Number.isFinite( d.fuel ) ? d.fuel : null;
		this.boatId = typeof d.boatId === 'string' ? getBoatProfile( d.boatId ).id : DEFAULT_BOAT_ID;
		const savedIndex = Number.isSafeInteger( d.orderIndex ) && d.orderIndex >= 0 ? d.orderIndex : 0;
		// Old requests had six single-fish steps and no locked water. Keep earned access and money.
		this.orderIndex = d.v === 1 ? [ 0, 2, 3, 4, 5, 7, 8 ][ Math.min( 6, savedIndex ) ] : Math.min( ORDERS.length, savedIndex );
		this.orderDelivered = d.v === 2 && Number.isSafeInteger( d.orderDelivered ) && d.orderDelivered >= 0 && this.currentOrder
			? Math.min( this.currentOrder.count - 1, d.orderDelivered ) : 0;
		this.legacyAccess = d.v === 1 || d.legacyAccess === true;
		this.story = normalizeStory( d.story );
		for ( const chapter of CHAPTERS ) if ( this.orderIndex >= chapter.end ) this.awardChapter( chapter );
		this._nextId = Math.max( d.nextId | 0, ...this.inventory.map( ( f ) => f.id + 1 ), 1 );
		return true;

	}

	save() {

		if ( ! this.storage ) return false;
		try {

			this.storage.setItem( SAVE_KEY, JSON.stringify( this.toJSON() ) );
			return true;

		} catch ( e ) { return false; /* storage full or blocked: keep playing */ }

	}

	load() {

		if ( ! this.storage ) return false;
		try {

			const raw = this.storage.getItem( SAVE_KEY );
			return raw ? this.fromJSON( JSON.parse( raw ) ) : false;

		} catch ( e ) {

			return false;

		}

	}

	reset() {

		this.money = 0;
		this.inventory = [];
		this.log = {};
		this.upgrades = defaultUpgrades();
		this.fuel = null;
		this.boatId = DEFAULT_BOAT_ID;
		this.orderIndex = 0;
		this.orderDelivered = 0;
		this.legacyAccess = false;
		this.story = freshStory();
		this.save();
		this.emit();

	}

}

function safeStorage() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}
